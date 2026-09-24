// src/bsv/scan-records.ts — Scans the anchor address's history for 'nftgate' records.
//
// Phase 1's stand-in for an overlay indexer: an explorer can't search OP_RETURN
// contents, so every write also pays a minimal output to a shared anchor address,
// and discovery means walking that address's history and reading each transaction.
// Everything here goes through the ChainProvider parameter — nothing names
// WhatsOnChain — so an overlay indexer can later replace this without touching
// callers (the screen included).

import type { ChainProvider } from './chain-provider';
import type { AddressHistoryEntry } from './types';
import {
  classifyPlainPayment,
  decodeRecordPayload,
  findRecordsInTransaction,
  findTypedRecordsInTransaction,
  findUnreadableDataOutputs,
  type DecodedRecordPayload,
  type TypedRecordType,
} from './record';

const DEFAULT_LIMIT = 50;

export interface ScanRecordFound {
  txid: string;
  vout: number;
  version: number;
  decoded: DecodedRecordPayload;
  height: number; // 0 = unconfirmed
}

/** A typed (format-0x02) record — a License mint, write or transfer (mw-yo97u.14). */
export interface ScanRecordTyped {
  txid: string;
  vout: number;
  version: number;
  recordType: TypedRecordType;
  payloadBytes: number[];
  height: number; // 0 = unconfirmed
}

export interface ScanRecordUnreadable {
  txid: string;
  height: number; // 0 = unconfirmed
  couldNotRead: true;
  reason: string;
}

export interface ScanRecordPayment {
  txid: string;
  height: number; // 0 = unconfirmed
  payment: true;
  direction: 'received' | 'sent';
  satoshis: number;
}

export type ScanRecordEntry = ScanRecordFound | ScanRecordTyped | ScanRecordUnreadable | ScanRecordPayment;

export interface ScanRecordsOptions {
  limit?: number;
  /** Called after each transaction is fetched (success or failure), 1-indexed. For UI progress text. */
  onProgress?: (current: number, total: number) => void;
}

/** Unconfirmed (height 0 or undefined) sorts first, then by height descending. */
function byNewestFirst(a: AddressHistoryEntry, b: AddressHistoryEntry): number {
  const heightA = a.height ?? 0;
  const heightB = b.height ?? 0;
  if (heightA === 0 && heightB === 0) return 0;
  if (heightA === 0) return -1;
  if (heightB === 0) return 1;
  return heightB - heightA;
}

/**
 * Merges confirmed history with unconfirmed (mempool) history, keeping the confirmed
 * entry when a txid appears in both — WhatsOnChain drops a transaction from the
 * unconfirmed endpoint the moment it is mined, but the merge can race that.
 */
function mergeHistories(
  confirmed: AddressHistoryEntry[],
  unconfirmed: AddressHistoryEntry[],
): AddressHistoryEntry[] {
  const confirmedTxids = new Set(confirmed.map((entry) => entry.txid));
  const extra = unconfirmed.filter((entry) => !confirmedTxids.has(entry.txid));
  return [...confirmed, ...extra];
}

/**
 * Lists every 'nftgate' record paid to anchorAddress, newest first, alongside the plain
 * payments and unreadable data outputs also found at the anchor. Fetches one transaction
 * at a time — never concurrently — since the provider is rate-limited and already backs
 * off on 429 by itself. A transaction that fails to fetch becomes a single 'could not
 * read' entry and the scan continues; it never aborts the whole scan. A transaction with
 * no nftgate record renders as a plain payment when it pays (or spends from) the anchor
 * as an ordinary P2PKH output, or as 'could not read' (with a reason) when it carries a
 * data output the reader cannot decode instead.
 */
export async function scanRecords(
  provider: ChainProvider,
  anchorAddress: string,
  options: ScanRecordsOptions = {},
): Promise<ScanRecordEntry[]> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const [confirmedHistory, unconfirmedHistory] = await Promise.all([
    provider.getAddressHistory(anchorAddress),
    provider.getUnconfirmedAddressHistory
      ? provider.getUnconfirmedAddressHistory(anchorAddress)
      : Promise.resolve([]),
  ]);
  const history = mergeHistories(confirmedHistory, unconfirmedHistory);
  const toFetch = [...history].sort(byNewestFirst).slice(0, limit);

  const entries: ScanRecordEntry[] = [];

  for (let i = 0; i < toFetch.length; i++) {
    const item = toFetch[i];
    const height = item.height ?? 0;
    try {
      const txHex = await provider.getTransactionHex(item.txid);
      const records = findRecordsInTransaction(txHex);
      const typedRecords = findTypedRecordsInTransaction(txHex);

      if (records.length > 0 || typedRecords.length > 0) {
        for (const record of records) {
          entries.push({
            txid: item.txid,
            vout: record.vout,
            version: record.version,
            decoded: decodeRecordPayload(record.version, record.payloadBytes),
            height,
          });
        }
        for (const record of typedRecords) {
          entries.push({
            txid: item.txid,
            vout: record.vout,
            version: record.version,
            recordType: record.recordType,
            payloadBytes: record.payloadBytes,
            height,
          });
        }
      } else {
        const [unreadable] = findUnreadableDataOutputs(txHex);
        if (unreadable) {
          entries.push({ txid: item.txid, height, couldNotRead: true, reason: unreadable.reason });
        } else {
          const payment = classifyPlainPayment(txHex, anchorAddress);
          if (payment) {
            entries.push({ txid: item.txid, height, payment: true, direction: payment.direction, satoshis: payment.satoshis });
          }
        }
      }
    } catch {
      entries.push({ txid: item.txid, height, couldNotRead: true, reason: 'could not fetch the transaction' });
    }
    options.onProgress?.(i + 1, toFetch.length);
  }

  return entries;
}

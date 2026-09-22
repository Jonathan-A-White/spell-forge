// src/bsv/scan-records.ts — Scans the anchor address's history for 'nftgate' records.
//
// Phase 1's stand-in for an overlay indexer: an explorer can't search OP_RETURN
// contents, so every write also pays a minimal output to a shared anchor address,
// and discovery means walking that address's history and reading each transaction.
// Everything here goes through the ChainProvider parameter — nothing names
// WhatsOnChain — so an overlay indexer can later replace this without touching
// callers (the screen included).

import type { ChainProvider } from './chain-provider';
import type { AddressHistoryEntry } from '../contracts/types';
import { decodeRecordPayload, findRecordsInTransaction, type DecodedRecordPayload } from './record';

const DEFAULT_LIMIT = 50;

export interface ScanRecordFound {
  txid: string;
  vout: number;
  version: number;
  decoded: DecodedRecordPayload;
  height: number; // 0 = unconfirmed
}

export interface ScanRecordUnreadable {
  txid: string;
  height: number; // 0 = unconfirmed
  couldNotRead: true;
}

export type ScanRecordEntry = ScanRecordFound | ScanRecordUnreadable;

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
 * Lists every 'nftgate' record paid to anchorAddress, newest first. Fetches one
 * transaction at a time — never concurrently — since the provider is rate-limited
 * and already backs off on 429 by itself. A transaction that fails to fetch or
 * parse becomes a single 'could not read' entry and the scan continues; it never
 * aborts the whole scan.
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
      for (const record of findRecordsInTransaction(txHex)) {
        entries.push({
          txid: item.txid,
          vout: record.vout,
          version: record.version,
          decoded: decodeRecordPayload(record.version, record.payloadBytes),
          height,
        });
      }
    } catch {
      entries.push({ txid: item.txid, height, couldNotRead: true });
    }
    options.onProgress?.(i + 1, toFetch.length);
  }

  return entries;
}

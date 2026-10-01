// src/features/bsv-debug/gated-read.ts — The Read panel's reading of typed (format-0x02) W
// records (mw-jeswf.5): finds the wraps a reader may try and opens the W with the chosen key.

import { Transaction } from '@bsv/sdk';
import {
  decodeMintRecord,
  deriveStandInWrapKeyPair,
  deriveWrapKeyPair,
  fetchTokenWraps,
  findTypedRecordsInTransaction,
  mintRecordWraps,
  readGatedWrite,
} from '../../bsv';
import type { ChainProvider, GatedReadResult, KnownWrap } from '../../bsv';
import { bsvTokenRepo } from '../../data/repositories';

/** Who reads: this device's wrap key, or a fresh P-256 key made for the one read and never saved. */
export type ReadAs = 'device' | 'other';

export interface GatedWriteEntry {
  vout: number;
  result: GatedReadResult;
}

/** A License write spends its token at input 0 (rule (f)), so the walk back along input 0 reaches the mint. */
const MAX_LINEAGE_HOPS = 50;

/**
 * The wraps of the M record of the token this transaction's W belongs to: walks back along
 * input 0 until a transaction carries an M at output 2. Null when it cannot be found (a fetch
 * fails, or no M within the hop limit).
 */
async function wrapsOfOwnToken(txHex: string, provider: ChainProvider): Promise<KnownWrap[] | null> {
  try {
    let hex = txHex;
    for (let hop = 0; hop < MAX_LINEAGE_HOPS; hop++) {
      const sourceTxid = Transaction.fromHex(hex).inputs[0]?.sourceTXID;
      if (!sourceTxid) return null;
      hex = await provider.getTransactionHex(sourceTxid);
      const mint = decodeMintRecord(hex);
      if (mint) return mintRecordWraps(mint);
    }
  } catch {
    // not found: the caller falls back to this device's tokens
  }
  return null;
}

/** The wraps of the M records of this device's own License tokens; one that cannot be fetched is skipped. */
async function wrapsOfDeviceTokens(provider: ChainProvider): Promise<KnownWrap[]> {
  const wraps: KnownWrap[] = [];
  for (const token of await bsvTokenRepo.list()) {
    if (token.lock !== 'license') continue;
    try {
      wraps.push(...(await fetchTokenWraps(token.origin, provider)));
    } catch {
      // skip
    }
  }
  return wraps;
}

async function readerPrivateKey(readAs: ReadAs, walletWif: string | null): Promise<Uint8Array | null> {
  if (readAs === 'other') {
    // A fresh key, held in memory for this one read only.
    return (await deriveWrapKeyPair(crypto.getRandomValues(new Uint8Array(32)), 0)).privateKey;
  }
  return walletWif ? (await deriveStandInWrapKeyPair(walletWif)).privateKey : null;
}

/**
 * Reads every W in the transaction's typed records with the chosen key. The wraps tried come
 * from the mint record of the W's own token where it can be found, else from this device's
 * tokens. A device with no wallet key cannot read an encrypted W.
 */
export async function readGatedWrites(params: {
  txHex: string;
  provider: ChainProvider;
  readAs: ReadAs;
  walletWif: string | null;
}): Promise<GatedWriteEntry[]> {
  const { txHex, provider, readAs, walletWif } = params;
  const writes = findTypedRecordsInTransaction(txHex).filter((record) => record.recordType === 'W');
  if (writes.length === 0) return [];

  const needsKey = writes.some((write) => write.commitment !== null);
  const wrapPrivateKey = needsKey ? await readerPrivateKey(readAs, walletWif) : new Uint8Array(32);
  const wraps = needsKey && wrapPrivateKey ? ((await wrapsOfOwnToken(txHex, provider)) ?? (await wrapsOfDeviceTokens(provider))) : [];

  const entries: GatedWriteEntry[] = [];
  for (const write of writes) {
    if (write.commitment !== null && !wrapPrivateKey) {
      entries.push({
        vout: write.vout,
        result: { readable: false, reason: 'no-wrap-opens', message: 'cannot read: this device has no key' },
      });
      continue;
    }
    entries.push({ vout: write.vout, result: await readGatedWrite({ record: write, wraps, wrapPrivateKey: wrapPrivateKey as Uint8Array }) });
  }
  return entries;
}

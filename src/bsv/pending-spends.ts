// src/bsv/pending-spends.ts — Tracks outpoints spent by a broadcast that WhatsOnChain
// still double-lists as unspent until it confirms (see mw-0ym9.14). Pure functions only —
// persistence lives in bsvPendingSpendRepo.

import type { Utxo } from '../contracts/types';

export const PENDING_SPEND_TTL_MS = 24 * 60 * 60 * 1000;

export interface PendingSpendEntry {
  txid: string;
  outpoints: string[]; // "txid:vout"
  createdAt: Date;
}

export function outpointKey(utxo: { txid: string; vout: number }): string {
  return `${utxo.txid}:${utxo.vout}`;
}

/**
 * Drops an entry once its spent outpoints no longer appear among the current UTXOs
 * (WhatsOnChain stopped double-listing them — it confirmed or was replaced) or once
 * it is older than 24 hours. Everything else remains pending.
 */
export function reconcilePendingSpends(
  entries: PendingSpendEntry[],
  utxos: { txid: string; vout: number }[],
  now: Date,
): { remaining: PendingSpendEntry[]; dropped: string[] } {
  const liveOutpoints = new Set(utxos.map(outpointKey));
  const remaining: PendingSpendEntry[] = [];
  const dropped: string[] = [];

  for (const entry of entries) {
    const expired = now.getTime() - entry.createdAt.getTime() >= PENDING_SPEND_TTL_MS;
    const stillListed = entry.outpoints.some((outpoint) => liveOutpoints.has(outpoint));
    if (expired || !stillListed) {
      dropped.push(entry.txid);
    } else {
      remaining.push(entry);
    }
  }

  return { remaining, dropped };
}

/** Excludes every UTXO whose outpoint is spent by a still-pending entry. */
export function filterUtxosExcludingPending(
  utxos: Utxo[],
  entries: PendingSpendEntry[],
): { utxos: Utxo[]; excludedCount: number } {
  const excluded = new Set(entries.flatMap((entry) => entry.outpoints));
  const filtered = utxos.filter((utxo) => !excluded.has(outpointKey(utxo)));
  return { utxos: filtered, excludedCount: utxos.length - filtered.length };
}

/**
 * Coin selection for paying a transaction's fee: never a 1-satoshi UTXO (that's a token,
 * not fee money — spending it as a plain input would burn its origin) and never a UTXO
 * this wallet already knows is a token by outpoint. Shared by writeRecord and the mint.
 */
export function selectFeeUtxos(
  utxos: Utxo[],
  options: { exclude: { txid: string; vout: number }[] },
): Utxo[] {
  const excluded = new Set(options.exclude.map(outpointKey));
  return utxos.filter((utxo) => utxo.satoshis !== 1 && !excluded.has(outpointKey(utxo)));
}

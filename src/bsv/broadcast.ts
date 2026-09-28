// src/bsv/broadcast.ts — Broadcasts a locally built transaction whose spent outpoints are
// recorded as a pending spend first. Shared by writeRecord and sendSats.

import type { ChainProvider } from './chain-provider';
import { ChainError } from './chain-error';
import type { PendingSpendRepository } from './pending-spends';

// What a node says, via WhatsOnChain, when sent a transaction it already has — e.g.
// "257: txn-already-known", "txn-already-in-mempool", "Transaction already in the mempool".
const ALREADY_BROADCAST_PATTERN = /already[- ]?known|already in (the )?mempool|txn-already|transaction already/i;

/**
 * True when a broadcast failure only says the node already has this transaction. The
 * provider retries a rejected POST (a browser sees WhatsOnChain's CORS-less 429 as a
 * TypeError, mw-0ym9.17), so when the first attempt did reach WhatsOnChain and only its
 * reply was lost, the retry is answered this way: the broadcast succeeded.
 */
export function isAlreadyBroadcastError(error: unknown): boolean {
  return error instanceof Error && ALREADY_BROADCAST_PATTERN.test(error.message);
}

/** A 4xx reply: the node refused this transaction, so it is not in its mempool. */
function isDefinitiveRejection(error: unknown): boolean {
  return error instanceof ChainError && error.status !== undefined && error.status >= 400 && error.status < 500;
}

export interface BroadcastWithPendingSpendParams {
  provider: Pick<ChainProvider, 'broadcast'>;
  pendingSpendRepo: PendingSpendRepository;
  hex: string;
  txid: string; // the locally computed transaction.id('hex')
  outpoints: string[]; // "txid:vout" of exactly the inputs the transaction spends
}

/**
 * Records `outpoints` as a pending spend under the locally computed txid BEFORE
 * broadcasting, so a lost acknowledgement (the POST reached WhatsOnChain, its reply never
 * reached us) cannot lead the next write or send to reselect the same inputs into a
 * mempool conflict. Then broadcasts once, and:
 * - treats an "already known / already in mempool" rejection as success;
 * - removes the pending entry again only on a definitive 4xx rejection. A network failure,
 *   exhausted 429 retries or a 5xx leaves it pending, since the transaction may have been
 *   accepted; reconcilePendingSpends drops it once its outpoints stop being listed, or
 *   after PENDING_SPEND_TTL_MS;
 * - checks the txid the provider acknowledged against the computed one, which it returns.
 */
export async function broadcastWithPendingSpend(params: BroadcastWithPendingSpendParams): Promise<string> {
  const { provider, pendingSpendRepo, hex, txid, outpoints } = params;

  await pendingSpendRepo.add({ txid, outpoints, createdAt: new Date() });

  let acknowledgedTxid: string;
  try {
    acknowledgedTxid = (await provider.broadcast(hex)).trim();
  } catch (error) {
    if (isAlreadyBroadcastError(error)) return txid;
    if (isDefinitiveRejection(error)) await pendingSpendRepo.removeMany([txid]);
    throw error;
  }

  if (acknowledgedTxid.toLowerCase() !== txid.toLowerCase()) {
    throw new ChainError(
      `Broadcast acknowledged txid ${acknowledgedTxid.slice(0, 80) || '(empty)'}, not this transaction's own ${txid}`,
    );
  }
  return txid;
}

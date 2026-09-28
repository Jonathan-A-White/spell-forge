import { describe, it, expect } from 'vitest';
import { isAlreadyBroadcastError } from '../../src/bsv/broadcast';
import { ChainError } from '../../src/bsv/chain-error';

describe('isAlreadyBroadcastError', () => {
  it.each([
    'WhatsOnChain said 400: unexpected response code 500: 257: txn-already-known',
    'WhatsOnChain said 400: 18: txn-already-in-mempool',
    'WhatsOnChain said 400: Transaction already in the mempool',
    'WhatsOnChain said 400: transaction already known',
    'WhatsOnChain said 409: Already in mempool',
    'WhatsOnChain said 400: already-known',
  ])('recognizes the node saying it already has the transaction: %s', (message) => {
    expect(isAlreadyBroadcastError(new ChainError(message, { status: 400 }))).toBe(true);
  });

  it.each([
    'WhatsOnChain said 400: 258: txn-mempool-conflict',
    'WhatsOnChain said 400: bad-txns-inputs-missingorspent',
    'WhatsOnChain said 400: bad-txns-inputs-duplicate',
    'Could not reach WhatsOnChain after 3 tries (offline, or rate-limited: its 429 reply carries no CORS header)',
    'WhatsOnChain rate-limited the request (429) after retries',
  ])('does not mistake a real failure for success: %s', (message) => {
    expect(isAlreadyBroadcastError(new ChainError(message))).toBe(false);
  });
});

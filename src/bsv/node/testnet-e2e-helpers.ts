// src/bsv/node/testnet-e2e-helpers.ts — Helpers for the on-demand testnet e2e
// (tests/testnet/license-token.testnet.test.ts): reading and validating the funded
// harness key file, pacing calls to a ChainProvider, and polling for a broadcast
// outpoint to show up in a holder's UTXOs.
//
// Node-only (via testnet-keys.ts's fs/os/path): kept out of src/bsv/index.ts so the
// browser bundle never pulls this in.

import type { ChainProvider } from '../chain-provider';
import { defaultTestnetKeyFilePath, readTestnetKeyFile } from './testnet-keys';
import type { TestnetKeyEntry } from './testnet-keys';

export type DelayFn = (ms: number) => Promise<void>;

export const defaultDelay: DelayFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export interface HarnessKeyBalance {
  entry: TestnetKeyEntry;
  address: string;
  satoshis: number;
}

export interface HarnessBalances {
  issuer: HarnessKeyBalance;
  holderA: HarnessKeyBalance;
  holderB: HarnessKeyBalance;
}

/**
 * Reads the testnet key file and checks each of the three addresses has a positive
 * balance. Throws a readable error naming the key file path (if missing) or the
 * specific key (if unfunded) rather than skipping — a skipped test would hide a
 * broken harness.
 */
export async function requireFundedHarness(
  provider: Pick<ChainProvider, 'getUtxos'>,
  path: string = defaultTestnetKeyFilePath(),
): Promise<HarnessBalances> {
  const file = readTestnetKeyFile(path);
  const named: Array<['issuer' | 'holderA' | 'holderB', TestnetKeyEntry]> = [
    ['issuer', file.keys.issuer],
    ['holderA', file.keys.holderA],
    ['holderB', file.keys.holderB],
  ];

  const balances = {} as HarnessBalances;
  for (const [name, entry] of named) {
    const utxos = await provider.getUtxos(entry.address);
    const satoshis = utxos.reduce((sum, u) => sum + u.satoshis, 0);
    if (satoshis === 0) {
      throw new Error(
        `Harness key '${name}' (${entry.address}) has a zero balance in ${path} — fund it before running the testnet e2e.`,
      );
    }
    balances[name] = { entry, address: entry.address, satoshis };
  }
  return balances;
}

/**
 * Wraps a ChainProvider so consecutive calls through it are spaced at least
 * minIntervalMs apart (default 300ms), regardless of which method is called — a
 * courtesy to WhatsOnChain's rate limit on top of the provider's own 429 retries.
 */
export function withPacing(
  provider: ChainProvider,
  minIntervalMs = 300,
  delay: DelayFn = defaultDelay,
): ChainProvider {
  let calledBefore = false;

  async function paced<T>(fn: () => Promise<T>): Promise<T> {
    if (calledBefore) await delay(minIntervalMs);
    calledBefore = true;
    return fn();
  }

  return {
    getUtxos: (address) => paced(() => provider.getUtxos(address)),
    getTransactionHex: (txid) => paced(() => provider.getTransactionHex(txid)),
    broadcast: (txHex) => paced(() => provider.broadcast(txHex)),
    getAddressHistory: (address) => paced(() => provider.getAddressHistory(address)),
    ...(provider.getUnconfirmedAddressHistory
      ? {
          getUnconfirmedAddressHistory: (address: string) =>
            paced(() => provider.getUnconfirmedAddressHistory!(address)),
        }
      : {}),
  };
}

export interface PollForUtxoParams {
  provider: Pick<ChainProvider, 'getUtxos'>;
  address: string;
  outpoint: { txid: string; vout: number };
  intervalMs?: number;
  timeoutMs?: number;
  delay?: DelayFn;
}

/**
 * Polls provider.getUtxos(address) until it lists the given outpoint (unconfirmed is
 * fine — a successful broadcast is done, no confirmation is waited for), at
 * intervalMs apart, up to timeoutMs total. Rejects with a readable message naming
 * the outpoint, address and timeout once the budget of attempts is exhausted.
 */
export async function pollForUtxo(params: PollForUtxoParams): Promise<void> {
  const { provider, address, outpoint, intervalMs = 3000, timeoutMs = 60000, delay = defaultDelay } = params;
  const maxAttempts = Math.max(1, Math.floor(timeoutMs / intervalMs));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const utxos = await provider.getUtxos(address);
    const found = utxos.some((u) => u.txid === outpoint.txid && u.vout === outpoint.vout);
    if (found) return;
    if (attempt < maxAttempts) await delay(intervalMs);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for outpoint ${outpoint.txid}:${outpoint.vout} to appear in ${address}'s UTXOs`,
  );
}

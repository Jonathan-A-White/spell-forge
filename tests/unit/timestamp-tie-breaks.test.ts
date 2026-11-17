// mw-6ww.175.89: the lists that sorted on a timestamp (or a chain height) alone give one order for rows that tie,
// over 20 shuffles of the input (class equal-timestamp-sort-has-no-tiebreak).
import { describe, expect, it, vi } from 'vitest';
import { P2PKH, PrivateKey, Transaction } from '@bsv/sdk';
import { orderAttempts, orderSessions, type WordAttempt } from '../../src/features/dashboard/day-order';
import { newestTestFirst } from '../../src/features/word-lists/test-order';
import { deriveActive } from '../../src/shell/derive';
import { scanRecords } from '../../src/bsv/scan-records';
import { followLicenseToken } from '../../src/bsv/token-lineage';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { AddressHistoryEntry, SessionLog, TestResult, WordList } from '../../src/contracts/types';

const T = 1_700_000_000_000;

function shuffled<A>(items: readonly A[], seed: number): A[] {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The same answer for each of 20 shuffles of `rows`, and that answer. */
async function oneOrderOver20<R, O>(rows: readonly R[], order: (shuffle: R[]) => O | Promise<O>): Promise<O> {
  const first = await order(shuffled(rows, 1));
  for (let run = 2; run <= 20; run++) expect(await order(shuffled(rows, run))).toEqual(first);
  return first;
}

describe('day detail: attempts and sessions', () => {
  it('orders attempts at one millisecond the same way on every shuffle, and oldest first otherwise', async () => {
    const attempt = (wordId: string, offset = 0): WordAttempt => ({
      wordId,
      wordText: wordId,
      correct: true,
      responseTimeMs: 100,
      techniqueId: 't',
      struggled: false,
      scaffoldingUsed: false,
      timestamp: new Date(T + offset),
    });
    const rows = [attempt('a'), attempt('b'), attempt('c'), attempt('d'), attempt('late', 5), attempt('early', -5)];
    const ids = await oneOrderOver20(rows, (s) => orderAttempts(s).map((a) => a.wordId));
    expect(ids[0]).toBe('early');
    expect(ids[ids.length - 1]).toBe('late');
  });

  it('orders sessions starting at one millisecond the same way on every shuffle, and oldest first otherwise', async () => {
    const session = (id: string, offset = 0) =>
      ({ id, startedAt: new Date(T + offset), endedAt: null }) as unknown as SessionLog;
    const rows = [session('a'), session('b'), session('c'), session('d'), session('late', 5), session('early', -5)];
    const ids = await oneOrderOver20(rows, (s) => orderSessions(s).map((x) => x.id));
    expect(ids).toEqual(['early', 'a', 'b', 'c', 'd', 'late']);
  });
});

describe('test history', () => {
  it('orders tests on one date the same way on every shuffle, newest first otherwise', async () => {
    const test = (id: string, offset = 0) => ({ id, testDate: new Date(T + offset) }) as unknown as TestResult;
    const rows = [test('a'), test('b'), test('c'), test('d'), test('late', 5), test('early', -5)];
    const ids = await oneOrderOver20(rows, (s) => newestTestFirst(s).map((x) => x.id));
    expect(ids[0]).toBe('late');
    expect(ids[ids.length - 1]).toBe('early');
  });
});

describe('days to the nearest test', () => {
  it('is the same for lists with one test date, in any order, and counts from the nearest', async () => {
    const list = (id: string, offset: number) =>
      ({ id, active: true, archived: false, testDate: new Date(T + offset) }) as unknown as WordList;
    const rows = [list('a', 3 * 86400000), list('b', 3 * 86400000), list('c', 9 * 86400000), list('d', 3 * 86400000)];
    const days = await oneOrderOver20(rows, (s) => deriveActive(s, [], [], T).daysUntilTest);
    expect(days).toBe(3);
  });
});

describe('the chain history', () => {
  const holder = PrivateKey.fromRandom().toAddress('testnet');
  const tx = new Transaction();
  tx.addOutput({ lockingScript: new P2PKH().lock(holder), satoshis: 1 });
  const hex = tx.toHex();
  const origin = { txid: tx.id('hex'), vout: 0 };

  const history: AddressHistoryEntry[] = [
    ...['a', 'b', 'c', 'd'].map((c) => ({ txid: c.repeat(64), height: 100 })),
    ...['e', 'f'].map((c) => ({ txid: c.repeat(64), height: 0 })),
    { txid: '1'.repeat(64), height: 200 },
  ];

  const providerFor = (entries: AddressHistoryEntry[], fetched: string[]): ChainProvider => ({
    getUtxos: vi.fn().mockResolvedValue([]),
    getTransactionHex: vi.fn((txid: string) => {
      fetched.push(txid);
      return Promise.resolve(hex);
    }),
    broadcast: vi.fn(),
    getAddressHistory: vi.fn().mockResolvedValue(entries),
  });

  it('scanRecords reads equal-height entries in one order, unconfirmed first then the highest', async () => {
    const order = await oneOrderOver20(history, async (s) => {
      const fetched: string[] = [];
      await scanRecords(providerFor(s, fetched), holder);
      return fetched;
    });
    expect(order.map((t) => t[0])).toEqual(['f', 'e', '1', 'd', 'c', 'b', 'a']);
  });

  it('followLicenseToken tries equal-height entries in one order, unconfirmed first then the highest', async () => {
    const order = await oneOrderOver20(history, async (s) => {
      const fetched: string[] = [];
      await followLicenseToken({ origin, provider: providerFor(s, fetched) });
      return fetched.filter((t) => t !== origin.txid);
    });
    expect(order.map((t) => t[0])).toEqual(['f', 'e', '1', 'd', 'c', 'b', 'a']);
  });
});

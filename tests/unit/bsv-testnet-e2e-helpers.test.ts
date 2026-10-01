// tests/unit/bsv-testnet-e2e-helpers.test.ts — Harness-reading, pacing and polling
// helpers for the testnet e2e, tested against fakes only (never the network).
// Fixture transactions are built offline with @bsv/sdk.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestnetKeyFile, readTestnetKeyFile } from '../../src/bsv/node/testnet-keys';
import type { TestnetKeyEntry } from '../../src/bsv/node/testnet-keys';
import { LockingScript, Transaction, UnlockingScript } from '@bsv/sdk';
import {
  requireFundedHarness,
  withPacing,
  pollForUtxo,
  waitForTransactionHex,
  getSpendableUtxos,
} from '../../src/bsv/node/testnet-e2e-helpers';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { Utxo } from '../../src/contracts/types';

let counter = 0;
function fakeGenerate(): TestnetKeyEntry {
  counter += 1;
  return { wif: `wif-${counter}`, address: `mtestaddr${counter}` };
}

function makeTempKeyFile(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'sf-bsv-testnet-e2e-'));
  const path = join(dir, 'keys.json');
  createTestnetKeyFile(path, fakeGenerate);
  return { dir, path };
}

function providerWithUtxos(utxosByAddress: Record<string, Utxo[]>): Pick<ChainProvider, 'getUtxos'> {
  return {
    getUtxos: vi.fn((address: string) => Promise.resolve(utxosByAddress[address] ?? [])),
  };
}

describe('requireFundedHarness', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('fails naming the path when the key file is missing', async () => {
    dir = mkdtempSync(join(tmpdir(), 'sf-bsv-testnet-e2e-missing-'));
    const missingPath = join(dir, 'nope.json');
    const provider = providerWithUtxos({});

    await expect(requireFundedHarness(provider, missingPath)).rejects.toThrow(
      new RegExp(missingPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
  });

  it('fails naming the specific key when its balance is zero', async () => {
    const made = makeTempKeyFile();
    dir = made.dir;
    const file = readTestnetKeyFile(made.path);
    const provider = providerWithUtxos({
      [file.keys.issuer.address]: [{ txid: 't1', vout: 0, satoshis: 1000 }],
      [file.keys.holderA.address]: [],
      [file.keys.holderB.address]: [{ txid: 't3', vout: 0, satoshis: 1000 }],
    });

    await expect(requireFundedHarness(provider, made.path)).rejects.toThrow(/holderA/);
  });

  it('resolves with each key\'s address and total satoshis when all three are funded', async () => {
    const made = makeTempKeyFile();
    dir = made.dir;
    const file = readTestnetKeyFile(made.path);
    const provider = providerWithUtxos({
      [file.keys.issuer.address]: [{ txid: 't1', vout: 0, satoshis: 1000 }],
      [file.keys.holderA.address]: [{ txid: 't2', vout: 0, satoshis: 500 }, { txid: 't2', vout: 1, satoshis: 500 }],
      [file.keys.holderB.address]: [{ txid: 't3', vout: 0, satoshis: 2000 }],
    });

    const balances = await requireFundedHarness(provider, made.path);

    expect(balances.issuer).toEqual({ entry: file.keys.issuer, address: file.keys.issuer.address, satoshis: 1000 });
    expect(balances.holderA.satoshis).toBe(1000);
    expect(balances.holderB.satoshis).toBe(2000);
  });
});

describe('withPacing', () => {
  it('does not delay before the first call', async () => {
    const delay = vi.fn().mockResolvedValue(undefined);
    const provider: ChainProvider = {
      getUtxos: vi.fn().mockResolvedValue([]),
      getTransactionHex: vi.fn().mockResolvedValue('hex'),
      broadcast: vi.fn().mockResolvedValue('txid'),
      getAddressHistory: vi.fn().mockResolvedValue([]),
    };
    const paced = withPacing(provider, 300, delay);

    await paced.getUtxos('addr');

    expect(delay).not.toHaveBeenCalled();
  });

  it('delays at least minIntervalMs between two consecutive calls, of any method', async () => {
    const delay = vi.fn().mockResolvedValue(undefined);
    const provider: ChainProvider = {
      getUtxos: vi.fn().mockResolvedValue([]),
      getTransactionHex: vi.fn().mockResolvedValue('hex'),
      broadcast: vi.fn().mockResolvedValue('txid'),
      getAddressHistory: vi.fn().mockResolvedValue([]),
    };
    const paced = withPacing(provider, 300, delay);

    await paced.getUtxos('addr');
    await paced.getTransactionHex('txid');
    await paced.broadcast('hex');

    expect(delay).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(300);
  });

  it('omits getUnconfirmedAddressHistory when the wrapped provider does not implement it', () => {
    const provider: ChainProvider = {
      getUtxos: vi.fn(),
      getTransactionHex: vi.fn(),
      broadcast: vi.fn(),
      getAddressHistory: vi.fn(),
    };
    const paced = withPacing(provider);

    expect(paced.getUnconfirmedAddressHistory).toBeUndefined();
  });

  it('paces getUnconfirmedAddressHistory when the wrapped provider implements it', async () => {
    const delay = vi.fn().mockResolvedValue(undefined);
    const provider: ChainProvider = {
      getUtxos: vi.fn().mockResolvedValue([]),
      getTransactionHex: vi.fn(),
      broadcast: vi.fn(),
      getAddressHistory: vi.fn(),
      getUnconfirmedAddressHistory: vi.fn().mockResolvedValue([]),
    };
    const paced = withPacing(provider, 300, delay);

    await paced.getUtxos('addr');
    await paced.getUnconfirmedAddressHistory!('addr');

    expect(delay).toHaveBeenCalledTimes(1);
    expect(provider.getUnconfirmedAddressHistory).toHaveBeenCalledWith('addr');
  });
});

describe('pollForUtxo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after three calls when the outpoint appears on the third', async () => {
    vi.useFakeTimers();
    const outpoint = { txid: 'abc123', vout: 0 };
    const getUtxos = vi
      .fn<(address: string) => Promise<Utxo[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ txid: 'other', vout: 0, satoshis: 1 }])
      .mockResolvedValueOnce([{ txid: 'abc123', vout: 0, satoshis: 1 }]);
    const provider = { getUtxos };

    const promise = pollForUtxo({ provider, address: 'addr', outpoint, intervalMs: 10, timeoutMs: 100 });
    await vi.runAllTimersAsync();
    await promise;

    expect(getUtxos).toHaveBeenCalledTimes(3);
  });

  it('rejects with a readable message once the deadline passes and the outpoint never appears', async () => {
    vi.useFakeTimers();
    const outpoint = { txid: 'never', vout: 0 };
    const getUtxos = vi.fn<(address: string) => Promise<Utxo[]>>().mockResolvedValue([]);
    const provider = { getUtxos };

    const promise = pollForUtxo({ provider, address: 'addr', outpoint, intervalMs: 10, timeoutMs: 30 });
    const assertion = expect(promise).rejects.toThrow(/Timed out after 30ms waiting for outpoint never:0 to appear in addr/);
    await vi.runAllTimersAsync();
    await assertion;

    expect(getUtxos).toHaveBeenCalledTimes(3);
  });
});

describe('waitForTransactionHex', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves once the provider serves the hex, after earlier 404s', async () => {
    vi.useFakeTimers();
    const getTransactionHex = vi
      .fn<(txid: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error('404'))
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce('00');

    const promise = waitForTransactionHex({ getTransactionHex }, 'abc', 10, 100);
    await vi.runAllTimersAsync();
    await promise;

    expect(getTransactionHex).toHaveBeenCalledTimes(3);
  });

  it('rejects naming the txid and the last error once the deadline passes', async () => {
    vi.useFakeTimers();
    const getTransactionHex = vi.fn<(txid: string) => Promise<string>>().mockRejectedValue(new Error('404 not found'));

    const promise = waitForTransactionHex({ getTransactionHex }, 'never', 10, 30);
    const assertion = expect(promise).rejects.toThrow(/Timed out after 30ms waiting for WhatsOnChain to serve \/tx\/never\/hex: 404 not found/);
    await vi.runAllTimersAsync();
    await assertion;

    expect(getTransactionHex).toHaveBeenCalledTimes(3);
  });
});

describe('getSpendableUtxos', () => {
  const funding = 'aa'.repeat(32);
  const other = 'bb'.repeat(32);

  /** A mempool transaction spending funding:0, so WhatsOnChain's /unspent may still list funding:0. */
  function spenderOf(txid: string, vout: number): Transaction {
    const tx = new Transaction();
    tx.addInput({ sourceTXID: txid, sourceOutputIndex: vout, unlockingScript: new UnlockingScript(), sequence: 0xffffffff });
    tx.addOutput({ lockingScript: new LockingScript(), satoshis: 0 });
    return tx;
  }

  function provider(utxos: Utxo[], pending: Transaction[]): Pick<
    ChainProvider,
    'getUtxos' | 'getTransactionHex' | 'getUnconfirmedAddressHistory'
  > {
    const byTxid = new Map(pending.map((tx) => [tx.id('hex'), tx]));
    return {
      getUtxos: vi.fn(() => Promise.resolve(utxos)),
      getUnconfirmedAddressHistory: vi.fn(() => Promise.resolve(pending.map((tx) => ({ txid: tx.id('hex'), height: 0 })))),
      getTransactionHex: vi.fn((txid: string) => Promise.resolve(byTxid.get(txid)!.toHex())),
    };
  }

  it('drops an outpoint that a transaction still in the address\'s mempool history spends', async () => {
    const utxos = [
      { txid: funding, vout: 0, satoshis: 5000 },
      { txid: other, vout: 1, satoshis: 7000 },
    ];
    const result = await getSpendableUtxos(provider(utxos, [spenderOf(funding, 0)]), 'addr');
    expect(result).toEqual([{ txid: other, vout: 1, satoshis: 7000 }]);
  });

  it('lists an outpoint listed twice only once', async () => {
    const utxos = [
      { txid: other, vout: 1, satoshis: 7000 },
      { txid: other, vout: 1, satoshis: 7000 },
    ];
    const result = await getSpendableUtxos(provider(utxos, []), 'addr');
    expect(result).toEqual([{ txid: other, vout: 1, satoshis: 7000 }]);
  });

  it('keeps every listed outpoint when the provider has no mempool history route', async () => {
    const utxos = [{ txid: funding, vout: 0, satoshis: 5000 }];
    const { getUtxos, getTransactionHex } = provider(utxos, [spenderOf(funding, 0)]);
    const result = await getSpendableUtxos({ getUtxos, getTransactionHex }, 'addr');
    expect(result).toEqual(utxos);
  });
});

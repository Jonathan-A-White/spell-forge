// tests/unit/bsv-testnet-e2e-helpers.test.ts — Harness-reading, pacing and polling
// helpers for the testnet e2e, tested against fakes only (never the network).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestnetKeyFile, readTestnetKeyFile } from '../../src/bsv/node/testnet-keys';
import type { TestnetKeyEntry } from '../../src/bsv/node/testnet-keys';
import { requireFundedHarness, withPacing, pollForUtxo } from '../../src/bsv/node/testnet-e2e-helpers';
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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/data/db';
import { bsvWalletRepo } from '../../src/data/repositories';
import { generateTestnetKey } from '../../src/bsv/keys';
import type { BsvWalletKey } from '../../src/contracts/types';
import { PrivateKey } from '@bsv/sdk';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function makeKey(overrides: Partial<BsvWalletKey> = {}): BsvWalletKey {
  return {
    id: 'wallet-1',
    kind: 'wif',
    network: 'testnet',
    material: 'cQfJvfEVAsQXCAcxzDBB3kmEwLtiZaGUHL9sXQJF6kjaDwJDvv2V',
    address: 'mpHF9jLctkpJfgBkksYVbdVvhqcYm5MS2b',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('bsvWalletRepo', () => {
  it('round-trips a saved key through getCurrent', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');

    const key = makeKey();
    await bsvWalletRepo.save(key);
    const current = await bsvWalletRepo.getCurrent();

    expect(current).toEqual(key);
    expect(current?.kind).toBe('wif');
    expect(current?.network).toBe('testnet');
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('getCurrent returns undefined on an empty database', async () => {
    expect(await bsvWalletRepo.getCurrent()).toBeUndefined();
  });

  it('wipe removes the stored key', async () => {
    await bsvWalletRepo.save(makeKey());
    await bsvWalletRepo.wipe();

    expect(await bsvWalletRepo.getCurrent()).toBeUndefined();
  });
});

describe('generateTestnetKey', () => {
  it('produces an address starting with m or n', () => {
    const fetchSpy = vi.spyOn(global, 'fetch');

    const key = generateTestnetKey();

    expect(key.address[0]).toMatch(/[mn]/);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('the WIF decodes to a key whose testnet address equals the stored address', () => {
    const key = generateTestnetKey();

    const decoded = PrivateKey.fromWif(key.material);
    expect(decoded.toAddress([0x6f])).toBe(key.address);
  });

  it('two calls give different keys', () => {
    const a = generateTestnetKey();
    const b = generateTestnetKey();

    expect(a.material).not.toBe(b.material);
    expect(a.address).not.toBe(b.address);
  });
});

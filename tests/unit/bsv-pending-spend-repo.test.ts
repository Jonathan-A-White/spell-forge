import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/data/db';
import { bsvWalletRepo, bsvPendingSpendRepo } from '../../src/data/repositories';
import type { BsvWalletKey } from '../../src/contracts/types';

const storedKey: BsvWalletKey = {
  id: 'wallet-1',
  kind: 'wif',
  network: 'testnet',
  material: 'cQfJvfEVAsQXCAcxzDBB3kmEwLtiZaGUHL9sXQJF6kjaDwJDvv2V',
  address: 'mpHF9jLctkpJfgBkksYVbdVvhqcYm5MS2b',
  createdAt: new Date('2026-01-01'),
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('bsvPendingSpendRepo', () => {
  it('opens at the new schema version with the existing bsvWallet row intact', async () => {
    await bsvWalletRepo.save(storedKey);

    expect(db.verno).toBeGreaterThanOrEqual(10);
    const wallet = await bsvWalletRepo.getCurrent();
    expect(wallet).toEqual(storedKey);
    expect(await bsvPendingSpendRepo.getAll()).toEqual([]);
  });

  it('adds, lists, and removes pending spend entries', async () => {
    const entry = { txid: 'T1', outpoints: ['X:1', 'X:2'], createdAt: new Date('2026-09-22T14:00:00Z') };

    await bsvPendingSpendRepo.add(entry);
    expect(await bsvPendingSpendRepo.getAll()).toEqual([entry]);

    await bsvPendingSpendRepo.removeMany(['T1']);
    expect(await bsvPendingSpendRepo.getAll()).toEqual([]);
  });

  it('persists pending entries across a fresh open of the same database', async () => {
    const entry = { txid: 'T1', outpoints: ['X:1'], createdAt: new Date('2026-09-22T14:00:00Z') };
    await bsvPendingSpendRepo.add(entry);

    db.close();
    await db.open();

    expect(await bsvPendingSpendRepo.getAll()).toEqual([entry]);
  });
});

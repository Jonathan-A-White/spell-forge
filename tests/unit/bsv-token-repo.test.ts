import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/data/db';
import { bsvTokenRepo } from '../../src/data/repositories';
import type { LicenseToken } from '../../src/bsv/license-token';

const tokenA: LicenseToken = {
  origin: { txid: 'a'.repeat(64), vout: 0 },
  current: { txid: 'a'.repeat(64), vout: 0 },
  holderAddress: 'mHolderA',
  collectionId: 'spellforge-leaderboard-testnet',
};

const tokenB: LicenseToken = {
  origin: { txid: 'b'.repeat(64), vout: 0 },
  current: { txid: 'b'.repeat(64), vout: 0 },
  holderAddress: 'mHolderB',
  collectionId: 'spellforge-leaderboard-testnet',
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('bsvTokenRepo', () => {
  it('puts and lists tokens, newest first', async () => {
    await bsvTokenRepo.put(tokenA);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await bsvTokenRepo.put(tokenB);

    const listed = await bsvTokenRepo.list();
    expect(listed).toEqual([tokenB, tokenA]);
  });

  it('updates the current outpoint and holder address for a token by its origin', async () => {
    await bsvTokenRepo.put(tokenA);

    const newCurrent = { txid: 'c'.repeat(64), vout: 0 };
    await bsvTokenRepo.updateCurrent(tokenA.origin, newCurrent, 'mNewHolder');

    const [updated] = await bsvTokenRepo.list();
    expect(updated).toEqual({
      ...tokenA,
      current: newCurrent,
      holderAddress: 'mNewHolder',
    });
  });

  it('does nothing when updating a token whose origin was never minted', async () => {
    await expect(
      bsvTokenRepo.updateCurrent({ txid: 'z'.repeat(64), vout: 0 }, { txid: 'y'.repeat(64), vout: 0 }, 'mX'),
    ).resolves.toBeUndefined();
    expect(await bsvTokenRepo.list()).toEqual([]);
  });
});

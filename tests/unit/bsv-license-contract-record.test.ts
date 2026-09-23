// The token record's lock and artifact fields (mw-5wuz6.3): a License token stores lock
// 'license' and the artifact md5, and a License + Fuel token the Fuel's (mw-yo97u.3); every token recorded before the field existed (schema
// v11) reads back as lock 'p2pkh' after the upgrade.
import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { db } from '../../src/data/db';
import { bsvTokenRepo } from '../../src/data/repositories';
import { mintOwnersLicense } from '../fixtures/bsv/license-contract-chain';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('token record lock and artifact', () => {
  it('stores and lists a License token with lock license and its License and Fuel artifacts, and keeps them across updateCurrent', async () => {
    const { token } = await mintOwnersLicense();
    expect(token.fuelArtifact).toBeDefined();
    await bsvTokenRepo.put(token);
    expect(await bsvTokenRepo.list()).toEqual([token]);

    const next = { txid: 'c'.repeat(64), vout: 0 };
    await bsvTokenRepo.updateCurrent(token.origin, next, 'mNewHolder');
    const [updated] = await bsvTokenRepo.list();
    expect(updated.lock).toBe('license');
    expect(updated.artifact).toBe(token.artifact);
    expect(updated.fuelArtifact).toBe(token.fuelArtifact);
  });

  it('reads every token recorded before v12 as lock p2pkh, with no artifact', async () => {
    db.close();
    await Dexie.delete('SpellForgeDB');

    const legacy = new Dexie('SpellForgeDB');
    legacy.version(11).stores({ bsvTokens: '[origin.txid+origin.vout], mintedAt' });
    await legacy.open();
    const origin = { txid: 'a'.repeat(64), vout: 0 };
    await legacy.table('bsvTokens').put({
      origin,
      current: origin,
      holderAddress: 'mHolderA',
      collectionId: 'spellforge-leaderboard-testnet',
      mintedAt: new Date('2026-09-01T00:00:00.000Z'),
    });
    legacy.close();

    await db.open();
    const listed = await bsvTokenRepo.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].lock).toBe('p2pkh');
    expect(listed[0]).not.toHaveProperty('artifact');
    const [row] = await db.bsvTokens.toArray();
    expect(row.lock).toBe('p2pkh');
  });
});

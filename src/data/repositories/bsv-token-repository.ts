import { db } from '../db';
import type { LicenseToken, Outpoint } from '../../bsv/license-token';

export const bsvTokenRepo = {
  async put(token: LicenseToken): Promise<void> {
    const existing = await db.bsvTokens.get([token.origin.txid, token.origin.vout]);
    await db.bsvTokens.put({ ...token, mintedAt: existing?.mintedAt ?? new Date() });
  },

  /** Newest-minted first. */
  async list(): Promise<LicenseToken[]> {
    const rows = await db.bsvTokens.orderBy('mintedAt').reverse().toArray();
    return rows.map((row) => ({
      origin: row.origin,
      current: row.current,
      holderAddress: row.holderAddress,
      collectionId: row.collectionId,
      lock: row.lock,
      ...(row.artifact !== undefined ? { artifact: row.artifact } : {}),
    }));
  },

  async updateCurrent(origin: Outpoint, current: Outpoint, holderAddress: string): Promise<void> {
    const existing = await db.bsvTokens.get([origin.txid, origin.vout]);
    if (!existing) return;
    await db.bsvTokens.put({ ...existing, current, holderAddress });
  },
};

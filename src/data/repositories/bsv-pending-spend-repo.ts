import { db } from '../db';
import type { BsvPendingSpend } from '../../contracts/types';

export const bsvPendingSpendRepo = {
  async getAll(): Promise<BsvPendingSpend[]> {
    return db.bsvPendingSpends.toArray();
  },

  async add(entry: BsvPendingSpend): Promise<void> {
    await db.bsvPendingSpends.put(entry);
  },

  async removeMany(txids: string[]): Promise<void> {
    await db.bsvPendingSpends.bulkDelete(txids);
  },
};

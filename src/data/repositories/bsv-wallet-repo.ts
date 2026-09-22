import { db } from '../db';
import type { BsvWalletKey } from '../../contracts/types';

export const bsvWalletRepo = {
  async getCurrent(): Promise<BsvWalletKey | undefined> {
    return db.bsvWallet.toCollection().first();
  },

  async save(key: BsvWalletKey): Promise<BsvWalletKey> {
    await db.bsvWallet.put(key);
    return key;
  },

  async wipe(): Promise<void> {
    await db.bsvWallet.clear();
  },
};

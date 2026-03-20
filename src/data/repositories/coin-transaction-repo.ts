import type { CoinTransaction, CoinTransactionReason } from '../../contracts/types';
import { db } from '../db';
import { v4 as uuidv4 } from 'uuid';

async function create(
  profileId: string,
  amount: number,
  reason: CoinTransactionReason,
  description: string,
  wordId?: string,
): Promise<CoinTransaction> {
  const transaction: CoinTransaction = {
    id: uuidv4(),
    profileId,
    amount,
    reason,
    description,
    wordId,
    createdAt: new Date(),
  };
  await db.coinTransactions.put(transaction);
  return transaction;
}

async function getByProfileId(profileId: string): Promise<CoinTransaction[]> {
  return db.coinTransactions
    .where('profileId')
    .equals(profileId)
    .reverse()
    .sortBy('createdAt');
}

async function deleteForProfile(profileId: string): Promise<void> {
  await db.coinTransactions.where('profileId').equals(profileId).delete();
}

export const coinTransactionRepo = {
  create,
  getByProfileId,
  deleteForProfile,
} as const;

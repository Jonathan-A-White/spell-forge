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
  const txns = await db.coinTransactions
    .where('profileId')
    .equals(profileId)
    .sortBy('createdAt');
  return txns.reverse();
}

async function hasMilestoneBeenAwarded(profileId: string, reason: string): Promise<boolean> {
  const match = await db.coinTransactions
    .where('profileId')
    .equals(profileId)
    .and((txn) => txn.reason === reason)
    .first();
  return match !== undefined;
}

async function deleteForProfile(profileId: string): Promise<void> {
  await db.coinTransactions.where('profileId').equals(profileId).delete();
}

export const coinTransactionRepo = {
  create,
  getByProfileId,
  hasMilestoneBeenAwarded,
  deleteForProfile,
} as const;

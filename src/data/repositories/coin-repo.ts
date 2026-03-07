import type { CoinBalance } from '../../contracts/types';
import { db } from '../db';

async function get(profileId: string): Promise<CoinBalance | undefined> {
  return db.coinBalances.get(profileId);
}

async function getOrCreate(profileId: string): Promise<CoinBalance> {
  const existing = await db.coinBalances.get(profileId);
  if (existing) return existing;

  const balance: CoinBalance = {
    profileId,
    coins: 0,
    totalEarned: 0,
    totalSpent: 0,
    updatedAt: new Date(),
  };
  await db.coinBalances.put(balance);
  return balance;
}

async function addCoins(profileId: string, amount: number): Promise<CoinBalance> {
  const balance = await getOrCreate(profileId);
  const updated: CoinBalance = {
    ...balance,
    coins: balance.coins + amount,
    totalEarned: balance.totalEarned + amount,
    updatedAt: new Date(),
  };
  await db.coinBalances.put(updated);
  return updated;
}

async function spendCoins(profileId: string, amount: number): Promise<CoinBalance> {
  const balance = await getOrCreate(profileId);
  if (balance.coins < amount) {
    throw new Error(`Insufficient coins: have ${balance.coins}, need ${amount}`);
  }
  const updated: CoinBalance = {
    ...balance,
    coins: balance.coins - amount,
    totalSpent: balance.totalSpent + amount,
    updatedAt: new Date(),
  };
  await db.coinBalances.put(updated);
  return updated;
}

async function deleteForProfile(profileId: string): Promise<void> {
  await db.coinBalances.delete(profileId);
}

export const coinRepo = {
  get,
  getOrCreate,
  addCoins,
  spendCoins,
  deleteForProfile,
} as const;

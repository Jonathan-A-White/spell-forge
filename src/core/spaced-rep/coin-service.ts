// src/core/spaced-rep/coin-service.ts — Coin economy: earn coins by mastering words, spend to play games

import type { CoinBalance, WordStats } from '../../contracts/types';
import { coinRepo } from '../../data/repositories/coin-repo';

const COINS_PER_MASTERY = 1;
const COINS_PER_GAME = 1;

/**
 * Award coins when a word reaches mastered status.
 */
export async function earnCoinForMastery(profileId: string): Promise<CoinBalance> {
  return coinRepo.addCoins(profileId, COINS_PER_MASTERY);
}

/**
 * Check whether the player can play a game for free (all words mastered)
 * or needs to spend a coin (has new words to learn).
 */
export function canPlayFree(
  allWordsCount: number,
  masteredCount: number,
): boolean {
  return allWordsCount > 0 && masteredCount >= allWordsCount;
}

/**
 * Determine how many words are due for review (nextReviewDate <= now).
 */
export function getWordsDueCount(allStats: WordStats[]): number {
  const nowMs = Date.now();
  return allStats.filter(
    (s) => s.timesAsked > 0
      && s.currentBucket !== 'new'
      && s.nextReviewDate instanceof Date
      && s.nextReviewDate.getTime() <= nowMs,
  ).length;
}

/**
 * Attempt to spend a coin to play a game.
 * Returns the updated balance, or null if insufficient coins.
 */
export async function spendCoinForGame(profileId: string): Promise<CoinBalance | null> {
  const balance = await coinRepo.getOrCreate(profileId);
  if (balance.coins < COINS_PER_GAME) return null;
  return coinRepo.spendCoins(profileId, COINS_PER_GAME);
}

/**
 * Get the current coin balance for a profile.
 */
export async function getCoinBalance(profileId: string): Promise<CoinBalance> {
  return coinRepo.getOrCreate(profileId);
}

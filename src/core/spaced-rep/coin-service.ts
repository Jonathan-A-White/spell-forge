// src/core/spaced-rep/coin-service.ts — Coin economy: earn coins by milestones and mastery, spend to play games

import type { CoinBalance, CoinTransactionReason, WordStats } from '../../contracts/types';
import { coinRepo } from '../../data/repositories/coin-repo';
import { coinTransactionRepo } from '../../data/repositories/coin-transaction-repo';

const COINS_PER_MASTERY = 1;
const COINS_PER_GAME = 1;
const COINS_PER_MILESTONE = 1;

/**
 * Award coins when a word reaches mastered status.
 */
export async function earnCoinForMastery(profileId: string, wordId: string, wordText?: string): Promise<CoinBalance> {
  const balance = await coinRepo.addCoins(profileId, COINS_PER_MASTERY);
  await coinTransactionRepo.create(
    profileId,
    COINS_PER_MASTERY,
    'word-mastered',
    `Mastered "${wordText ?? 'word'}"`,
    wordId,
  );
  return balance;
}

/**
 * Award a coin when all active words reach "learning" bucket.
 */
export async function earnCoinForAllLearning(profileId: string): Promise<CoinBalance> {
  const balance = await coinRepo.addCoins(profileId, COINS_PER_MILESTONE);
  await coinTransactionRepo.create(
    profileId,
    COINS_PER_MILESTONE,
    'all-learning',
    'All words reached Learning stage',
  );
  return balance;
}

/**
 * Award a coin when all active words reach "familiar" bucket.
 */
export async function earnCoinForAllFamiliar(profileId: string): Promise<CoinBalance> {
  const balance = await coinRepo.addCoins(profileId, COINS_PER_MILESTONE);
  await coinTransactionRepo.create(
    profileId,
    COINS_PER_MILESTONE,
    'all-familiar',
    'All words reached Familiar stage',
  );
  return balance;
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
  return getWordsDueIds(allStats).length;
}

/**
 * Return the wordIds of words due for review (nextReviewDate <= now).
 */
export function getWordsDueIds(allStats: WordStats[]): string[] {
  const nowMs = Date.now();
  return allStats
    .filter(
      (s) => s.timesAsked > 0
        && s.currentBucket !== 'new'
        && s.nextReviewDate instanceof Date
        && s.nextReviewDate.getTime() <= nowMs,
    )
    .map((s) => s.wordId);
}

/**
 * Attempt to spend a coin to play a game.
 * Returns the updated balance, or null if insufficient coins.
 */
export async function spendCoinForGame(profileId: string): Promise<CoinBalance | null> {
  const balance = await coinRepo.getOrCreate(profileId);
  if (balance.coins < COINS_PER_GAME) return null;
  const updated = await coinRepo.spendCoins(profileId, COINS_PER_GAME);
  await coinTransactionRepo.create(
    profileId,
    -COINS_PER_GAME,
    'game-play',
    'Played a game',
  );
  return updated;
}

/**
 * Get the current coin balance for a profile.
 */
export async function getCoinBalance(profileId: string): Promise<CoinBalance> {
  return coinRepo.getOrCreate(profileId);
}

/**
 * Check if a milestone coin has already been awarded for this profile.
 */
export async function hasMilestoneBeenAwarded(profileId: string, reason: CoinTransactionReason): Promise<boolean> {
  return coinTransactionRepo.hasMilestoneBeenAwarded(profileId, reason);
}

/**
 * Award any milestone coins that are earned but not yet recorded.
 * Call this on profile load to retroactively award coins for milestones
 * that were reached before the coin system existed or between sessions.
 * Returns the updated balance if any coins were awarded, or the current balance.
 */
export async function awardPendingMilestones(
  profileId: string,
  activeStats: WordStats[],
  activeWordCount: number,
): Promise<{ balance: CoinBalance; awarded: CoinTransactionReason[] }> {
  let balance = await coinRepo.getOrCreate(profileId);
  const awarded: CoinTransactionReason[] = [];

  if (activeWordCount > 0 && allWordsAtLeastBucket(activeStats, activeWordCount, 'learning')) {
    const alreadyAwarded = await coinTransactionRepo.hasMilestoneBeenAwarded(profileId, 'all-learning');
    if (!alreadyAwarded) {
      balance = await coinRepo.addCoins(profileId, COINS_PER_MILESTONE);
      await coinTransactionRepo.create(profileId, COINS_PER_MILESTONE, 'all-learning', 'All words reached Learning stage');
      awarded.push('all-learning');
    }
  }

  if (activeWordCount > 0 && allWordsAtLeastBucket(activeStats, activeWordCount, 'familiar')) {
    const alreadyAwarded = await coinTransactionRepo.hasMilestoneBeenAwarded(profileId, 'all-familiar');
    if (!alreadyAwarded) {
      balance = await coinRepo.addCoins(profileId, COINS_PER_MILESTONE);
      await coinTransactionRepo.create(profileId, COINS_PER_MILESTONE, 'all-familiar', 'All words reached Familiar stage');
      awarded.push('all-familiar');
    }
  }

  return { balance, awarded };
}

/**
 * Check if all active words have reached at least the given bucket level.
 * Bucket order: new < learning < familiar < mastered (review counts as mastered).
 */
export function allWordsAtLeastBucket(
  activeStats: WordStats[],
  activeWordCount: number,
  targetBucket: 'learning' | 'familiar' | 'mastered',
): boolean {
  if (activeWordCount === 0 || activeStats.length < activeWordCount) return false;

  const bucketLevel: Record<string, number> = {
    'new': 0,
    'learning': 1,
    'familiar': 2,
    'mastered': 3,
    'review': 4,
  };
  const targetLevel = bucketLevel[targetBucket];

  return activeStats.every(
    (s) => (bucketLevel[s.currentBucket] ?? 0) >= targetLevel,
  );
}

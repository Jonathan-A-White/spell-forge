import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/data/db';
import { coinRepo } from '../../src/data/repositories/coin-repo';
import {
  earnCoinForMastery,
  canPlayFree,
  getWordsDueCount,
  spendCoinForGame,
  getCoinBalance,
} from '../../src/core/spaced-rep/coin-service';
import type { WordStats } from '../../src/contracts/types';

const PROFILE_ID = 'test-profile-1';

function makeStats(overrides?: Partial<WordStats>): WordStats {
  return {
    id: 'stat-1',
    wordId: 'word-1',
    profileId: PROFILE_ID,
    lastAsked: new Date('2026-03-05'),
    timesAsked: 5,
    timesWrong: 1,
    timesStruggledRight: 0,
    timesEasyRight: 4,
    consecutiveCorrect: 3,
    currentBucket: 'learning',
    nextReviewDate: new Date('2026-03-06'),
    difficultyScore: 0.3,
    techniqueHistory: [],
    ...overrides,
  };
}

describe('Coin Repository', () => {
  beforeEach(async () => {
    await db.coinBalances.clear();
  });

  it('getOrCreate returns a new zero-balance record', async () => {
    const balance = await coinRepo.getOrCreate(PROFILE_ID);
    expect(balance.profileId).toBe(PROFILE_ID);
    expect(balance.coins).toBe(0);
    expect(balance.totalEarned).toBe(0);
    expect(balance.totalSpent).toBe(0);
  });

  it('getOrCreate returns existing record if it exists', async () => {
    await coinRepo.addCoins(PROFILE_ID, 5);
    const balance = await coinRepo.getOrCreate(PROFILE_ID);
    expect(balance.coins).toBe(5);
  });

  it('addCoins increments coins and totalEarned', async () => {
    await coinRepo.addCoins(PROFILE_ID, 3);
    const balance = await coinRepo.getOrCreate(PROFILE_ID);
    expect(balance.coins).toBe(3);
    expect(balance.totalEarned).toBe(3);
  });

  it('addCoins accumulates across multiple calls', async () => {
    await coinRepo.addCoins(PROFILE_ID, 2);
    await coinRepo.addCoins(PROFILE_ID, 3);
    const balance = await coinRepo.getOrCreate(PROFILE_ID);
    expect(balance.coins).toBe(5);
    expect(balance.totalEarned).toBe(5);
  });

  it('spendCoins decrements coins and increments totalSpent', async () => {
    await coinRepo.addCoins(PROFILE_ID, 5);
    await coinRepo.spendCoins(PROFILE_ID, 2);
    const balance = await coinRepo.getOrCreate(PROFILE_ID);
    expect(balance.coins).toBe(3);
    expect(balance.totalSpent).toBe(2);
  });

  it('spendCoins throws when insufficient coins', async () => {
    await coinRepo.addCoins(PROFILE_ID, 1);
    await expect(coinRepo.spendCoins(PROFILE_ID, 5)).rejects.toThrow('Insufficient coins');
  });

  it('deleteForProfile removes balance', async () => {
    await coinRepo.addCoins(PROFILE_ID, 10);
    await coinRepo.deleteForProfile(PROFILE_ID);
    const result = await coinRepo.get(PROFILE_ID);
    expect(result).toBeUndefined();
  });
});

describe('Coin Service', () => {
  beforeEach(async () => {
    await db.coinBalances.clear();
  });

  it('earnCoinForMastery awards 1 coin', async () => {
    const balance = await earnCoinForMastery(PROFILE_ID);
    expect(balance.coins).toBe(1);
    expect(balance.totalEarned).toBe(1);
  });

  it('earning multiple mastery coins accumulates', async () => {
    await earnCoinForMastery(PROFILE_ID);
    await earnCoinForMastery(PROFILE_ID);
    const balance = await getCoinBalance(PROFILE_ID);
    expect(balance.coins).toBe(2);
  });

  it('spendCoinForGame succeeds when coins available', async () => {
    await earnCoinForMastery(PROFILE_ID);
    const result = await spendCoinForGame(PROFILE_ID);
    expect(result).not.toBeNull();
    expect(result!.coins).toBe(0);
    expect(result!.totalSpent).toBe(1);
  });

  it('spendCoinForGame returns null when no coins', async () => {
    const result = await spendCoinForGame(PROFILE_ID);
    expect(result).toBeNull();
  });

  it('getCoinBalance returns zero balance for new profile', async () => {
    const balance = await getCoinBalance(PROFILE_ID);
    expect(balance.coins).toBe(0);
  });
});

describe('canPlayFree', () => {
  it('returns true when all words are mastered', () => {
    expect(canPlayFree(10, 10)).toBe(true);
  });

  it('returns false when some words are not mastered', () => {
    expect(canPlayFree(10, 8)).toBe(false);
  });

  it('returns false when there are no words', () => {
    expect(canPlayFree(0, 0)).toBe(false);
  });
});

describe('getWordsDueCount', () => {
  it('counts words with nextReviewDate in the past', () => {
    const past = new Date('2020-01-01');
    const future = new Date('2030-01-01');
    const stats: WordStats[] = [
      makeStats({ id: 's1', wordId: 'w1', timesAsked: 3, currentBucket: 'learning', nextReviewDate: past }),
      makeStats({ id: 's2', wordId: 'w2', timesAsked: 5, currentBucket: 'familiar', nextReviewDate: past }),
      makeStats({ id: 's3', wordId: 'w3', timesAsked: 2, currentBucket: 'mastered', nextReviewDate: future }),
      makeStats({ id: 's4', wordId: 'w4', timesAsked: 0, currentBucket: 'new', nextReviewDate: past }),
    ];
    // w1 and w2 are due (past date, asked > 0, not "new")
    // w3 is in the future
    // w4 has never been asked (timesAsked = 0)
    expect(getWordsDueCount(stats)).toBe(2);
  });

  it('returns 0 when no words are due', () => {
    const future = new Date('2030-01-01');
    const stats: WordStats[] = [
      makeStats({ id: 's1', timesAsked: 3, currentBucket: 'mastered', nextReviewDate: future }),
    ];
    expect(getWordsDueCount(stats)).toBe(0);
  });
});

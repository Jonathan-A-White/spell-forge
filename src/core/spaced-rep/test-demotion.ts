// src/core/spaced-rep/test-demotion.ts — Demote words that were wrong on a real test

import type { WordStats, WordBucket } from '../../contracts/types';
import { demoteOneLevel, bucketMinCorrect } from './buckets';

/**
 * Compute demoted stats for a word that was marked wrong on a real test.
 * Words at 'familiar' or above get demoted one level.
 * Words at 'learning' or 'new' stay where they are.
 *
 * Returns a partial WordStats update or null if no change needed.
 */
export function computeTestDemotion(stats: WordStats): Partial<WordStats> | null {
  const promotable: WordBucket[] = ['familiar', 'mastered', 'review'];
  if (!promotable.includes(stats.currentBucket)) {
    return null;
  }

  const newBucket = demoteOneLevel(stats.currentBucket);
  const minCorrect = bucketMinCorrect(newBucket);

  return {
    currentBucket: newBucket,
    consecutiveCorrect: Math.min(stats.consecutiveCorrect, minCorrect),
    consecutiveWrong: stats.consecutiveWrong + 1,
  };
}

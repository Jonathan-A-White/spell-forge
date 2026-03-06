// src/core/spaced-rep/buckets.ts — Bucket transition logic for spaced repetition

import type { WordStats, WordBucket } from '../../contracts/types';

/**
 * Minimum number of distinct days with correct answers required for mastered status.
 */
const MASTERED_MIN_DAYS = 3;

/**
 * Count the number of distinct days on which correct answers were given.
 */
function countCorrectDays(stats: WordStats): number {
  const days = new Set<string>();
  for (const result of stats.techniqueHistory) {
    if (result.correct) {
      days.add(result.timestamp.toISOString().slice(0, 10));
    }
  }
  return days.size;
}

/**
 * Determine the appropriate bucket for a word based on its current stats.
 *
 * Bucket rules:
 * - new: never attempted (timesAsked === 0)
 * - learning: 0-2 consecutive correct
 * - familiar: 3-4 consecutive correct
 * - mastered: 5+ consecutive correct across 3+ distinct days
 * - review: mastered words entering long-term maintenance
 *
 * Words move BOTH directions: a mastered word that is missed drops to learning.
 */
export function transitionBucket(stats: WordStats): WordBucket {
  // Never attempted
  if (stats.timesAsked === 0) {
    return 'new';
  }

  const cc = stats.consecutiveCorrect;

  // If consecutive correct is 0 (just got one wrong) and they've been asked,
  // they're in learning
  if (cc < 3) {
    return 'learning';
  }

  if (cc < 5) {
    return 'familiar';
  }

  // 5+ consecutive correct — check for multi-day requirement
  const correctDays = countCorrectDays(stats);

  if (correctDays >= MASTERED_MIN_DAYS) {
    // If the word was already in 'review' bucket and still performing well, stay in review
    if (stats.currentBucket === 'review') {
      return 'review';
    }
    // If already mastered and has been there a while, transition to review
    // A word moves to review once it's been mastered and completed at least one mastered-interval review
    if (stats.currentBucket === 'mastered' && correctDays > MASTERED_MIN_DAYS) {
      return 'review';
    }
    return 'mastered';
  }

  // 5+ consecutive but not enough distinct days yet — familiar
  return 'familiar';
}

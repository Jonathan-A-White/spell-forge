// src/core/spaced-rep/buckets.ts — Bucket transition logic for spaced repetition

import type { WordStats, WordBucket } from '../../contracts/types';

/**
 * Minimum number of distinct days with correct answers required for mastered status.
 */
const MASTERED_MIN_DAYS = 3;

/**
 * Number of consecutive wrong answers required to trigger a one-level demotion.
 */
export const DEMOTION_THRESHOLD = 3;

/**
 * Count the number of distinct days on which correct answers were given.
 */
function countCorrectDays(stats: WordStats): number {
  const days = new Set<string>();
  for (const result of stats.techniqueHistory) {
    if (result.correct) {
      const t = result.timestamp;
      const y = t.getFullYear();
      const m = String(t.getMonth() + 1).padStart(2, '0');
      const dd = String(t.getDate()).padStart(2, '0');
      days.add(`${y}-${m}-${dd}`);
    }
  }
  return days.size;
}

/**
 * Demote a bucket by exactly one level.
 *
 * review → mastered → familiar → learning
 */
export function demoteOneLevel(bucket: WordBucket): WordBucket {
  switch (bucket) {
    case 'review': return 'mastered';
    case 'mastered': return 'familiar';
    case 'familiar': return 'learning';
    default: return 'learning';
  }
}

/**
 * Minimum consecutiveCorrect value needed to hold a given bucket.
 * Used after demotion so the word stays at its new level.
 */
export function bucketMinCorrect(bucket: WordBucket): number {
  switch (bucket) {
    case 'familiar': return 3;
    case 'mastered': return 5;
    case 'review': return 5;
    default: return 0;
  }
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
 * Demotion is graduated: 3 consecutive wrong answers drops ONE level
 * (review → mastered → familiar → learning). During a grace period
 * (1-2 wrongs), the word holds its current bucket.
 */
export function transitionBucket(stats: WordStats): WordBucket {
  // Never attempted
  if (stats.timesAsked === 0) {
    return 'new';
  }

  const cc = stats.consecutiveCorrect;
  const cw = stats.consecutiveWrong ?? 0;

  // Demotion: 3+ consecutive wrong → drop one level from current bucket
  if (cw >= DEMOTION_THRESHOLD) {
    return demoteOneLevel(stats.currentBucket);
  }

  // Grace period: 1-2 consecutive wrongs → hold current bucket
  // (don't drop immediately; give the learner a chance to recover)
  if (cw > 0 && stats.currentBucket !== 'new') {
    return stats.currentBucket;
  }

  // ── Normal promotion logic (cw === 0, on a correct streak) ──

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
    if (stats.currentBucket === 'mastered' && correctDays > MASTERED_MIN_DAYS) {
      return 'review';
    }
    return 'mastered';
  }

  // 5+ consecutive but not enough distinct days yet — familiar
  return 'familiar';
}

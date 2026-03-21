// src/core/spaced-rep/scheduler.ts — SM-2 adaptation for children's spelling practice

import type { WordStats, TechniqueResult } from '../../contracts/types';
import { transitionBucket, DEMOTION_THRESHOLD, bucketMinCorrect } from './buckets';
import { computeDifficulty } from './difficulty';

/**
 * Review interval maps by bucket (in days).
 * Each bucket has a sequence of expanding intervals.
 */
const REVIEW_INTERVALS: Record<string, number[]> = {
  learning: [0],                       // every session
  familiar: [1, 2, 3],                // every 1-3 days (sessions)
  mastered: [7, 14, 30, 60],          // expanding
  review: [60, 90, 120, 180],         // long-term maintenance
};

/**
 * Determines the review interval index based on consecutive correct answers.
 */
function getIntervalIndex(consecutiveCorrect: number, intervals: number[]): number {
  return Math.min(consecutiveCorrect, intervals.length - 1);
}

/**
 * Calculate the next review date for a word based on its current stats.
 */
export function calculateNextReview(stats: WordStats): Date {
  const bucket = stats.currentBucket;
  const now = stats.lastAsked ?? new Date();

  if (bucket === 'new') {
    // New words should be reviewed immediately
    return new Date(now);
  }

  const intervals = REVIEW_INTERVALS[bucket];
  if (!intervals) {
    return new Date(now);
  }

  const idx = getIntervalIndex(stats.consecutiveCorrect, intervals);
  const intervalDays = intervals[idx];

  const next = new Date(now);
  next.setDate(next.getDate() + intervalDays);
  return next;
}

/**
 * Update word stats after a technique result.
 * Handles consecutive correct counting, bucket transitions, and difficulty recalculation.
 */
export function updateWordStats(stats: WordStats, result: TechniqueResult): WordStats {
  const updatedHistory = [...stats.techniqueHistory, result];

  // Update counters
  const timesAsked = stats.timesAsked + 1;
  const timesWrong = stats.timesWrong + (result.correct ? 0 : 1);
  const timesStruggledRight = stats.timesStruggledRight + (result.correct && result.struggled ? 1 : 0);
  const timesEasyRight = stats.timesEasyRight + (result.correct && !result.struggled ? 1 : 0);

  // Track consecutive correct & consecutive wrong
  let consecutiveCorrect: number;
  let consecutiveWrong: number;

  if (result.correct) {
    consecutiveCorrect = stats.consecutiveCorrect + 1;
    consecutiveWrong = 0;
  } else {
    consecutiveWrong = (stats.consecutiveWrong ?? 0) + 1;
    if (consecutiveWrong >= DEMOTION_THRESHOLD) {
      // Demotion triggered — reset consecutiveCorrect to 0 so the demoted
      // bucket can be set properly, then we'll fix cc after transition.
      consecutiveCorrect = 0;
    } else {
      // Grace period — preserve consecutiveCorrect so the word holds its bucket
      consecutiveCorrect = stats.consecutiveCorrect;
    }
  }

  // Build intermediate stats for bucket transition and difficulty calculation
  const intermediate: WordStats = {
    ...stats,
    lastAsked: result.timestamp,
    timesAsked,
    timesWrong,
    timesStruggledRight,
    timesEasyRight,
    consecutiveCorrect,
    consecutiveWrong,
    techniqueHistory: updatedHistory,
  };

  // Transition bucket based on new stats
  const newBucket = transitionBucket(intermediate);
  intermediate.currentBucket = newBucket;

  // After demotion: reset consecutiveWrong and set consecutiveCorrect
  // to the minimum needed to hold the new bucket level
  if (consecutiveWrong >= DEMOTION_THRESHOLD) {
    intermediate.consecutiveWrong = 0;
    intermediate.consecutiveCorrect = bucketMinCorrect(newBucket);
  }

  // Recompute difficulty
  intermediate.difficultyScore = computeDifficulty(intermediate);

  // Calculate next review date
  intermediate.nextReviewDate = calculateNextReview(intermediate);

  return intermediate;
}

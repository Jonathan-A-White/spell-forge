// src/core/mastery.ts — Shared mastered-word counting logic

import type { Word, WordStats } from '../contracts/types';

/**
 * Count how many words are considered "mastered" using only
 * spaced-rep bucket status. A word must reach 'mastered' or 'review'
 * through practice (consecutive correct answers across multiple days)
 * to be counted as truly mastered.
 *
 * Completing learning mode promotes a word to 'familiar', not 'mastered'.
 * True mastery requires proving retention through spaced-rep practice.
 */
export function countMasteredWords(
  allWords: Word[],
  allStats: WordStats[],
): number {
  return allWords.filter((w) => {
    const stat = allStats.find((s) => s.wordId === w.id);
    return stat && (stat.currentBucket === 'mastered' || stat.currentBucket === 'review');
  }).length;
}

/**
 * Compute a weighted progress percentage that reflects partial mastery.
 * - mastered/review: 100%
 * - familiar: 60%
 * - learning: 25%
 * - new/no stats: 0%
 */
export function computeProgressPercent(
  allWords: Word[],
  allStats: WordStats[],
): number {
  if (allWords.length === 0) return 0;
  const statsMap = new Map(allStats.map((s) => [s.wordId, s]));

  let totalWeight = 0;
  for (const w of allWords) {
    const stat = statsMap.get(w.id);
    if (!stat || stat.timesAsked === 0) continue;
    if (stat.currentBucket === 'mastered' || stat.currentBucket === 'review') {
      totalWeight += 1.0;
    } else if (stat.currentBucket === 'familiar') {
      totalWeight += 0.6;
    } else if (stat.currentBucket === 'learning') {
      totalWeight += 0.25;
    }
  }

  return Math.round((totalWeight / allWords.length) * 100);
}

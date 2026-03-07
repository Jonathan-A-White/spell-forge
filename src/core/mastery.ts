// src/core/mastery.ts — Shared mastered-word counting logic

import type { Word, WordStats, WordLearningProgress } from '../contracts/types';

/**
 * Count how many words are considered "mastered" by combining
 * spaced-rep bucket status and learning-progress records.
 */
export function countMasteredWords(
  allWords: Word[],
  allStats: WordStats[],
  learningProgress: WordLearningProgress[],
): number {
  const learningMasteredIds = new Set(
    learningProgress.filter((lp) => lp.mastered).map((lp) => lp.wordId),
  );
  return allWords.filter((w) => {
    const stat = allStats.find((s) => s.wordId === w.id);
    if (stat && stat.timesAsked > 0 && (stat.currentBucket === 'mastered' || stat.currentBucket === 'review')) return true;
    return learningMasteredIds.has(w.id);
  }).length;
}

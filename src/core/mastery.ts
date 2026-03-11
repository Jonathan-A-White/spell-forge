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

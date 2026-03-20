// src/core/mastery.ts — Shared mastered-word counting logic

import type { Word, WordStats, WordLearningProgress } from '../contracts/types';

type HealthCategory = 'mastered' | 'familiar' | 'learning' | 'new';

/**
 * Compute a unified health category for a word, combining
 * spaced-rep bucket status with learning-stage progress.
 *
 * Priority: spaced-rep bucket wins if the word has been practiced.
 * If a word is still "new" in spaced-rep but has learning progress,
 * its learning stage determines the category.
 */
export function getWordCategory(
  wordId: string,
  statsMap: Map<string, WordStats>,
  learningMap: Map<string, WordLearningProgress>,
): HealthCategory {
  const stat = statsMap.get(wordId);
  const lp = learningMap.get(wordId);

  // If word has been through spaced-rep practice, use that bucket
  if (stat && stat.timesAsked > 0) {
    if (stat.currentBucket === 'mastered' || stat.currentBucket === 'review') return 'mastered';
    if (stat.currentBucket === 'familiar') return 'familiar';
    if (stat.currentBucket === 'learning') return 'learning';
  }

  // Fall back to learning-stage progress
  if (lp) {
    if (lp.mastered || lp.stage >= 2) return 'familiar';
    if (lp.stage >= 1 || lp.totalAttempts > 0) return 'learning';
  }

  return 'new';
}

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
 * Uses the same categorization as the health breakdown (getWordCategory),
 * so learning-mode progress is included alongside spaced-rep bucket status.
 *
 * Weights:
 * - mastered/review: 100%
 * - familiar: 60%
 * - learning: 25%
 * - new/no stats: 0%
 */
export function computeProgressPercent(
  allWords: Word[],
  allStats: WordStats[],
  learningProgress: WordLearningProgress[] = [],
): number {
  if (allWords.length === 0) return 0;
  const statsMap = new Map(allStats.map((s) => [s.wordId, s]));
  const learningMap = new Map(learningProgress.map((lp) => [lp.wordId, lp]));

  let totalWeight = 0;
  for (const w of allWords) {
    const category = getWordCategory(w.id, statsMap, learningMap);
    if (category === 'mastered') {
      totalWeight += 1.0;
    } else if (category === 'familiar') {
      totalWeight += 0.6;
    } else if (category === 'learning') {
      totalWeight += 0.25;
    }
  }

  return Math.round((totalWeight / allWords.length) * 100);
}

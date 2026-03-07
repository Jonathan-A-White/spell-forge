// src/core/learning/engine.ts — Word learning progression engine

import type {
  WordLearningProgress,
  LearningStage,
  LearningInputMode,
} from '../../contracts/types';

/** The final stage where no word is shown (audio only, keyboard input). */
export const MAX_STAGE: LearningStage = 3;

/** Successes needed to advance from a stage. */
export const SUCCESSES_TO_ADVANCE = 3;

/** Consecutive failures that trigger regression. */
export const FAILURES_TO_REGRESS = 2;

// ─── State Derivation ────────────────────────────────────────

/**
 * Determine input mode for the current attempt.
 * - Stage 3 (no hints): always keyboard
 * - Stages 0-2: first 2 successes use scrambled letters, 3rd (boss) uses keyboard
 */
export function getInputMode(
  stage: LearningStage,
  consecutiveSuccesses: number,
): LearningInputMode {
  if (stage >= MAX_STAGE) return 'keyboard';
  if (consecutiveSuccesses >= 2) return 'keyboard';
  return 'scrambled';
}

/**
 * Number of letters to hide in the word display.
 * Stage 0 = 0 hidden, Stage 1 = 1, Stage 2 = 2, Stage 3 = all hidden.
 */
export function getHiddenCount(stage: LearningStage, wordLength: number): number {
  if (stage >= MAX_STAGE) return wordLength;
  return stage;
}

/**
 * Generate a word display with random letters replaced by underscores.
 * Returns the display string and which indices were hidden.
 * Uses a seeded approach so each call gets fresh random positions.
 */
export function generateWordDisplay(
  word: string,
  hiddenCount: number,
): { display: string; hiddenIndices: number[] } {
  if (hiddenCount <= 0) {
    return { display: word, hiddenIndices: [] };
  }

  const len = word.length;
  if (hiddenCount >= len) {
    return {
      display: '_'.repeat(len),
      hiddenIndices: Array.from({ length: len }, (_, i) => i),
    };
  }

  // Fisher-Yates partial shuffle to pick hiddenCount random indices
  const indices = Array.from({ length: len }, (_, i) => i);
  for (let i = len - 1; i > len - 1 - hiddenCount; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const hiddenIndices = indices.slice(len - hiddenCount).sort((a, b) => a - b);

  const chars = word.split('');
  for (const idx of hiddenIndices) {
    chars[idx] = '_';
  }

  return { display: chars.join(''), hiddenIndices };
}

// ─── Progression Logic ───────────────────────────────────────

export interface AttemptResult {
  correct: boolean;
  testOut: boolean;
}

/**
 * Process a learning attempt and return the updated progress.
 *
 * Rules:
 * - Test out correct → mastered immediately
 * - Test out wrong → no change (can retry anytime)
 * - Correct → increment consecutiveSuccesses; if reaches 3, advance stage
 *   - Advancing past MAX_STAGE → mastered
 * - Wrong → reset consecutiveSuccesses, increment consecutiveFailures
 *   - 2 consecutive failures → regress one stage (min 0)
 *   - 1 failure → just reset success streak
 */
export function processAttempt(
  progress: WordLearningProgress,
  result: AttemptResult,
): WordLearningProgress {
  const now = new Date();

  if (result.testOut) {
    if (result.correct) {
      return {
        ...progress,
        mastered: true,
        totalAttempts: progress.totalAttempts + 1,
        lastAttemptAt: now,
      };
    }
    // Test out failed — no penalty, just record the attempt
    return {
      ...progress,
      totalAttempts: progress.totalAttempts + 1,
      totalErrors: progress.totalErrors + 1,
      lastAttemptAt: now,
    };
  }

  if (result.correct) {
    const newSuccesses = progress.consecutiveSuccesses + 1;

    if (newSuccesses >= SUCCESSES_TO_ADVANCE) {
      // Advance to next stage
      const nextStage = (progress.stage + 1) as LearningStage;
      if (nextStage > MAX_STAGE) {
        return {
          ...progress,
          mastered: true,
          consecutiveSuccesses: 0,
          consecutiveFailures: 0,
          totalAttempts: progress.totalAttempts + 1,
          lastAttemptAt: now,
        };
      }
      return {
        ...progress,
        stage: nextStage,
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        totalAttempts: progress.totalAttempts + 1,
        lastAttemptAt: now,
      };
    }

    return {
      ...progress,
      consecutiveSuccesses: newSuccesses,
      consecutiveFailures: 0,
      totalAttempts: progress.totalAttempts + 1,
      lastAttemptAt: now,
    };
  }

  // Wrong answer
  const newFailures = progress.consecutiveFailures + 1;

  if (newFailures >= FAILURES_TO_REGRESS) {
    // Regress one stage
    const prevStage = Math.max(0, progress.stage - 1) as LearningStage;
    return {
      ...progress,
      stage: prevStage,
      consecutiveSuccesses: 0,
      consecutiveFailures: 0,
      totalAttempts: progress.totalAttempts + 1,
      totalErrors: progress.totalErrors + 1,
      lastAttemptAt: now,
    };
  }

  return {
    ...progress,
    consecutiveSuccesses: 0,
    consecutiveFailures: newFailures,
    totalAttempts: progress.totalAttempts + 1,
    totalErrors: progress.totalErrors + 1,
    lastAttemptAt: now,
  };
}

// ─── Progress Initialization ─────────────────────────────────

export function createInitialProgress(
  profileId: string,
  wordId: string,
  wordListId: string,
): WordLearningProgress {
  return {
    id: `${profileId}:${wordId}`,
    profileId,
    wordId,
    wordListId,
    stage: 0,
    consecutiveSuccesses: 0,
    consecutiveFailures: 0,
    mastered: false,
    totalAttempts: 0,
    totalErrors: 0,
    lastAttemptAt: null,
    createdAt: new Date(),
  };
}

// ─── List Ordering ───────────────────────────────────────────

/**
 * Sort words shortest-to-longest for learning order within a list.
 * Stable sort: words of equal length keep their original order.
 */
export function sortWordsForLearning<T extends { text: string }>(words: T[]): T[] {
  return [...words].sort((a, b) => a.text.length - b.text.length);
}

/**
 * Find the next word to learn in a list.
 * Returns the first non-mastered word in length-sorted order,
 * or null if all words are mastered.
 */
export function findNextWord<T extends { id: string; text: string }>(
  words: T[],
  progressMap: Map<string, WordLearningProgress>,
): T | null {
  const sorted = sortWordsForLearning(words);
  for (const word of sorted) {
    const progress = progressMap.get(word.id);
    if (!progress || !progress.mastered) {
      return word;
    }
  }
  return null;
}

/**
 * Calculate overall list learning completion as a percentage.
 */
export function calculateListCompletion(
  wordCount: number,
  progressList: WordLearningProgress[],
): number {
  if (wordCount === 0) return 100;
  const mastered = progressList.filter((p) => p.mastered).length;
  return Math.round((mastered / wordCount) * 100);
}

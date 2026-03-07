// src/core/learning/index.ts — barrel export

export {
  processAttempt,
  getInputMode,
  getHiddenCount,
  generateWordDisplay,
  createInitialProgress,
  sortWordsForLearning,
  findNextWord,
  calculateListCompletion,
  MAX_STAGE,
  SUCCESSES_TO_ADVANCE,
  FAILURES_TO_REGRESS,
} from './engine';

export type { AttemptResult } from './engine';

// src/core/spaced-rep/index.ts — barrel export

export { updateWordStats, calculateNextReview } from './scheduler';
export { transitionBucket, demoteOneLevel, DEMOTION_THRESHOLD } from './buckets';
export { computeDifficulty } from './difficulty';
export {
  earnCoinForMastery,
  earnCoinForAllLearning,
  earnCoinForAllFamiliar,
  canPlayFree,
  getWordsDueCount,
  getWordsDueIds,
  spendCoinForGame,
  getCoinBalance,
  allWordsAtLeastBucket,
} from './coin-service';

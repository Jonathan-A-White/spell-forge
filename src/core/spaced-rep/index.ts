// src/core/spaced-rep/index.ts — barrel export

export { updateWordStats, calculateNextReview } from './scheduler';
export { transitionBucket } from './buckets';
export { computeDifficulty } from './difficulty';
export {
  earnCoinForMastery,
  canPlayFree,
  getWordsDueCount,
  spendCoinForGame,
  getCoinBalance,
} from './coin-service';

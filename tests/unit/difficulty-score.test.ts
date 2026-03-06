import { describe, it, expect } from 'vitest';
import { computeDifficulty } from '../../src/core/spaced-rep';
import type { WordStats, TechniqueResult } from '../../src/contracts/types';
import { createWordStats } from '../fixtures/word-lists';

// ─── Helpers ──────────────────────────────────────────────────

function makeResult(overrides?: Partial<TechniqueResult>): TechniqueResult {
  return {
    techniqueId: 'letter-bank',
    timestamp: new Date('2026-03-05T15:00:00'),
    correct: true,
    responseTimeMs: 5000,
    struggled: false,
    scaffoldingUsed: false,
    ...overrides,
  };
}

function makeStats(overrides?: Partial<WordStats>): WordStats {
  return createWordStats('word-test', 'profile-paul', overrides);
}

// ─── Difficulty Score Computation ─────────────────────────────

describe('computeDifficulty', () => {
  it('should return 0.5 for untested words (timesAsked === 0)', () => {
    const stats = makeStats({ timesAsked: 0 });
    expect(computeDifficulty(stats)).toBe(0.5);
  });

  it('should return low difficulty for perfect performance', () => {
    const history: TechniqueResult[] = Array.from({ length: 5 }, (_, i) =>
      makeResult({
        correct: true,
        responseTimeMs: 3000, // fast
        scaffoldingUsed: false,
        timestamp: new Date(`2026-03-0${i + 1}T15:00:00`),
      }),
    );

    const stats = makeStats({
      timesAsked: 5,
      timesWrong: 0,
      techniqueHistory: history,
    });

    const score = computeDifficulty(stats);
    expect(score).toBeLessThan(0.3);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('should return high difficulty for poor performance', () => {
    const history: TechniqueResult[] = Array.from({ length: 5 }, (_, i) =>
      makeResult({
        correct: false,
        responseTimeMs: 25000, // slow
        scaffoldingUsed: true,
        timestamp: new Date(`2026-03-0${i + 1}T15:00:00`),
      }),
    );

    const stats = makeStats({
      timesAsked: 5,
      timesWrong: 5,
      techniqueHistory: history,
    });

    const score = computeDifficulty(stats);
    expect(score).toBeGreaterThan(0.7);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('should increase difficulty with higher error rate', () => {
    const historyLow: TechniqueResult[] = Array.from({ length: 10 }, (_, i) =>
      makeResult({
        correct: i < 9, // 1 wrong out of 10
        responseTimeMs: 5000,
        scaffoldingUsed: false,
      }),
    );
    const statsLow = makeStats({
      timesAsked: 10,
      timesWrong: 1,
      techniqueHistory: historyLow,
    });

    const historyHigh: TechniqueResult[] = Array.from({ length: 10 }, (_, i) =>
      makeResult({
        correct: i < 3, // 7 wrong out of 10
        responseTimeMs: 5000,
        scaffoldingUsed: false,
      }),
    );
    const statsHigh = makeStats({
      timesAsked: 10,
      timesWrong: 7,
      techniqueHistory: historyHigh,
    });

    const scoreLow = computeDifficulty(statsLow);
    const scoreHigh = computeDifficulty(statsHigh);
    expect(scoreHigh).toBeGreaterThan(scoreLow);
  });

  it('should increase difficulty with slower response times', () => {
    const historyFast: TechniqueResult[] = Array.from({ length: 5 }, () =>
      makeResult({ responseTimeMs: 3000, correct: true }),
    );
    const statsFast = makeStats({
      timesAsked: 5,
      timesWrong: 0,
      techniqueHistory: historyFast,
    });

    const historySlow: TechniqueResult[] = Array.from({ length: 5 }, () =>
      makeResult({ responseTimeMs: 28000, correct: true }),
    );
    const statsSlow = makeStats({
      timesAsked: 5,
      timesWrong: 0,
      techniqueHistory: historySlow,
    });

    const scoreFast = computeDifficulty(statsFast);
    const scoreSlow = computeDifficulty(statsSlow);
    expect(scoreSlow).toBeGreaterThan(scoreFast);
  });

  it('should increase difficulty with more scaffolding usage', () => {
    const historyNoScaffold: TechniqueResult[] = Array.from({ length: 5 }, () =>
      makeResult({ scaffoldingUsed: false, correct: true }),
    );
    const statsNoScaffold = makeStats({
      timesAsked: 5,
      timesWrong: 0,
      techniqueHistory: historyNoScaffold,
    });

    const historyScaffold: TechniqueResult[] = Array.from({ length: 5 }, () =>
      makeResult({ scaffoldingUsed: true, correct: true }),
    );
    const statsScaffold = makeStats({
      timesAsked: 5,
      timesWrong: 0,
      techniqueHistory: historyScaffold,
    });

    const scoreNoScaffold = computeDifficulty(statsNoScaffold);
    const scoreScaffold = computeDifficulty(statsScaffold);
    expect(scoreScaffold).toBeGreaterThan(scoreNoScaffold);
  });

  it('should increase difficulty when last error is recent', () => {
    // Error was 5+ attempts ago
    const historyOld: TechniqueResult[] = [
      makeResult({ correct: false }),
      ...Array.from({ length: 6 }, () => makeResult({ correct: true })),
    ];
    const statsOld = makeStats({
      timesAsked: 7,
      timesWrong: 1,
      techniqueHistory: historyOld,
    });

    // Error was the last attempt
    const historyRecent: TechniqueResult[] = [
      ...Array.from({ length: 6 }, () => makeResult({ correct: true })),
      makeResult({ correct: false }),
    ];
    const statsRecent = makeStats({
      timesAsked: 7,
      timesWrong: 1,
      techniqueHistory: historyRecent,
    });

    const scoreOld = computeDifficulty(statsOld);
    const scoreRecent = computeDifficulty(statsRecent);
    expect(scoreRecent).toBeGreaterThan(scoreOld);
  });

  it('should return 0 recency factor when no errors exist', () => {
    const history: TechniqueResult[] = Array.from({ length: 5 }, () =>
      makeResult({ correct: true, responseTimeMs: 5000 }),
    );
    const stats = makeStats({
      timesAsked: 5,
      timesWrong: 0,
      techniqueHistory: history,
    });

    const score = computeDifficulty(stats);
    // With no errors, error rate=0, recency=0; only response time contributes
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(0.5);
  });

  it('should clamp difficulty between 0 and 1', () => {
    // Edge case: all zeros
    const statsMin = makeStats({
      timesAsked: 1,
      timesWrong: 0,
      techniqueHistory: [makeResult({ correct: true, responseTimeMs: 0, scaffoldingUsed: false })],
    });
    const scoreMin = computeDifficulty(statsMin);
    expect(scoreMin).toBeGreaterThanOrEqual(0);
    expect(scoreMin).toBeLessThanOrEqual(1);

    // Edge case: all maxed out
    const statsMax = makeStats({
      timesAsked: 1,
      timesWrong: 1,
      techniqueHistory: [makeResult({ correct: false, responseTimeMs: 50000, scaffoldingUsed: true })],
    });
    const scoreMax = computeDifficulty(statsMax);
    expect(scoreMax).toBeGreaterThanOrEqual(0);
    expect(scoreMax).toBeLessThanOrEqual(1);
  });

  it('should handle empty technique history gracefully', () => {
    const stats = makeStats({
      timesAsked: 3,
      timesWrong: 1,
      techniqueHistory: [],
    });

    const score = computeDifficulty(stats);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('should use only last 5 results for response time factor', () => {
    // 10 fast results followed by 5 slow ones
    const history: TechniqueResult[] = [
      ...Array.from({ length: 10 }, () => makeResult({ responseTimeMs: 1000, correct: true })),
      ...Array.from({ length: 5 }, () => makeResult({ responseTimeMs: 25000, correct: true })),
    ];

    const stats = makeStats({
      timesAsked: 15,
      timesWrong: 0,
      techniqueHistory: history,
    });

    const score = computeDifficulty(stats);
    // The response time factor should reflect the recent slow times, not the old fast ones
    // With 25000ms avg in last 5: responseTimeFactor = 25000/30000 ≈ 0.83
    // This contributes 0.25 * 0.83 ≈ 0.21 to the total
    expect(score).toBeGreaterThan(0.15);
  });

  it('should produce mid-range score for mixed performance', () => {
    const history: TechniqueResult[] = [
      makeResult({ correct: true, responseTimeMs: 8000, scaffoldingUsed: false }),
      makeResult({ correct: false, responseTimeMs: 15000, scaffoldingUsed: true }),
      makeResult({ correct: true, responseTimeMs: 10000, scaffoldingUsed: false }),
      makeResult({ correct: true, responseTimeMs: 7000, scaffoldingUsed: false }),
      makeResult({ correct: false, responseTimeMs: 12000, scaffoldingUsed: true }),
    ];

    const stats = makeStats({
      timesAsked: 5,
      timesWrong: 2,
      techniqueHistory: history,
    });

    const score = computeDifficulty(stats);
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.8);
  });
});

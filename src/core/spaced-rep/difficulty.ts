// src/core/spaced-rep/difficulty.ts — Difficulty score computation

import type { WordStats } from '../../contracts/types';

/**
 * Weights for difficulty score components.
 * These sum to 1.0.
 */
const WEIGHTS = {
  errorRate: 0.35,
  responseTime: 0.25,
  scaffolding: 0.20,
  recency: 0.20,
};

/**
 * Baseline response time in ms for a child spelling a word.
 * Times above this are considered slow; below is fast.
 */
const MAX_RESPONSE_MS = 30_000;

/**
 * Compute a difficulty score from 0.0 (easy) to 1.0 (hard) based on:
 * - Error rate: timesWrong / timesAsked
 * - Average response time: normalized against baseline
 * - Scaffolding frequency: how often scaffolding was used
 * - Recency of last error: more recent errors = higher difficulty
 */
export function computeDifficulty(stats: WordStats): number {
  if (stats.timesAsked === 0) {
    return 0.5; // default for untested words
  }

  const errorRate = computeErrorRate(stats);
  const responseTimeFactor = computeResponseTimeFactor(stats);
  const scaffoldingFactor = computeScaffoldingFactor(stats);
  const recencyFactor = computeRecencyFactor(stats);

  const raw =
    WEIGHTS.errorRate * errorRate +
    WEIGHTS.responseTime * responseTimeFactor +
    WEIGHTS.scaffolding * scaffoldingFactor +
    WEIGHTS.recency * recencyFactor;

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, raw));
}

function computeErrorRate(stats: WordStats): number {
  if (stats.timesAsked === 0) return 0;
  return stats.timesWrong / stats.timesAsked;
}

function computeResponseTimeFactor(stats: WordStats): number {
  const history = stats.techniqueHistory;
  if (history.length === 0) return 0.5;

  // Use the average of the last 5 attempts for responsiveness
  const recent = history.slice(-5);
  const avgTime = recent.reduce((sum, r) => sum + r.responseTimeMs, 0) / recent.length;

  // Normalize: 0ms = 0.0, BASELINE = 0.5, MAX = 1.0
  const clamped = Math.min(avgTime, MAX_RESPONSE_MS);
  return clamped / MAX_RESPONSE_MS;
}

function computeScaffoldingFactor(stats: WordStats): number {
  const history = stats.techniqueHistory;
  if (history.length === 0) return 0;

  const scaffoldedCount = history.filter(r => r.scaffoldingUsed).length;
  return scaffoldedCount / history.length;
}

function computeRecencyFactor(stats: WordStats): number {
  const history = stats.techniqueHistory;
  if (history.length === 0) return 0;

  // Find the most recent error
  let lastErrorIndex = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (!history[i].correct) {
      lastErrorIndex = i;
      break;
    }
  }

  if (lastErrorIndex === -1) {
    // No errors at all
    return 0;
  }

  // How recent is the last error? Index distance from the end.
  // If the last attempt was an error, recency = 1.0
  // If it was 5+ attempts ago, recency approaches 0.0
  const distance = history.length - 1 - lastErrorIndex;
  return Math.max(0, 1.0 - distance * 0.2);
}

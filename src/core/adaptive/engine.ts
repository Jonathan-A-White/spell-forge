// src/core/adaptive/engine.ts — Engagement signal processing → adaptive actions

import type { EngagementSignals, AdaptiveAction, TechniqueResult } from '../../contracts/types';

const FATIGUE_RESPONSE_TIME_INCREASE = 1.5; // 50% increase = fatigue
const FRUSTRATION_ERROR_RATE = 0.6;
const CONSECUTIVE_ERROR_THRESHOLD = 2;
const TOO_EASY_RESPONSE_TIME_MS = 2000;
const SESSION_TOLERANCE_BUFFER = 0.85; // wrap up at 85% of historical tolerance

export function analyzeEngagement(
  recentResults: TechniqueResult[],
  sessionDurationMs: number,
  historicalToleranceMs: number,
): EngagementSignals {
  const recent = recentResults.slice(-5);

  return {
    responseTimeTrend: computeResponseTimeTrend(recent),
    recentErrorRate: computeRecentErrorRate(recent),
    consecutiveErrors: computeConsecutiveErrors(recentResults),
    sessionDurationMs,
    historicalToleranceMs,
  };
}

export function determineAction(signals: EngagementSignals): AdaptiveAction {
  // Check session duration first — if approaching tolerance, wrap up
  if (
    signals.historicalToleranceMs > 0 &&
    signals.sessionDurationMs > signals.historicalToleranceMs * SESSION_TOLERANCE_BUFFER
  ) {
    return {
      type: 'wrap-up',
      reason: 'Approaching session tolerance limit — ending with a win',
    };
  }

  // Consecutive errors → frustration
  if (signals.consecutiveErrors >= CONSECUTIVE_ERROR_THRESHOLD) {
    if (signals.consecutiveErrors >= 3) {
      return {
        type: 'wrap-up',
        reason: 'Multiple consecutive errors — wrapping up to avoid frustration',
      };
    }
    return {
      type: 'easier-word',
      reason: 'Consecutive errors detected — switching to an easier word',
    };
  }

  // High error rate → more scaffolding
  if (signals.recentErrorRate >= FRUSTRATION_ERROR_RATE) {
    return {
      type: 'more-scaffolding',
      reason: 'High error rate — providing more scaffolding support',
    };
  }

  // Response times trending up → fatigue
  if (signals.responseTimeTrend === 'increasing') {
    return {
      type: 'wrap-up',
      reason: 'Response times increasing — session fatigue detected',
    };
  }

  // Very fast responses → too easy
  if (signals.responseTimeTrend === 'decreasing' && signals.recentErrorRate === 0) {
    return {
      type: 'switch-technique',
      reason: 'Very fast correct answers — increasing challenge',
    };
  }

  return {
    type: 'continue',
    reason: 'Engagement signals are healthy',
  };
}

function computeResponseTimeTrend(
  recent: TechniqueResult[],
): 'stable' | 'increasing' | 'decreasing' {
  if (recent.length < 3) return 'stable';

  const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
  const secondHalf = recent.slice(Math.floor(recent.length / 2));

  const avgFirst = average(firstHalf.map((r) => r.responseTimeMs));
  const avgSecond = average(secondHalf.map((r) => r.responseTimeMs));

  if (avgSecond > avgFirst * FATIGUE_RESPONSE_TIME_INCREASE) {
    return 'increasing';
  }
  if (avgSecond < TOO_EASY_RESPONSE_TIME_MS && avgFirst > TOO_EASY_RESPONSE_TIME_MS) {
    return 'decreasing';
  }
  return 'stable';
}

function computeRecentErrorRate(recent: TechniqueResult[]): number {
  if (recent.length === 0) return 0;
  const errors = recent.filter((r) => !r.correct).length;
  return errors / recent.length;
}

function computeConsecutiveErrors(results: TechniqueResult[]): number {
  let count = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (!results[i].correct) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

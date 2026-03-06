import { describe, it, expect } from 'vitest';
import { analyzeEngagement, determineAction } from '../../src/core/adaptive/engine';
import type { TechniqueResult, EngagementSignals } from '../../src/contracts/types';

function makeResult(overrides: Partial<TechniqueResult> = {}): TechniqueResult {
  return {
    techniqueId: 'letter-bank',
    timestamp: new Date(),
    correct: true,
    responseTimeMs: 5000,
    struggled: false,
    scaffoldingUsed: false,
    ...overrides,
  };
}

describe('Adaptive Engine', () => {
  describe('analyzeEngagement', () => {
    it('should return stable trend for consistent response times', () => {
      const results = Array.from({ length: 5 }, () => makeResult({ responseTimeMs: 5000 }));
      const signals = analyzeEngagement(results, 30000, 300000);
      expect(signals.responseTimeTrend).toBe('stable');
    });

    it('should detect increasing response times (fatigue)', () => {
      const results = [
        makeResult({ responseTimeMs: 3000 }),
        makeResult({ responseTimeMs: 3500 }),
        makeResult({ responseTimeMs: 4000 }),
        makeResult({ responseTimeMs: 7000 }),
        makeResult({ responseTimeMs: 9000 }),
      ];
      const signals = analyzeEngagement(results, 60000, 300000);
      expect(signals.responseTimeTrend).toBe('increasing');
    });

    it('should compute correct error rate', () => {
      const results = [
        makeResult({ correct: true }),
        makeResult({ correct: false }),
        makeResult({ correct: false }),
        makeResult({ correct: true }),
        makeResult({ correct: false }),
      ];
      const signals = analyzeEngagement(results, 30000, 300000);
      expect(signals.recentErrorRate).toBeCloseTo(0.6, 1);
    });

    it('should count consecutive errors from the end', () => {
      const results = [
        makeResult({ correct: true }),
        makeResult({ correct: true }),
        makeResult({ correct: false }),
        makeResult({ correct: false }),
        makeResult({ correct: false }),
      ];
      const signals = analyzeEngagement(results, 30000, 300000);
      expect(signals.consecutiveErrors).toBe(3);
    });

    it('should reset consecutive errors on correct answer', () => {
      const results = [
        makeResult({ correct: false }),
        makeResult({ correct: false }),
        makeResult({ correct: true }),
      ];
      const signals = analyzeEngagement(results, 30000, 300000);
      expect(signals.consecutiveErrors).toBe(0);
    });
  });

  describe('determineAction', () => {
    it('should continue when signals are healthy', () => {
      const signals: EngagementSignals = {
        responseTimeTrend: 'stable',
        recentErrorRate: 0.2,
        consecutiveErrors: 0,
        sessionDurationMs: 60000,
        historicalToleranceMs: 300000,
      };
      const action = determineAction(signals);
      expect(action.type).toBe('continue');
    });

    it('should wrap up when approaching session tolerance', () => {
      const signals: EngagementSignals = {
        responseTimeTrend: 'stable',
        recentErrorRate: 0.1,
        consecutiveErrors: 0,
        sessionDurationMs: 260000,
        historicalToleranceMs: 300000,
      };
      const action = determineAction(signals);
      expect(action.type).toBe('wrap-up');
    });

    it('should switch to easier word on consecutive errors', () => {
      const signals: EngagementSignals = {
        responseTimeTrend: 'stable',
        recentErrorRate: 0.4,
        consecutiveErrors: 2,
        sessionDurationMs: 60000,
        historicalToleranceMs: 300000,
      };
      const action = determineAction(signals);
      expect(action.type).toBe('easier-word');
    });

    it('should wrap up on 3+ consecutive errors', () => {
      const signals: EngagementSignals = {
        responseTimeTrend: 'stable',
        recentErrorRate: 0.6,
        consecutiveErrors: 3,
        sessionDurationMs: 60000,
        historicalToleranceMs: 300000,
      };
      const action = determineAction(signals);
      expect(action.type).toBe('wrap-up');
    });

    it('should provide more scaffolding on high error rate', () => {
      const signals: EngagementSignals = {
        responseTimeTrend: 'stable',
        recentErrorRate: 0.7,
        consecutiveErrors: 1,
        sessionDurationMs: 60000,
        historicalToleranceMs: 300000,
      };
      const action = determineAction(signals);
      expect(action.type).toBe('more-scaffolding');
    });

    it('should wrap up on fatigue (increasing response times)', () => {
      const signals: EngagementSignals = {
        responseTimeTrend: 'increasing',
        recentErrorRate: 0.3,
        consecutiveErrors: 0,
        sessionDurationMs: 120000,
        historicalToleranceMs: 300000,
      };
      const action = determineAction(signals);
      expect(action.type).toBe('wrap-up');
    });
  });
});

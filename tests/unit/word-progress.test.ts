import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import type { AccessibilitySettings, WordBucket } from '../../src/contracts/types';

// ─── Helpers ───────────────────────────────────────────────────

const defaultSettings: AccessibilitySettings = {
  fontSize: 24,
  fontWeight: 'normal',
  fontFamily: 'sans-serif',
  letterSpacing: 0,
  lineHeight: 1.5,
  contrastMode: 'light',
  backgroundColor: '#ffffff',
  reducedMotion: false,
  sessionMaxMinutes: 15,
  sessionAdaptive: true,
  dailyGoalMinutes: 10,
  tapTargetSize: 48,
};

/**
 * Calculate the readiness target: how many words need to be ready
 * based on the grade goal percentage.
 */
function computeReadinessTarget(totalWords: number, gradeGoal: number): number {
  return Math.ceil(totalWords * gradeGoal / 100);
}

/**
 * Calculate readiness percentage, guarding against division by zero.
 */
function computeReadinessPercent(wordsReady: number, readinessTarget: number): number {
  if (readinessTarget === 0) return 0;
  return Math.min(100, (wordsReady / readinessTarget) * 100);
}

/**
 * Bucket transition thresholds mirror the spaced-rep logic.
 */
interface NextLevelRequirement {
  nextBucket: WordBucket | null;
  consecutiveCorrectNeeded: number;
  distinctDaysNeeded: number;
  description: string;
}

function getNextLevelRequirement(
  currentBucket: WordBucket,
  consecutiveCorrect: number,
  distinctDays: number,
): NextLevelRequirement {
  switch (currentBucket) {
    case 'new':
      return {
        nextBucket: 'learning',
        consecutiveCorrectNeeded: 0,
        distinctDaysNeeded: 0,
        description: 'Start practicing to move to Learning',
      };
    case 'learning':
      return {
        nextBucket: 'familiar',
        consecutiveCorrectNeeded: Math.max(0, 3 - consecutiveCorrect),
        distinctDaysNeeded: 0,
        description: `Need ${Math.max(0, 3 - consecutiveCorrect)} more consecutive correct to reach Familiar`,
      };
    case 'familiar':
      return {
        nextBucket: 'mastered',
        consecutiveCorrectNeeded: Math.max(0, 5 - consecutiveCorrect),
        distinctDaysNeeded: Math.max(0, 3 - distinctDays),
        description: `Need ${Math.max(0, 5 - consecutiveCorrect)} more consecutive correct and ${Math.max(0, 3 - distinctDays)} more distinct days to reach Mastered`,
      };
    case 'mastered':
      return {
        nextBucket: null,
        consecutiveCorrectNeeded: 0,
        distinctDaysNeeded: 0,
        description: 'Word is mastered! Keep reviewing to maintain.',
      };
    case 'review':
      return {
        nextBucket: 'familiar',
        consecutiveCorrectNeeded: Math.max(0, 3 - consecutiveCorrect),
        distinctDaysNeeded: 0,
        description: `Need ${Math.max(0, 3 - consecutiveCorrect)} more consecutive correct to return to Familiar`,
      };
  }
}

// ─── Test Suite ────────────────────────────────────────────────

// ─── 1. Grade Goal Readiness Calculation ─────────────────────

describe('grade goal readiness calculation', () => {
  it('100% goal with 10 words, 4 ready gives target=10 and percent=40%', () => {
    const target = computeReadinessTarget(10, 100);
    const percent = computeReadinessPercent(4, target);
    expect(target).toBe(10);
    expect(percent).toBe(40);
  });

  it('90% goal with 10 words, 9 ready gives target=9 and percent=100%', () => {
    const target = computeReadinessTarget(10, 90);
    const percent = computeReadinessPercent(9, target);
    expect(target).toBe(9);
    expect(percent).toBe(100);
  });

  it('90% goal with 10 words, 4 ready gives target=9 and percent≈44.4%', () => {
    const target = computeReadinessTarget(10, 90);
    const percent = computeReadinessPercent(4, target);
    expect(target).toBe(9);
    expect(percent).toBeCloseTo(44.4, 1);
  });

  it('80% goal with 10 words, 8 ready gives target=8 and percent=100%', () => {
    const target = computeReadinessTarget(10, 80);
    const percent = computeReadinessPercent(8, target);
    expect(target).toBe(8);
    expect(percent).toBe(100);
  });

  it('80% goal with 5 words, 3 ready gives target=4 and percent=75%', () => {
    const target = computeReadinessTarget(5, 80);
    const percent = computeReadinessPercent(3, target);
    expect(target).toBe(4);
    expect(percent).toBe(75);
  });

  it('0 total words does not cause division by zero and returns 0%', () => {
    const target = computeReadinessTarget(0, 100);
    const percent = computeReadinessPercent(0, target);
    expect(target).toBe(0);
    expect(percent).toBe(0);
  });

  it('caps readiness at 100% when wordsReady exceeds target', () => {
    const target = computeReadinessTarget(10, 80); // target = 8
    const percent = computeReadinessPercent(10, target); // 10/8 = 125% -> capped to 100
    expect(target).toBe(8);
    expect(percent).toBe(100);
  });
});

// ─── 2. Next-Level Requirements Computation ──────────────────

describe('next-level requirements computation', () => {
  describe('New → Learning', () => {
    it('just needs to start practicing', () => {
      const req = getNextLevelRequirement('new', 0, 0);
      expect(req.nextBucket).toBe('learning');
      expect(req.consecutiveCorrectNeeded).toBe(0);
      expect(req.distinctDaysNeeded).toBe(0);
      expect(req.description).toContain('Start practicing');
    });
  });

  describe('Learning → Familiar', () => {
    it('needs 3 consecutive correct when starting at 0', () => {
      const req = getNextLevelRequirement('learning', 0, 0);
      expect(req.nextBucket).toBe('familiar');
      expect(req.consecutiveCorrectNeeded).toBe(3);
    });

    it('needs 2 more consecutive correct when at 1', () => {
      const req = getNextLevelRequirement('learning', 1, 0);
      expect(req.nextBucket).toBe('familiar');
      expect(req.consecutiveCorrectNeeded).toBe(2);
    });

    it('needs 1 more consecutive correct when at 2', () => {
      const req = getNextLevelRequirement('learning', 2, 0);
      expect(req.nextBucket).toBe('familiar');
      expect(req.consecutiveCorrectNeeded).toBe(1);
    });

    it('needs 0 more consecutive correct when already at 3', () => {
      const req = getNextLevelRequirement('learning', 3, 0);
      expect(req.nextBucket).toBe('familiar');
      expect(req.consecutiveCorrectNeeded).toBe(0);
    });
  });

  describe('Familiar → Mastered', () => {
    it('needs 5 consecutive correct AND 3 distinct days from scratch', () => {
      const req = getNextLevelRequirement('familiar', 0, 0);
      expect(req.nextBucket).toBe('mastered');
      expect(req.consecutiveCorrectNeeded).toBe(5);
      expect(req.distinctDaysNeeded).toBe(3);
    });

    it('needs 2 more correct and 1 more day when at 3 correct and 2 days', () => {
      const req = getNextLevelRequirement('familiar', 3, 2);
      expect(req.nextBucket).toBe('mastered');
      expect(req.consecutiveCorrectNeeded).toBe(2);
      expect(req.distinctDaysNeeded).toBe(1);
    });

    it('needs 0 more correct and 0 more days when requirements met', () => {
      const req = getNextLevelRequirement('familiar', 5, 3);
      expect(req.nextBucket).toBe('mastered');
      expect(req.consecutiveCorrectNeeded).toBe(0);
      expect(req.distinctDaysNeeded).toBe(0);
    });
  });

  describe('Mastered', () => {
    it('has no next level and shows review info', () => {
      const req = getNextLevelRequirement('mastered', 10, 5);
      expect(req.nextBucket).toBeNull();
      expect(req.consecutiveCorrectNeeded).toBe(0);
      expect(req.distinctDaysNeeded).toBe(0);
      expect(req.description).toContain('mastered');
    });
  });
});

// ─── 3. Profile gradeGoal Defaults ───────────────────────────

describe('profile gradeGoal defaults', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('gradeGoal defaults to undefined when not provided', async () => {
    const profile = await profileRepo.create({
      name: 'Test Child',
      avatar: 'avatar1',
      themeId: 'theme-castle',
      createdAt: new Date('2026-01-01'),
      settings: { ...defaultSettings },
    });
    expect(profile.gradeGoal).toBeUndefined();
  });

  it('gradeGoal can be set to 80', async () => {
    const profile = await profileRepo.create({
      name: 'Test Child',
      avatar: 'avatar1',
      themeId: 'theme-castle',
      createdAt: new Date('2026-01-01'),
      settings: { ...defaultSettings },
      gradeGoal: 80,
    });
    expect(profile.gradeGoal).toBe(80);

    const fetched = await profileRepo.getById(profile.id);
    expect(fetched!.gradeGoal).toBe(80);
  });

  it('gradeGoal can be set to 90', async () => {
    const profile = await profileRepo.create({
      name: 'Test Child',
      avatar: 'avatar1',
      themeId: 'theme-castle',
      createdAt: new Date('2026-01-01'),
      settings: { ...defaultSettings },
      gradeGoal: 90,
    });
    expect(profile.gradeGoal).toBe(90);

    const fetched = await profileRepo.getById(profile.id);
    expect(fetched!.gradeGoal).toBe(90);
  });

  it('gradeGoal can be set to 100', async () => {
    const profile = await profileRepo.create({
      name: 'Test Child',
      avatar: 'avatar1',
      themeId: 'theme-castle',
      createdAt: new Date('2026-01-01'),
      settings: { ...defaultSettings },
      gradeGoal: 100,
    });
    expect(profile.gradeGoal).toBe(100);

    const fetched = await profileRepo.getById(profile.id);
    expect(fetched!.gradeGoal).toBe(100);
  });

  it('gradeGoal can be updated on an existing profile', async () => {
    const profile = await profileRepo.create({
      name: 'Test Child',
      avatar: 'avatar1',
      themeId: 'theme-castle',
      createdAt: new Date('2026-01-01'),
      settings: { ...defaultSettings },
    });
    expect(profile.gradeGoal).toBeUndefined();

    const updated = await profileRepo.update(profile.id, { gradeGoal: 90 });
    expect(updated.gradeGoal).toBe(90);
  });
});

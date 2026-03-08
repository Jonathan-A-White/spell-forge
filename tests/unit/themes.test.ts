import { describe, it, expect, beforeEach } from 'vitest';
import { themeEngine } from '../../src/themes/engine.ts';
import { dragonForgeTheme } from '../../src/themes/dragon-forge/theme.ts';
import { monsterLabTheme } from '../../src/themes/monster-lab/theme.ts';
import { starTrailTheme } from '../../src/themes/star-trail/theme.ts';
import { rewardTracker } from '../../src/features/rewards/reward-tracker.ts';
import { monsterCollection } from '../../src/features/rewards/monster-collection.ts';
import type { AppEvent, Theme } from '../../src/contracts/types.ts';

// ─── Theme Loading ───────────────────────────────────────────

describe('Theme Loading', () => {
  it('loads all 3 themes', () => {
    const themes = themeEngine.getAllThemes();
    expect(themes).toHaveLength(3);
  });

  it('retrieves Dragon Forge theme by id', () => {
    const theme = themeEngine.getTheme('dragon-forge');
    expect(theme).toBe(dragonForgeTheme);
  });

  it('retrieves Monster Lab theme by id', () => {
    const theme = themeEngine.getTheme('monster-lab');
    expect(theme).toBe(monsterLabTheme);
  });

  it('retrieves Star Trail theme by id', () => {
    const theme = themeEngine.getTheme('star-trail');
    expect(theme).toBe(starTrailTheme);
  });

  it('throws for unknown theme id', () => {
    expect(() => themeEngine.getTheme('nonexistent')).toThrow('Theme not found: nonexistent');
  });
});

// ─── Theme Definitions ───────────────────────────────────────

describe('Dragon Forge Theme', () => {
  it('has correct reward mechanic', () => {
    expect(dragonForgeTheme.rewardMechanic.type).toBe('build');
    expect(dragonForgeTheme.rewardMechanic.unitName).toBe('scales');
    expect(dragonForgeTheme.rewardMechanic.progressPerCorrect).toBe(1);
    expect(dragonForgeTheme.rewardMechanic.progressPerSession).toBe(3);
  });

  it('has 5 milestones in correct order', () => {
    expect(dragonForgeTheme.rewardMechanic.milestoneNames).toEqual([
      'Egg', 'Hatching', 'Baby Dragon', 'Young Dragon', 'Full Dragon',
    ]);
  });

  it('has fiery palette colors', () => {
    const { palette } = dragonForgeTheme;
    // Primary should be a reddish hue
    expect(palette.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(palette.secondary).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(palette.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

describe('Monster Lab Theme', () => {
  it('has correct reward mechanic', () => {
    expect(monsterLabTheme.rewardMechanic.type).toBe('build');
    expect(monsterLabTheme.rewardMechanic.unitName).toBe('blocks');
    expect(monsterLabTheme.rewardMechanic.progressPerCorrect).toBe(1);
    expect(monsterLabTheme.rewardMechanic.progressPerSession).toBe(3);
  });

  it('has 5 milestones in correct order', () => {
    expect(monsterLabTheme.rewardMechanic.milestoneNames).toEqual([
      'Blueprint', 'Base', 'Body', 'Details', 'Complete Creature',
    ]);
  });

  it('has vibrant palette colors', () => {
    const { palette } = monsterLabTheme;
    expect(palette.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(palette.secondary).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(palette.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

describe('Star Trail Theme', () => {
  it('has correct reward mechanic', () => {
    expect(starTrailTheme.rewardMechanic.type).toBe('collect');
    expect(starTrailTheme.rewardMechanic.unitName).toBe('stars');
    expect(starTrailTheme.rewardMechanic.progressPerCorrect).toBe(1);
    expect(starTrailTheme.rewardMechanic.progressPerSession).toBe(3);
  });

  it('has 5 milestones in correct order', () => {
    expect(starTrailTheme.rewardMechanic.milestoneNames).toEqual([
      'First Light', 'Cluster', 'Constellation', 'Galaxy', 'Universe',
    ]);
  });

  it('has navy/gold/silver palette colors', () => {
    const { palette } = starTrailTheme;
    expect(palette.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(palette.secondary).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(palette.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

// ─── Theme Palette Validation ────────────────────────────────

describe('Theme Palette Validation', () => {
  const allThemes: Theme[] = [dragonForgeTheme, monsterLabTheme, starTrailTheme];

  for (const theme of allThemes) {
    describe(`${theme.name} palette`, () => {
      const paletteKeys: (keyof typeof theme.palette)[] = [
        'primary', 'secondary', 'accent', 'background', 'text', 'success', 'error',
      ];

      for (const key of paletteKeys) {
        it(`has valid hex color for ${key}`, () => {
          expect(theme.palette[key]).toMatch(/^#[0-9A-Fa-f]{6}$/);
        });
      }
    });
  }
});

// ─── Theme Visual Effects Validation ────────────────────────

describe('Theme Visual Effects', () => {
  const allThemes: Theme[] = [dragonForgeTheme, monsterLabTheme, starTrailTheme];

  for (const theme of allThemes) {
    describe(`${theme.name} visualEffects`, () => {
      it('has a CSS gradient string', () => {
        expect(theme.visualEffects.gradient).toContain('linear-gradient');
      });

      it('has a glowColor as rgba', () => {
        expect(theme.visualEffects.glowColor).toMatch(/^rgba\(/);
      });

      it('has 2-3 particleColors', () => {
        expect(theme.visualEffects.particleColors.length).toBeGreaterThanOrEqual(2);
        expect(theme.visualEffects.particleColors.length).toBeLessThanOrEqual(3);
      });

      it('has a shadowColor as rgba', () => {
        expect(theme.visualEffects.shadowColor).toMatch(/^rgba\(/);
      });

      it('has a progress gradient', () => {
        expect(theme.visualEffects.progressGradient).toContain('linear-gradient');
      });
    });
  }

  it('getVisualEffects returns effects for a valid theme', () => {
    const vfx = themeEngine.getVisualEffects('dragon-forge');
    expect(vfx.gradient).toContain('linear-gradient');
    expect(vfx.particleColors).toHaveLength(3);
  });
});

// ─── Reward Calculation ──────────────────────────────────────

describe('Reward Calculation', () => {
  it('awards 1 unit for a correct word attempt', () => {
    const event: AppEvent = {
      type: 'word:attempted',
      payload: { wordId: 'w1', correct: true, technique: 'flashcard', responseTimeMs: 2000, struggled: false },
    };
    const reward = themeEngine.calculateReward(event, 'dragon-forge', 0);
    expect(reward.unitsEarned).toBe(1);
    expect(reward.totalProgress).toBe(1);
    expect(reward.themeId).toBe('dragon-forge');
  });

  it('awards 0 units for an incorrect word attempt', () => {
    const event: AppEvent = {
      type: 'word:attempted',
      payload: { wordId: 'w1', correct: false, technique: 'flashcard', responseTimeMs: 2000, struggled: false },
    };
    const reward = themeEngine.calculateReward(event, 'dragon-forge', 5);
    expect(reward.unitsEarned).toBe(0);
    expect(reward.totalProgress).toBe(5);
  });

  it('awards session completion bonus of 3 units', () => {
    const event: AppEvent = {
      type: 'session:ended',
      payload: {
        sessionLog: {
          id: 's1',
          profileId: 'p1',
          startedAt: new Date(),
          endedAt: new Date(),
          wordsAttempted: 10,
          wordsCorrect: 8,
          engagementScore: 0.9,
          endReason: 'completed',
          rewardEarned: null,
        },
      },
    };
    const reward = themeEngine.calculateReward(event, 'star-trail', 5);
    expect(reward.unitsEarned).toBe(3);
    expect(reward.totalProgress).toBe(8);
  });

  it('awards streak bonus equal to current streak count', () => {
    const event: AppEvent = {
      type: 'streak:updated',
      payload: {
        profileId: 'p1',
        currentStreak: 5,
        longestStreak: 10,
        lastSessionDate: new Date(),
        weeklyProgress: [],
      },
    };
    const reward = themeEngine.calculateReward(event, 'monster-lab', 10);
    expect(reward.unitsEarned).toBe(5);
    expect(reward.totalProgress).toBe(15);
  });

  it('awards 0 units for non-reward events', () => {
    const event: AppEvent = {
      type: 'session:started',
      payload: { profileId: 'p1' },
    };
    const reward = themeEngine.calculateReward(event, 'dragon-forge', 10);
    expect(reward.unitsEarned).toBe(0);
    expect(reward.totalProgress).toBe(10);
  });
});

// ─── Milestone Transitions ───────────────────────────────────

describe('Milestone Transitions', () => {
  const UNITS = themeEngine.UNITS_PER_MILESTONE; // 10

  it('detects milestone reached when crossing threshold', () => {
    const event: AppEvent = {
      type: 'word:attempted',
      payload: { wordId: 'w1', correct: true, technique: 'flashcard', responseTimeMs: 2000, struggled: false },
    };
    // Progress at 9, earning 1 should cross to milestone index 1 (Hatching)
    const reward = themeEngine.calculateReward(event, 'dragon-forge', UNITS - 1);
    expect(reward.milestoneReached).toBe('Hatching');
    expect(reward.totalProgress).toBe(UNITS);
  });

  it('returns null milestone when no threshold crossed', () => {
    const event: AppEvent = {
      type: 'word:attempted',
      payload: { wordId: 'w1', correct: true, technique: 'flashcard', responseTimeMs: 2000, struggled: false },
    };
    const reward = themeEngine.calculateReward(event, 'dragon-forge', 5);
    expect(reward.milestoneReached).toBeNull();
  });

  it('detects each milestone at correct thresholds for Dragon Forge', () => {
    const milestones = dragonForgeTheme.rewardMechanic.milestoneNames;
    const correctEvent: AppEvent = {
      type: 'word:attempted',
      payload: { wordId: 'w1', correct: true, technique: 'flashcard', responseTimeMs: 2000, struggled: false },
    };

    // milestones[0] = "Egg" is the starting milestone (index 0, progress 0-9)
    // Crossing from 9->10 should reach milestones[1] = "Hatching"
    for (let i = 1; i < milestones.length; i++) {
      const threshold = i * UNITS;
      const reward = themeEngine.calculateReward(correctEvent, 'dragon-forge', threshold - 1);
      expect(reward.milestoneReached).toBe(milestones[i]);
    }
  });

  it('does not detect milestone beyond the last one', () => {
    const event: AppEvent = {
      type: 'session:ended',
      payload: {
        sessionLog: {
          id: 's1',
          profileId: 'p1',
          startedAt: new Date(),
          endedAt: new Date(),
          wordsAttempted: 10,
          wordsCorrect: 10,
          engagementScore: 1.0,
          endReason: 'completed',
          rewardEarned: null,
        },
      },
    };
    // Already at max milestone (index 4, progress >= 40), earning 3 more shouldn't trigger
    const reward = themeEngine.calculateReward(event, 'dragon-forge', 45);
    expect(reward.milestoneReached).toBeNull();
  });
});

// ─── getMilestoneStatus ──────────────────────────────────────

describe('getMilestoneStatus', () => {
  const UNITS = themeEngine.UNITS_PER_MILESTONE;

  it('returns first milestone at progress 0', () => {
    const status = themeEngine.getMilestoneStatus('dragon-forge', 0);
    expect(status.current).toBe('Egg');
    expect(status.next).toBe('Hatching');
    expect(status.progressToNext).toBe(UNITS);
  });

  it('returns correct progress within a milestone', () => {
    const status = themeEngine.getMilestoneStatus('dragon-forge', 7);
    expect(status.current).toBe('Egg');
    expect(status.next).toBe('Hatching');
    expect(status.progressToNext).toBe(3);
  });

  it('returns second milestone at progress = UNITS_PER_MILESTONE', () => {
    const status = themeEngine.getMilestoneStatus('dragon-forge', UNITS);
    expect(status.current).toBe('Hatching');
    expect(status.next).toBe('Baby Dragon');
    expect(status.progressToNext).toBe(UNITS);
  });

  it('returns last milestone with no next', () => {
    const status = themeEngine.getMilestoneStatus('dragon-forge', UNITS * 4);
    expect(status.current).toBe('Full Dragon');
    expect(status.next).toBeNull();
    expect(status.progressToNext).toBe(0);
  });

  it('clamps to last milestone when progress far exceeds max', () => {
    const status = themeEngine.getMilestoneStatus('dragon-forge', 999);
    expect(status.current).toBe('Full Dragon');
    expect(status.next).toBeNull();
  });

  it('works correctly for Star Trail theme', () => {
    const status = themeEngine.getMilestoneStatus('star-trail', UNITS * 2 + 5);
    expect(status.current).toBe('Constellation');
    expect(status.next).toBe('Galaxy');
    expect(status.progressToNext).toBe(5);
  });

  it('works correctly for Monster Lab theme', () => {
    const status = themeEngine.getMilestoneStatus('monster-lab', UNITS * 3);
    expect(status.current).toBe('Details');
    expect(status.next).toBe('Complete Creature');
    expect(status.progressToNext).toBe(UNITS);
  });
});

// ─── RewardTracker ───────────────────────────────────────────

describe('RewardTracker', () => {
  beforeEach(() => {
    rewardTracker.resetAll();
  });

  it('starts with 0 progress for a new profile', () => {
    expect(rewardTracker.getProgress('p1', 'dragon-forge')).toBe(0);
  });

  it('accumulates progress via processEvent', () => {
    const correctEvent: AppEvent = {
      type: 'word:attempted',
      payload: { wordId: 'w1', correct: true, technique: 'flashcard', responseTimeMs: 2000, struggled: false },
    };

    const reward1 = rewardTracker.processEvent('p1', 'dragon-forge', correctEvent);
    expect(reward1.totalProgress).toBe(1);

    const reward2 = rewardTracker.processEvent('p1', 'dragon-forge', correctEvent);
    expect(reward2.totalProgress).toBe(2);

    expect(rewardTracker.getProgress('p1', 'dragon-forge')).toBe(2);
  });

  it('tracks progress independently per profile and theme', () => {
    const correctEvent: AppEvent = {
      type: 'word:attempted',
      payload: { wordId: 'w1', correct: true, technique: 'flashcard', responseTimeMs: 2000, struggled: false },
    };

    rewardTracker.processEvent('p1', 'dragon-forge', correctEvent);
    rewardTracker.processEvent('p1', 'dragon-forge', correctEvent);
    rewardTracker.processEvent('p2', 'star-trail', correctEvent);

    expect(rewardTracker.getProgress('p1', 'dragon-forge')).toBe(2);
    expect(rewardTracker.getProgress('p2', 'star-trail')).toBe(1);
    expect(rewardTracker.getProgress('p1', 'star-trail')).toBe(0);
  });

  it('returns milestone status for a profile', () => {
    rewardTracker.setProgress('p1', 'dragon-forge', 15);
    const status = rewardTracker.getMilestoneStatus('p1', 'dragon-forge');
    expect(status.current).toBe('Hatching');
    expect(status.next).toBe('Baby Dragon');
    expect(status.progressToNext).toBe(5);
  });

  it('resets progress for a specific profile and theme', () => {
    rewardTracker.setProgress('p1', 'dragon-forge', 20);
    rewardTracker.setProgress('p1', 'star-trail', 10);
    rewardTracker.resetProgress('p1', 'dragon-forge');

    expect(rewardTracker.getProgress('p1', 'dragon-forge')).toBe(0);
    expect(rewardTracker.getProgress('p1', 'star-trail')).toBe(10);
  });

  it('resets all progress', () => {
    rewardTracker.setProgress('p1', 'dragon-forge', 20);
    rewardTracker.setProgress('p2', 'star-trail', 10);
    rewardTracker.resetAll();

    expect(rewardTracker.getProgress('p1', 'dragon-forge')).toBe(0);
    expect(rewardTracker.getProgress('p2', 'star-trail')).toBe(0);
  });

  it('detects milestone transition through processEvent', () => {
    const UNITS = themeEngine.UNITS_PER_MILESTONE;
    rewardTracker.setProgress('p1', 'monster-lab', UNITS - 1);

    const correctEvent: AppEvent = {
      type: 'word:attempted',
      payload: { wordId: 'w1', correct: true, technique: 'flashcard', responseTimeMs: 2000, struggled: false },
    };

    const reward = rewardTracker.processEvent('p1', 'monster-lab', correctEvent);
    expect(reward.milestoneReached).toBe('Base');
    expect(reward.totalProgress).toBe(UNITS);
  });
});

// ─── Creature Completion ─────────────────────────────────────

describe('Creature Completion Detection', () => {
  const UNITS = themeEngine.UNITS_PER_MILESTONE;
  const MAX_PROGRESS = monsterLabTheme.rewardMechanic.milestoneNames.length * UNITS; // 50

  it('sets creatureCompleted=false when not at max progress', () => {
    const event: AppEvent = {
      type: 'word:attempted',
      payload: { wordId: 'w1', correct: true, technique: 'flashcard', responseTimeMs: 2000, struggled: false },
    };
    const reward = themeEngine.calculateReward(event, 'monster-lab', 5);
    expect(reward.creatureCompleted).toBe(false);
  });

  it('sets creatureCompleted=true when crossing max progress', () => {
    const event: AppEvent = {
      type: 'word:attempted',
      payload: { wordId: 'w1', correct: true, technique: 'flashcard', responseTimeMs: 2000, struggled: false },
    };
    const reward = themeEngine.calculateReward(event, 'monster-lab', MAX_PROGRESS - 1);
    expect(reward.creatureCompleted).toBe(true);
    expect(reward.totalProgress).toBe(MAX_PROGRESS);
  });

  it('does not re-trigger creatureCompleted if already past max', () => {
    const event: AppEvent = {
      type: 'word:attempted',
      payload: { wordId: 'w1', correct: true, technique: 'flashcard', responseTimeMs: 2000, struggled: false },
    };
    const reward = themeEngine.calculateReward(event, 'monster-lab', MAX_PROGRESS + 5);
    expect(reward.creatureCompleted).toBe(false);
  });
});

describe('getMaxProgress', () => {
  it('returns correct max progress for monster-lab (5 milestones * 10 units)', () => {
    expect(themeEngine.getMaxProgress('monster-lab')).toBe(50);
  });

  it('returns correct max progress for dragon-forge', () => {
    expect(themeEngine.getMaxProgress('dragon-forge')).toBe(50);
  });
});

// ─── Monster Collection ──────────────────────────────────────

describe('Monster Collection', () => {
  beforeEach(() => {
    monsterCollection.resetAll();
  });

  it('starts with empty collection', () => {
    expect(monsterCollection.getCollection('p1')).toEqual([]);
    expect(monsterCollection.getCollectionCount('p1')).toBe(0);
  });

  it('adds a creature to the collection', () => {
    const creature = monsterCollection.addCreature('p1', 'monster-lab', 50);
    expect(creature.profileId).toBe('p1');
    expect(creature.themeId).toBe('monster-lab');
    expect(creature.totalBlocksUsed).toBe(50);
    expect(creature.name).toBeTruthy();
    expect(creature.id).toMatch(/^creature-/);

    expect(monsterCollection.getCollectionCount('p1')).toBe(1);
    expect(monsterCollection.getCollection('p1')).toHaveLength(1);
  });

  it('accumulates multiple creatures', () => {
    monsterCollection.addCreature('p1', 'monster-lab', 50);
    monsterCollection.addCreature('p1', 'monster-lab', 50);
    monsterCollection.addCreature('p1', 'monster-lab', 50);

    expect(monsterCollection.getCollectionCount('p1')).toBe(3);
  });

  it('tracks collections independently per profile', () => {
    monsterCollection.addCreature('p1', 'monster-lab', 50);
    monsterCollection.addCreature('p2', 'monster-lab', 50);

    expect(monsterCollection.getCollectionCount('p1')).toBe(1);
    expect(monsterCollection.getCollectionCount('p2')).toBe(1);
  });

  it('resets a single profile collection', () => {
    monsterCollection.addCreature('p1', 'monster-lab', 50);
    monsterCollection.addCreature('p2', 'monster-lab', 50);
    monsterCollection.resetCollection('p1');

    expect(monsterCollection.getCollectionCount('p1')).toBe(0);
    expect(monsterCollection.getCollectionCount('p2')).toBe(1);
  });

  it('resets all collections', () => {
    monsterCollection.addCreature('p1', 'monster-lab', 50);
    monsterCollection.addCreature('p2', 'monster-lab', 50);
    monsterCollection.resetAll();

    expect(monsterCollection.getCollectionCount('p1')).toBe(0);
    expect(monsterCollection.getCollectionCount('p2')).toBe(0);
  });

  it('generates a name with two words', () => {
    const name = monsterCollection.generateCreatureName();
    const parts = name.split(' ');
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });
});

// ─── RewardTracker + Collection Integration ──────────────────

describe('RewardTracker Collection Integration', () => {
  const UNITS = themeEngine.UNITS_PER_MILESTONE;

  beforeEach(() => {
    rewardTracker.resetAll();
    monsterCollection.resetAll();
  });

  it('archives creature and resets progress on completion', () => {
    const maxProgress = themeEngine.getMaxProgress('monster-lab');
    rewardTracker.setProgress('p1', 'monster-lab', maxProgress - 1);

    const correctEvent: AppEvent = {
      type: 'word:attempted',
      payload: { wordId: 'w1', correct: true, technique: 'flashcard', responseTimeMs: 2000, struggled: false },
    };

    const reward = rewardTracker.processEvent('p1', 'monster-lab', correctEvent);
    expect(reward.creatureCompleted).toBe(true);

    // Progress should be reset to 0 for the next creature
    expect(rewardTracker.getProgress('p1', 'monster-lab')).toBe(0);

    // Creature should be in the collection
    expect(monsterCollection.getCollectionCount('p1')).toBe(1);
    const creatures = monsterCollection.getCollection('p1');
    expect(creatures[0].themeId).toBe('monster-lab');
    expect(creatures[0].totalBlocksUsed).toBe(maxProgress);
  });

  it('allows building a new creature after completion', () => {
    const maxProgress = themeEngine.getMaxProgress('monster-lab');
    rewardTracker.setProgress('p1', 'monster-lab', maxProgress - 1);

    const correctEvent: AppEvent = {
      type: 'word:attempted',
      payload: { wordId: 'w1', correct: true, technique: 'flashcard', responseTimeMs: 2000, struggled: false },
    };

    // Complete first creature
    rewardTracker.processEvent('p1', 'monster-lab', correctEvent);
    expect(rewardTracker.getProgress('p1', 'monster-lab')).toBe(0);

    // Start building next creature
    const reward2 = rewardTracker.processEvent('p1', 'monster-lab', correctEvent);
    expect(reward2.totalProgress).toBe(1);
    expect(reward2.creatureCompleted).toBe(false);
    expect(rewardTracker.getProgress('p1', 'monster-lab')).toBe(1);

    // First creature still in collection
    expect(monsterCollection.getCollectionCount('p1')).toBe(1);
  });

  it('milestone resets to Blueprint after creature completion', () => {
    const maxProgress = themeEngine.getMaxProgress('monster-lab');
    rewardTracker.setProgress('p1', 'monster-lab', maxProgress - 1);

    const correctEvent: AppEvent = {
      type: 'word:attempted',
      payload: { wordId: 'w1', correct: true, technique: 'flashcard', responseTimeMs: 2000, struggled: false },
    };

    rewardTracker.processEvent('p1', 'monster-lab', correctEvent);

    const status = rewardTracker.getMilestoneStatus('p1', 'monster-lab');
    expect(status.current).toBe('Blueprint');
    expect(status.next).toBe('Base');
    expect(status.progressToNext).toBe(UNITS);
  });
});

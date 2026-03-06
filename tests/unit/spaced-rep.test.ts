import { describe, it, expect } from 'vitest';
import { updateWordStats, calculateNextReview, transitionBucket } from '../../src/core/spaced-rep';
import { selectSessionWords } from '../../src/core/word-selection';
import type { WordStats, TechniqueResult, Word } from '../../src/contracts/types';
import { sampleWords, createWordStats, week12List } from '../fixtures/word-lists';
import { sampleTechniqueResults } from '../fixtures/session-histories';

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

function makeWord(id: string, listId: string): Word {
  return {
    id,
    listId,
    profileId: 'profile-paul',
    text: id,
    phonemes: [],
    syllables: [id],
    patterns: [],
    imageUrl: null,
    imageCached: false,
    audioCustom: null,
    createdAt: new Date('2026-03-01'),
  };
}

/** Apply N consecutive correct results on different days starting from a base stats object. */
function applyCorrectResults(stats: WordStats, count: number, startDay: number = 1): WordStats {
  let current = stats;
  for (let i = 0; i < count; i++) {
    const day = startDay + i;
    const result = makeResult({
      timestamp: new Date(`2026-03-${String(day).padStart(2, '0')}T15:00:00`),
      correct: true,
    });
    current = updateWordStats(current, result);
  }
  return current;
}

// ─── Bucket Transitions ──────────────────────────────────────

describe('Bucket Transitions', () => {
  it('should start in "new" bucket when never attempted', () => {
    const stats = createWordStats('word-knight', 'profile-paul');
    expect(stats.currentBucket).toBe('new');
    expect(transitionBucket(stats)).toBe('new');
  });

  it('should transition from new to learning after first correct answer', () => {
    const stats = createWordStats('word-knight', 'profile-paul');
    const updated = updateWordStats(stats, makeResult({ correct: true }));
    expect(updated.currentBucket).toBe('learning');
  });

  it('should transition from new to learning after first wrong answer', () => {
    const stats = createWordStats('word-knight', 'profile-paul');
    const updated = updateWordStats(stats, makeResult({ correct: false }));
    expect(updated.currentBucket).toBe('learning');
  });

  it('should stay in learning with 1-2 consecutive correct', () => {
    let stats = createWordStats('word-knight', 'profile-paul');
    stats = updateWordStats(stats, makeResult({ correct: true }));
    expect(stats.currentBucket).toBe('learning');
    expect(stats.consecutiveCorrect).toBe(1);

    stats = updateWordStats(stats, makeResult({ correct: true }));
    expect(stats.currentBucket).toBe('learning');
    expect(stats.consecutiveCorrect).toBe(2);
  });

  it('should transition to familiar at 3 consecutive correct', () => {
    let stats = createWordStats('word-knight', 'profile-paul');
    stats = applyCorrectResults(stats, 3);
    expect(stats.consecutiveCorrect).toBe(3);
    expect(stats.currentBucket).toBe('familiar');
  });

  it('should stay in familiar at 4 consecutive correct', () => {
    let stats = createWordStats('word-knight', 'profile-paul');
    stats = applyCorrectResults(stats, 4);
    expect(stats.consecutiveCorrect).toBe(4);
    expect(stats.currentBucket).toBe('familiar');
  });

  it('should transition to mastered at 5+ consecutive correct across 3+ days', () => {
    let stats = createWordStats('word-knight', 'profile-paul');
    // 5 correct on 5 different days (days 1-5)
    stats = applyCorrectResults(stats, 5, 1);
    expect(stats.consecutiveCorrect).toBe(5);
    expect(stats.currentBucket).toBe('mastered');
  });

  it('should stay familiar at 5+ consecutive correct with fewer than 3 distinct days', () => {
    let stats = createWordStats('word-knight', 'profile-paul');
    // 5 correct answers, all on the same day
    for (let i = 0; i < 5; i++) {
      stats = updateWordStats(stats, makeResult({
        timestamp: new Date('2026-03-05T15:00:00'),
        correct: true,
      }));
    }
    expect(stats.consecutiveCorrect).toBe(5);
    // Only 1 distinct day
    expect(stats.currentBucket).toBe('familiar');
  });

  it('should drop mastered word to learning on incorrect answer', () => {
    let stats = createWordStats('word-knight', 'profile-paul');
    stats = applyCorrectResults(stats, 5, 1);
    expect(stats.currentBucket).toBe('mastered');

    // Miss one
    stats = updateWordStats(stats, makeResult({ correct: false }));
    expect(stats.consecutiveCorrect).toBe(0);
    expect(stats.currentBucket).toBe('learning');
  });

  it('should drop familiar word to learning on incorrect answer', () => {
    let stats = createWordStats('word-knight', 'profile-paul');
    stats = applyCorrectResults(stats, 3);
    expect(stats.currentBucket).toBe('familiar');

    stats = updateWordStats(stats, makeResult({ correct: false }));
    expect(stats.consecutiveCorrect).toBe(0);
    expect(stats.currentBucket).toBe('learning');
  });

  it('should transition from mastered to review after extended correct performance', () => {
    let stats = createWordStats('word-knight', 'profile-paul');
    // 5 correct across 5 days to get mastered
    stats = applyCorrectResults(stats, 5, 1);
    expect(stats.currentBucket).toBe('mastered');

    // Additional correct on more days (days 6-7) to get correctDays > MASTERED_MIN_DAYS (3)
    stats = applyCorrectResults(stats, 2, 6);
    // Now correctDays=7 which is > 3, and bucket was 'mastered', so transitions to 'review'
    expect(stats.currentBucket).toBe('review');
  });

  it('should stay in review when continuing to get correct', () => {
    let stats = createWordStats('word-knight', 'profile-paul');
    stats = applyCorrectResults(stats, 5, 1);
    expect(stats.currentBucket).toBe('mastered');

    stats = applyCorrectResults(stats, 2, 6);
    expect(stats.currentBucket).toBe('review');

    // One more correct should stay in review
    stats = updateWordStats(stats, makeResult({
      timestamp: new Date('2026-03-10T15:00:00'),
      correct: true,
    }));
    expect(stats.currentBucket).toBe('review');
  });

  it('should drop review word to learning on incorrect answer', () => {
    let stats = createWordStats('word-knight', 'profile-paul');
    stats = applyCorrectResults(stats, 7, 1);
    expect(stats.currentBucket).toBe('review');

    stats = updateWordStats(stats, makeResult({ correct: false }));
    expect(stats.consecutiveCorrect).toBe(0);
    expect(stats.currentBucket).toBe('learning');
  });
});

// ─── Consecutive Correct Counting ────────────────────────────

describe('Consecutive Correct Counting', () => {
  it('should increment consecutive correct on correct answer', () => {
    let stats = createWordStats('word-knight', 'profile-paul');
    stats = updateWordStats(stats, makeResult({ correct: true }));
    expect(stats.consecutiveCorrect).toBe(1);
    stats = updateWordStats(stats, makeResult({ correct: true }));
    expect(stats.consecutiveCorrect).toBe(2);
  });

  it('should reset consecutive correct on wrong answer', () => {
    let stats = createWordStats('word-knight', 'profile-paul');
    stats = updateWordStats(stats, makeResult({ correct: true }));
    stats = updateWordStats(stats, makeResult({ correct: true }));
    expect(stats.consecutiveCorrect).toBe(2);

    stats = updateWordStats(stats, makeResult({ correct: false }));
    expect(stats.consecutiveCorrect).toBe(0);
  });

  it('should restart counting from zero after a reset', () => {
    let stats = createWordStats('word-knight', 'profile-paul');
    stats = applyCorrectResults(stats, 3);
    expect(stats.consecutiveCorrect).toBe(3);

    stats = updateWordStats(stats, makeResult({ correct: false }));
    expect(stats.consecutiveCorrect).toBe(0);

    stats = updateWordStats(stats, makeResult({ correct: true }));
    expect(stats.consecutiveCorrect).toBe(1);
  });
});

// ─── Review Interval Expansion ───────────────────────────────

describe('Review Interval Expansion', () => {
  it('should return immediate review for new words', () => {
    const stats = createWordStats('word-knight', 'profile-paul');
    const next = calculateNextReview(stats);
    // New words reviewed immediately
    expect(next.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('should return same-day review for learning bucket', () => {
    const stats = createWordStats('word-knight', 'profile-paul', {
      currentBucket: 'learning',
      consecutiveCorrect: 1,
      timesAsked: 1,
      lastAsked: new Date('2026-03-05'),
    });
    const next = calculateNextReview(stats);
    // learning interval is [0] days
    expect(next.toISOString().slice(0, 10)).toBe('2026-03-05');
  });

  it('should expand intervals for mastered bucket (7 → 14 → 30 → 60)', () => {
    const baseDate = new Date('2026-03-05');

    // consecutiveCorrect 0 → 7 days
    const stats0 = createWordStats('word-knight', 'profile-paul', {
      currentBucket: 'mastered',
      consecutiveCorrect: 0,
      timesAsked: 5,
      lastAsked: baseDate,
    });
    const next0 = calculateNextReview(stats0);
    expect(daysDiff(baseDate, next0)).toBe(7);

    // consecutiveCorrect 1 → 14 days
    const stats1 = createWordStats('word-knight', 'profile-paul', {
      currentBucket: 'mastered',
      consecutiveCorrect: 1,
      timesAsked: 6,
      lastAsked: baseDate,
    });
    const next1 = calculateNextReview(stats1);
    expect(daysDiff(baseDate, next1)).toBe(14);

    // consecutiveCorrect 2 → 30 days
    const stats2 = createWordStats('word-knight', 'profile-paul', {
      currentBucket: 'mastered',
      consecutiveCorrect: 2,
      timesAsked: 7,
      lastAsked: baseDate,
    });
    const next2 = calculateNextReview(stats2);
    expect(daysDiff(baseDate, next2)).toBe(30);

    // consecutiveCorrect 3 → 60 days
    const stats3 = createWordStats('word-knight', 'profile-paul', {
      currentBucket: 'mastered',
      consecutiveCorrect: 3,
      timesAsked: 8,
      lastAsked: baseDate,
    });
    const next3 = calculateNextReview(stats3);
    expect(daysDiff(baseDate, next3)).toBe(60);
  });

  it('should cap at max interval for mastered bucket', () => {
    const baseDate = new Date('2026-03-05');
    const stats = createWordStats('word-knight', 'profile-paul', {
      currentBucket: 'mastered',
      consecutiveCorrect: 100,
      timesAsked: 100,
      lastAsked: baseDate,
    });
    const next = calculateNextReview(stats);
    expect(daysDiff(baseDate, next)).toBe(60); // max in mastered array
  });

  it('should expand intervals for review bucket (60 → 90 → 120 → 180)', () => {
    const baseDate = new Date('2026-03-05');

    const intervals = [60, 90, 120, 180];
    for (let i = 0; i < intervals.length; i++) {
      const stats = createWordStats('word-knight', 'profile-paul', {
        currentBucket: 'review',
        consecutiveCorrect: i,
        timesAsked: 10 + i,
        lastAsked: baseDate,
      });
      const next = calculateNextReview(stats);
      expect(daysDiff(baseDate, next)).toBe(intervals[i]);
    }
  });
});

function daysDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── updateWordStats Integration ─────────────────────────────

describe('updateWordStats', () => {
  it('should update all counters on correct non-struggled answer', () => {
    const stats = createWordStats('word-knight', 'profile-paul');
    const result = makeResult({ correct: true, struggled: false });
    const updated = updateWordStats(stats, result);

    expect(updated.timesAsked).toBe(1);
    expect(updated.timesWrong).toBe(0);
    expect(updated.timesEasyRight).toBe(1);
    expect(updated.timesStruggledRight).toBe(0);
    expect(updated.consecutiveCorrect).toBe(1);
    expect(updated.lastAsked).toEqual(result.timestamp);
    expect(updated.techniqueHistory).toHaveLength(1);
  });

  it('should update all counters on correct struggled answer', () => {
    const stats = createWordStats('word-knight', 'profile-paul');
    const result = makeResult({ correct: true, struggled: true });
    const updated = updateWordStats(stats, result);

    expect(updated.timesAsked).toBe(1);
    expect(updated.timesStruggledRight).toBe(1);
    expect(updated.timesEasyRight).toBe(0);
  });

  it('should update all counters on wrong answer', () => {
    const stats = createWordStats('word-knight', 'profile-paul');
    const result = makeResult({ correct: false });
    const updated = updateWordStats(stats, result);

    expect(updated.timesAsked).toBe(1);
    expect(updated.timesWrong).toBe(1);
    expect(updated.timesEasyRight).toBe(0);
    expect(updated.timesStruggledRight).toBe(0);
    expect(updated.consecutiveCorrect).toBe(0);
  });

  it('should recalculate difficulty and next review date', () => {
    const stats = createWordStats('word-knight', 'profile-paul');
    const result = makeResult({ correct: false, responseTimeMs: 25000, scaffoldingUsed: true });
    const updated = updateWordStats(stats, result);

    // Difficulty should be higher than default 0.5 after a wrong, slow, scaffolded answer
    expect(updated.difficultyScore).toBeGreaterThan(0.5);
    expect(updated.nextReviewDate).toBeInstanceOf(Date);
  });

  it('should accumulate technique history', () => {
    let stats = createWordStats('word-knight', 'profile-paul');
    stats = updateWordStats(stats, makeResult({ correct: true }));
    stats = updateWordStats(stats, makeResult({ correct: false }));
    stats = updateWordStats(stats, makeResult({ correct: true }));

    expect(stats.techniqueHistory).toHaveLength(3);
    expect(stats.techniqueHistory[0].correct).toBe(true);
    expect(stats.techniqueHistory[1].correct).toBe(false);
    expect(stats.techniqueHistory[2].correct).toBe(true);
  });

  it('should work with fixture technique results', () => {
    let stats = createWordStats('word-knight', 'profile-paul');
    for (const result of sampleTechniqueResults) {
      stats = updateWordStats(stats, result);
    }

    expect(stats.timesAsked).toBe(3);
    expect(stats.timesWrong).toBe(1);
    expect(stats.techniqueHistory).toHaveLength(3);
  });
});

// ─── Word Selection ──────────────────────────────────────────

describe('selectSessionWords', () => {
  it('should return empty selection for sessionSize <= 0', () => {
    const selection = selectSessionWords(week12List, sampleWords, [], 0, null);
    expect(selection.currentListWords).toHaveLength(0);
    expect(selection.reviewWords).toHaveLength(0);
    expect(selection.maintenanceWords).toHaveLength(0);
  });

  it('should return empty selection for empty word pool', () => {
    const selection = selectSessionWords(week12List, [], [], 10, null);
    expect(selection.currentListWords).toHaveLength(0);
    expect(selection.reviewWords).toHaveLength(0);
    expect(selection.maintenanceWords).toHaveLength(0);
  });

  it('should produce approximately 60/30/10 ratio with no test proximity', () => {
    // Create enough words to see ratio distribution
    const currentWords = Array.from({ length: 20 }, (_, i) => makeWord(`cw-${i}`, 'list-week12'));
    const pastWords = Array.from({ length: 20 }, (_, i) => makeWord(`pw-${i}`, 'list-week11'));
    const allWords = [...currentWords, ...pastWords];

    // Create stats: past words split between learning and mastered
    const allStats = [
      ...currentWords.map(w => createWordStats(w.id, 'profile-paul', {
        currentBucket: 'learning',
        timesAsked: 2,
        consecutiveCorrect: 1,
      })),
      ...pastWords.slice(0, 10).map(w => createWordStats(w.id, 'profile-paul', {
        currentBucket: 'learning',
        timesAsked: 3,
        consecutiveCorrect: 2,
      })),
      ...pastWords.slice(10).map(w => createWordStats(w.id, 'profile-paul', {
        currentBucket: 'mastered',
        timesAsked: 10,
        consecutiveCorrect: 7,
      })),
    ];

    const selection = selectSessionWords(week12List, allWords, allStats, 20, null);

    // ~60% current = ~12, ~30% review = ~6, ~10% maintenance = ~2
    const total = selection.currentListWords.length + selection.reviewWords.length + selection.maintenanceWords.length;
    expect(total).toBeLessThanOrEqual(20);

    // Current should be the majority
    expect(selection.currentListWords.length).toBeGreaterThanOrEqual(10);
    expect(selection.currentListWords.length).toBeLessThanOrEqual(14);

    // Review should be present
    expect(selection.reviewWords.length).toBeGreaterThanOrEqual(3);

    // Maintenance should be present
    expect(selection.maintenanceWords.length).toBeGreaterThanOrEqual(1);
  });

  it('should boost current list when test is tomorrow (daysUntilTest=1)', () => {
    const currentWords = Array.from({ length: 10 }, (_, i) => makeWord(`cw-${i}`, 'list-week12'));
    const pastWords = Array.from({ length: 10 }, (_, i) => makeWord(`pw-${i}`, 'list-week11'));
    const allWords = [...currentWords, ...pastWords];

    const allStats = [
      ...currentWords.map(w => createWordStats(w.id, 'profile-paul', {
        currentBucket: 'learning',
        timesAsked: 2,
      })),
      ...pastWords.map(w => createWordStats(w.id, 'profile-paul', {
        currentBucket: 'learning',
        timesAsked: 3,
      })),
    ];

    const selection = selectSessionWords(week12List, allWords, allStats, 10, 1);

    // Day before test: ~90% current list
    expect(selection.currentListWords.length).toBeGreaterThanOrEqual(8);
    expect(selection.maintenanceWords.length).toBe(0);
  });

  it('should boost current list when test is in 2-3 days', () => {
    const currentWords = Array.from({ length: 10 }, (_, i) => makeWord(`cw-${i}`, 'list-week12'));
    const pastWords = Array.from({ length: 10 }, (_, i) => makeWord(`pw-${i}`, 'list-week11'));
    const allWords = [...currentWords, ...pastWords];

    const allStats = allWords.map(w => createWordStats(w.id, 'profile-paul', {
      currentBucket: 'learning',
      timesAsked: 2,
    }));

    const selection = selectSessionWords(week12List, allWords, allStats, 10, 3);

    // 2-3 days: ~80% current
    expect(selection.currentListWords.length).toBeGreaterThanOrEqual(7);
  });

  it('should use 100% review/maintenance when no active list', () => {
    const pastWords = Array.from({ length: 10 }, (_, i) => makeWord(`pw-${i}`, 'list-week11'));

    const allStats = pastWords.map(w => createWordStats(w.id, 'profile-paul', {
      currentBucket: 'learning',
      timesAsked: 3,
    }));

    const selection = selectSessionWords(null, pastWords, allStats, 10, null);

    expect(selection.currentListWords).toHaveLength(0);
    expect(selection.reviewWords.length + selection.maintenanceWords.length).toBeGreaterThan(0);
  });

  it('should always include trouble words (difficultyScore > 0.7)', () => {
    const currentWords = Array.from({ length: 5 }, (_, i) => makeWord(`cw-${i}`, 'list-week12'));
    const troubleWord = makeWord('trouble-1', 'list-week11');
    const allWords = [...currentWords, troubleWord];

    const allStats = [
      ...currentWords.map(w => createWordStats(w.id, 'profile-paul', {
        currentBucket: 'learning',
        timesAsked: 2,
        difficultyScore: 0.3,
      })),
      createWordStats('trouble-1', 'profile-paul', {
        currentBucket: 'learning',
        timesAsked: 10,
        timesWrong: 8,
        difficultyScore: 0.85,
      }),
    ];

    const selection = selectSessionWords(week12List, allWords, allStats, 5, null);

    const allSelected = [
      ...selection.currentListWords,
      ...selection.reviewWords,
      ...selection.maintenanceWords,
    ];
    const troubleIncluded = allSelected.some(w => w.id === 'trouble-1');
    expect(troubleIncluded).toBe(true);
  });

  it('should handle single word in pool', () => {
    const word = makeWord('single', 'list-week12');
    const stats = createWordStats('single', 'profile-paul', {
      currentBucket: 'new',
      timesAsked: 0,
    });

    const selection = selectSessionWords(week12List, [word], [stats], 10, null);

    const total = selection.currentListWords.length + selection.reviewWords.length + selection.maintenanceWords.length;
    expect(total).toBe(1);
    expect(selection.currentListWords).toHaveLength(1);
  });

  it('should handle all words being mastered', () => {
    const words = Array.from({ length: 5 }, (_, i) => makeWord(`w-${i}`, 'list-week12'));
    const stats = words.map(w => createWordStats(w.id, 'profile-paul', {
      currentBucket: 'mastered',
      timesAsked: 10,
      consecutiveCorrect: 7,
      difficultyScore: 0.1,
    }));

    const selection = selectSessionWords(week12List, words, stats, 5, null);

    const total = selection.currentListWords.length + selection.reviewWords.length + selection.maintenanceWords.length;
    expect(total).toBeGreaterThan(0);
  });

  it('should use fixture data correctly', () => {
    const stats = sampleWords.map(w => createWordStats(w.id, 'profile-paul'));
    const selection = selectSessionWords(week12List, sampleWords, stats, 5, 9);

    expect(selection.totalTarget).toBe(5);
    const total = selection.currentListWords.length + selection.reviewWords.length + selection.maintenanceWords.length;
    expect(total).toBeLessThanOrEqual(5);
    expect(total).toBeGreaterThan(0);
  });

  it('should set totalTarget correctly', () => {
    const selection = selectSessionWords(week12List, sampleWords, [], 15, null);
    expect(selection.totalTarget).toBe(15);
  });
});

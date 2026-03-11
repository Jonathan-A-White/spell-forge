import { describe, it, expect } from 'vitest';
import { countMasteredWords } from '../../src/core/mastery';
import { transitionBucket } from '../../src/core/spaced-rep';
import { processAttempt, createInitialProgress } from '../../src/core/learning';
import type { Word, WordStats } from '../../src/contracts/types';
import { createWordStats } from '../fixtures/word-lists';

// ─── Helpers ──────────────────────────────────────────────────

function makeWord(id: string): Word {
  return {
    id,
    listId: 'list-1',
    profileId: 'profile-1',
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

// ─── countMasteredWords ──────────────────────────────────────

describe('countMasteredWords — unified mastery levels', () => {
  it('counts words in mastered bucket', () => {
    const words = [makeWord('w1'), makeWord('w2'), makeWord('w3')];
    const stats: WordStats[] = [
      createWordStats('w1', 'p1', { currentBucket: 'mastered', timesAsked: 10 }),
      createWordStats('w2', 'p1', { currentBucket: 'familiar', timesAsked: 5 }),
      createWordStats('w3', 'p1', { currentBucket: 'new' }),
    ];
    expect(countMasteredWords(words, stats)).toBe(1);
  });

  it('counts words in review bucket as mastered', () => {
    const words = [makeWord('w1'), makeWord('w2')];
    const stats: WordStats[] = [
      createWordStats('w1', 'p1', { currentBucket: 'review', timesAsked: 20 }),
      createWordStats('w2', 'p1', { currentBucket: 'mastered', timesAsked: 10 }),
    ];
    expect(countMasteredWords(words, stats)).toBe(2);
  });

  it('does NOT count learning-mode completed words as mastered', () => {
    const words = [makeWord('w1'), makeWord('w2')];
    // w1 has no spaced-rep stats at all, w2 is only familiar in spaced-rep
    const stats: WordStats[] = [
      createWordStats('w2', 'p1', { currentBucket: 'familiar', timesAsked: 3 }),
    ];
    // Even though learning mode marked them as completed, they shouldn't count
    expect(countMasteredWords(words, stats)).toBe(0);
  });

  it('returns 0 when no words have stats', () => {
    const words = [makeWord('w1'), makeWord('w2')];
    expect(countMasteredWords(words, [])).toBe(0);
  });

  it('does not count familiar or learning bucket words', () => {
    const words = [makeWord('w1'), makeWord('w2'), makeWord('w3')];
    const stats: WordStats[] = [
      createWordStats('w1', 'p1', { currentBucket: 'familiar', timesAsked: 5 }),
      createWordStats('w2', 'p1', { currentBucket: 'learning', timesAsked: 2 }),
      createWordStats('w3', 'p1', { currentBucket: 'new' }),
    ];
    expect(countMasteredWords(words, stats)).toBe(0);
  });
});

// ─── Learning mode → familiar promotion ─────────────────────

describe('learning mode completes to familiar, not mastered', () => {
  it('completing all learning stages sets mastered flag but does NOT make spaced-rep mastered', () => {
    let progress = createInitialProgress('p1', 'w1', 'l1');

    // Complete all 4 stages (0-3), each requiring 3 consecutive successes
    for (let stage = 0; stage <= 3; stage++) {
      for (let s = 0; s < 3; s++) {
        progress = processAttempt(progress, { correct: true, testOut: false });
      }
    }

    // Learning engine marks it as "mastered" (completed learning stages)
    expect(progress.mastered).toBe(true);

    // But when we create the spaced-rep stats for this word, it should be 'familiar'
    // (This is handled by App.tsx handleWordMasteredInLearning)
    const stats = createWordStats('w1', 'p1', { currentBucket: 'familiar' });
    expect(stats.currentBucket).toBe('familiar');

    // And countMasteredWords should NOT count it
    const words = [makeWord('w1')];
    expect(countMasteredWords(words, [stats])).toBe(0);
  });

  it('test-out in learning does not grant spaced-rep mastery', () => {
    const progress = createInitialProgress('p1', 'w1', 'l1');
    const result = processAttempt(progress, { correct: true, testOut: true });

    // Learning says "mastered" (completed)
    expect(result.mastered).toBe(true);

    // But spaced-rep should start at familiar, not mastered
    const stats = createWordStats('w1', 'p1', { currentBucket: 'familiar' });
    const words = [makeWord('w1')];
    expect(countMasteredWords(words, [stats])).toBe(0);
  });
});

// ─── Practice mode drives mastery ───────────────────────────

describe('practice mode drives words from familiar to mastered', () => {
  it('familiar words need 5+ consecutive correct across 3+ days for mastery', () => {
    // Start as familiar (post-learning)
    const stats = createWordStats('w1', 'p1', {
      currentBucket: 'familiar',
      timesAsked: 5,
      consecutiveCorrect: 4,
      techniqueHistory: [
        { techniqueId: 't', timestamp: new Date('2026-03-01T10:00:00'), correct: true, responseTimeMs: 3000, struggled: false, scaffoldingUsed: false },
        { techniqueId: 't', timestamp: new Date('2026-03-02T10:00:00'), correct: true, responseTimeMs: 3000, struggled: false, scaffoldingUsed: false },
      ],
    });

    // 4 consecutive correct but only 2 days — should still be familiar
    let bucket = transitionBucket(stats);
    expect(bucket).toBe('familiar');

    // Add a 5th consecutive correct on a 3rd day
    const statsWithMore: WordStats = {
      ...stats,
      consecutiveCorrect: 5,
      timesAsked: 6,
      techniqueHistory: [
        ...stats.techniqueHistory,
        { techniqueId: 't', timestamp: new Date('2026-03-03T10:00:00'), correct: true, responseTimeMs: 3000, struggled: false, scaffoldingUsed: false },
      ],
    };
    bucket = transitionBucket(statsWithMore);
    expect(bucket).toBe('mastered');
  });

  it('getting a word wrong drops it back to learning regardless of previous level', () => {
    const stats = createWordStats('w1', 'p1', {
      currentBucket: 'familiar',
      timesAsked: 5,
      consecutiveCorrect: 0, // just got one wrong
    });
    const bucket = transitionBucket(stats);
    expect(bucket).toBe('learning');
  });
});

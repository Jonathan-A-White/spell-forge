import { describe, it, expect } from 'vitest';
import {
  processAttempt,
  getInputMode,
  getHiddenCount,
  generateWordDisplay,
  createInitialProgress,
  sortWordsForLearning,
  findNextWord,
  calculateListCompletion,
  MAX_STAGE,
  SUCCESSES_TO_ADVANCE,
  FAILURES_TO_REGRESS,
} from '../../src/core/learning';
import type { WordLearningProgress } from '../../src/contracts/types';

// ─── Helpers ──────────────────────────────────────────────────

function makeProgress(overrides?: Partial<WordLearningProgress>): WordLearningProgress {
  return {
    id: 'profile-1:word-1',
    profileId: 'profile-1',
    wordId: 'word-1',
    wordListId: 'list-1',
    stage: 0,
    consecutiveSuccesses: 0,
    consecutiveFailures: 0,
    mastered: false,
    totalAttempts: 0,
    totalErrors: 0,
    lastAttemptAt: null,
    createdAt: new Date('2026-03-01'),
    ...overrides,
  };
}

function makeWord(id: string, text: string) {
  return { id, text };
}

// ─── Constants ────────────────────────────────────────────────

describe('Learning Engine Constants', () => {
  it('has correct stage and threshold values', () => {
    expect(MAX_STAGE).toBe(3);
    expect(SUCCESSES_TO_ADVANCE).toBe(3);
    expect(FAILURES_TO_REGRESS).toBe(2);
  });
});

// ─── Input Mode ───────────────────────────────────────────────

describe('getInputMode', () => {
  it('returns scrambled for stages 0-2 with 0 successes', () => {
    expect(getInputMode(0, 0)).toBe('scrambled');
    expect(getInputMode(1, 0)).toBe('scrambled');
    expect(getInputMode(2, 0)).toBe('scrambled');
  });

  it('returns scrambled for stages 0-2 with 1 success', () => {
    expect(getInputMode(0, 1)).toBe('scrambled');
    expect(getInputMode(1, 1)).toBe('scrambled');
    expect(getInputMode(2, 1)).toBe('scrambled');
  });

  it('returns keyboard (boss level) for stages 0-2 with 2 successes', () => {
    expect(getInputMode(0, 2)).toBe('keyboard');
    expect(getInputMode(1, 2)).toBe('keyboard');
    expect(getInputMode(2, 2)).toBe('keyboard');
  });

  it('returns keyboard for stage 3 regardless of success count', () => {
    expect(getInputMode(3, 0)).toBe('keyboard');
    expect(getInputMode(3, 1)).toBe('keyboard');
    expect(getInputMode(3, 2)).toBe('keyboard');
  });
});

// ─── Hidden Count ─────────────────────────────────────────────

describe('getHiddenCount', () => {
  it('hides 0 letters at stage 0', () => {
    expect(getHiddenCount(0, 5)).toBe(0);
  });

  it('hides 1 letter at stage 1', () => {
    expect(getHiddenCount(1, 5)).toBe(1);
  });

  it('hides 2 letters at stage 2', () => {
    expect(getHiddenCount(2, 5)).toBe(2);
  });

  it('hides all letters at stage 3', () => {
    expect(getHiddenCount(3, 5)).toBe(5);
    expect(getHiddenCount(3, 9)).toBe(9);
  });
});

// ─── Word Display Generation ──────────────────────────────────

describe('generateWordDisplay', () => {
  it('shows full word when hiddenCount is 0', () => {
    const result = generateWordDisplay('cat', 0);
    expect(result.display).toBe('cat');
    expect(result.hiddenIndices).toEqual([]);
  });

  it('hides exactly 1 letter when hiddenCount is 1', () => {
    const result = generateWordDisplay('cat', 1);
    expect(result.hiddenIndices).toHaveLength(1);
    expect(result.display).toHaveLength(3);
    const underscoreCount = result.display.split('').filter((c) => c === '_').length;
    expect(underscoreCount).toBe(1);
  });

  it('hides exactly 2 letters when hiddenCount is 2', () => {
    const result = generateWordDisplay('beautiful', 2);
    expect(result.hiddenIndices).toHaveLength(2);
    const underscoreCount = result.display.split('').filter((c) => c === '_').length;
    expect(underscoreCount).toBe(2);
  });

  it('hides all letters when hiddenCount >= word length', () => {
    const result = generateWordDisplay('cat', 3);
    expect(result.display).toBe('___');
    expect(result.hiddenIndices).toEqual([0, 1, 2]);
  });

  it('hides all letters when hiddenCount exceeds word length', () => {
    const result = generateWordDisplay('hi', 5);
    expect(result.display).toBe('__');
    expect(result.hiddenIndices).toEqual([0, 1]);
  });

  it('preserves non-hidden letters in their correct positions', () => {
    const result = generateWordDisplay('cat', 1);
    for (let i = 0; i < 3; i++) {
      if (!result.hiddenIndices.includes(i)) {
        expect(result.display[i]).toBe('cat'[i]);
      } else {
        expect(result.display[i]).toBe('_');
      }
    }
  });

  it('returns sorted hidden indices', () => {
    for (let trial = 0; trial < 20; trial++) {
      const result = generateWordDisplay('beautiful', 3);
      for (let i = 1; i < result.hiddenIndices.length; i++) {
        expect(result.hiddenIndices[i]).toBeGreaterThan(result.hiddenIndices[i - 1]);
      }
    }
  });
});

// ─── Process Attempt — Correct Answers ────────────────────────

describe('processAttempt — correct answers', () => {
  it('increments consecutiveSuccesses on correct', () => {
    const progress = makeProgress();
    const result = processAttempt(progress, { correct: true, testOut: false });
    expect(result.consecutiveSuccesses).toBe(1);
    expect(result.consecutiveFailures).toBe(0);
    expect(result.totalAttempts).toBe(1);
    expect(result.stage).toBe(0);
  });

  it('resets consecutiveFailures on correct', () => {
    const progress = makeProgress({ consecutiveFailures: 1 });
    const result = processAttempt(progress, { correct: true, testOut: false });
    expect(result.consecutiveFailures).toBe(0);
  });

  it('advances stage after 3 consecutive successes', () => {
    const progress = makeProgress({ consecutiveSuccesses: 2 });
    const result = processAttempt(progress, { correct: true, testOut: false });
    expect(result.stage).toBe(1);
    expect(result.consecutiveSuccesses).toBe(0);
    expect(result.consecutiveFailures).toBe(0);
  });

  it('advances through all stages correctly', () => {
    let progress = makeProgress();

    for (let stage = 0; stage <= 3; stage++) {
      expect(progress.stage).toBe(stage);
      for (let s = 0; s < SUCCESSES_TO_ADVANCE; s++) {
        progress = processAttempt(progress, { correct: true, testOut: false });
      }
    }

    expect(progress.mastered).toBe(true);
    expect(progress.totalAttempts).toBe(12); // 4 stages x 3 successes
  });

  it('marks mastered when advancing past MAX_STAGE', () => {
    const progress = makeProgress({ stage: 3, consecutiveSuccesses: 2 });
    const result = processAttempt(progress, { correct: true, testOut: false });
    expect(result.mastered).toBe(true);
  });

  it('updates lastAttemptAt on correct', () => {
    const progress = makeProgress();
    const result = processAttempt(progress, { correct: true, testOut: false });
    expect(result.lastAttemptAt).toBeInstanceOf(Date);
  });
});

// ─── Process Attempt — Wrong Answers ──────────────────────────

describe('processAttempt — wrong answers', () => {
  it('resets consecutiveSuccesses on wrong', () => {
    const progress = makeProgress({ consecutiveSuccesses: 2 });
    const result = processAttempt(progress, { correct: false, testOut: false });
    expect(result.consecutiveSuccesses).toBe(0);
  });

  it('increments consecutiveFailures on wrong', () => {
    const progress = makeProgress();
    const result = processAttempt(progress, { correct: false, testOut: false });
    expect(result.consecutiveFailures).toBe(1);
    expect(result.totalErrors).toBe(1);
  });

  it('regresses stage after 2 consecutive failures', () => {
    const progress = makeProgress({ stage: 2, consecutiveFailures: 1 });
    const result = processAttempt(progress, { correct: false, testOut: false });
    expect(result.stage).toBe(1);
    expect(result.consecutiveFailures).toBe(0);
    expect(result.consecutiveSuccesses).toBe(0);
  });

  it('does not regress below stage 0', () => {
    const progress = makeProgress({ stage: 0, consecutiveFailures: 1 });
    const result = processAttempt(progress, { correct: false, testOut: false });
    expect(result.stage).toBe(0);
    expect(result.consecutiveFailures).toBe(0);
  });

  it('resets both counters on regression', () => {
    const progress = makeProgress({ stage: 3, consecutiveFailures: 1, consecutiveSuccesses: 1 });
    const result = processAttempt(progress, { correct: false, testOut: false });
    expect(result.stage).toBe(2);
    expect(result.consecutiveSuccesses).toBe(0);
    expect(result.consecutiveFailures).toBe(0);
  });

  it('correct after failure resets failure count', () => {
    let progress = makeProgress();
    progress = processAttempt(progress, { correct: false, testOut: false });
    expect(progress.consecutiveFailures).toBe(1);
    progress = processAttempt(progress, { correct: true, testOut: false });
    expect(progress.consecutiveFailures).toBe(0);
    expect(progress.consecutiveSuccesses).toBe(1);
  });
});

// ─── Process Attempt — Test Out ───────────────────────────────

describe('processAttempt — test out', () => {
  it('masters word immediately on correct test out', () => {
    const progress = makeProgress();
    const result = processAttempt(progress, { correct: true, testOut: true });
    expect(result.mastered).toBe(true);
    expect(result.totalAttempts).toBe(1);
  });

  it('masters from any stage on correct test out', () => {
    const progress = makeProgress({ stage: 1, consecutiveSuccesses: 1 });
    const result = processAttempt(progress, { correct: true, testOut: true });
    expect(result.mastered).toBe(true);
  });

  it('no penalty on failed test out', () => {
    const progress = makeProgress({ stage: 2, consecutiveSuccesses: 2, consecutiveFailures: 0 });
    const result = processAttempt(progress, { correct: false, testOut: true });
    expect(result.mastered).toBe(false);
    expect(result.stage).toBe(2);
    expect(result.consecutiveSuccesses).toBe(2);
    expect(result.consecutiveFailures).toBe(0);
    expect(result.totalErrors).toBe(1);
    expect(result.totalAttempts).toBe(1);
  });

  it('can retry test out after failure', () => {
    let progress = makeProgress({ stage: 1 });
    progress = processAttempt(progress, { correct: false, testOut: true });
    expect(progress.mastered).toBe(false);
    progress = processAttempt(progress, { correct: true, testOut: true });
    expect(progress.mastered).toBe(true);
  });
});

// ─── Mixed Sequences ─────────────────────────────────────────

describe('processAttempt — mixed sequences', () => {
  it('handles correct-wrong-correct-correct-correct advancement', () => {
    let p = makeProgress();
    p = processAttempt(p, { correct: true, testOut: false });  // success=1
    p = processAttempt(p, { correct: false, testOut: false }); // success=0, fail=1
    p = processAttempt(p, { correct: true, testOut: false });  // success=1, fail=0
    p = processAttempt(p, { correct: true, testOut: false });  // success=2
    p = processAttempt(p, { correct: true, testOut: false });  // success=3 → advance
    expect(p.stage).toBe(1);
    expect(p.totalAttempts).toBe(5);
    expect(p.totalErrors).toBe(1);
  });

  it('handles double failure regression then recovery', () => {
    let p = makeProgress({ stage: 2 });
    // Two failures → regress to stage 1
    p = processAttempt(p, { correct: false, testOut: false });
    p = processAttempt(p, { correct: false, testOut: false });
    expect(p.stage).toBe(1);
    // Three successes → back to stage 2
    p = processAttempt(p, { correct: true, testOut: false });
    p = processAttempt(p, { correct: true, testOut: false });
    p = processAttempt(p, { correct: true, testOut: false });
    expect(p.stage).toBe(2);
  });

  it('regression from stage 1 to 0 then back', () => {
    let p = makeProgress({ stage: 1 });
    p = processAttempt(p, { correct: false, testOut: false });
    p = processAttempt(p, { correct: false, testOut: false });
    expect(p.stage).toBe(0);

    // 3 successes to get back to stage 1
    for (let i = 0; i < 3; i++) {
      p = processAttempt(p, { correct: true, testOut: false });
    }
    expect(p.stage).toBe(1);
  });

  it('tracks total attempts and errors across full journey', () => {
    let p = makeProgress();
    // Stage 0: 3 correct
    for (let i = 0; i < 3; i++) {
      p = processAttempt(p, { correct: true, testOut: false });
    }
    // Stage 1: 1 wrong, then 3 correct
    p = processAttempt(p, { correct: false, testOut: false });
    for (let i = 0; i < 3; i++) {
      p = processAttempt(p, { correct: true, testOut: false });
    }
    expect(p.stage).toBe(2);
    expect(p.totalAttempts).toBe(7);
    expect(p.totalErrors).toBe(1);
  });
});

// ─── Initial Progress ────────────────────────────────────────

describe('createInitialProgress', () => {
  it('creates progress at stage 0 with all zeroed counters', () => {
    const p = createInitialProgress('prof-1', 'word-1', 'list-1');
    expect(p.id).toBe('prof-1:word-1');
    expect(p.profileId).toBe('prof-1');
    expect(p.wordId).toBe('word-1');
    expect(p.wordListId).toBe('list-1');
    expect(p.stage).toBe(0);
    expect(p.consecutiveSuccesses).toBe(0);
    expect(p.consecutiveFailures).toBe(0);
    expect(p.mastered).toBe(false);
    expect(p.totalAttempts).toBe(0);
    expect(p.totalErrors).toBe(0);
    expect(p.lastAttemptAt).toBeNull();
    expect(p.createdAt).toBeInstanceOf(Date);
  });
});

// ─── Word Sorting ─────────────────────────────────────────────

describe('sortWordsForLearning', () => {
  it('sorts words shortest to longest', () => {
    const words = [
      makeWord('1', 'beautiful'),
      makeWord('2', 'cat'),
      makeWord('3', 'the'),
      makeWord('4', 'go'),
    ];
    const sorted = sortWordsForLearning(words);
    expect(sorted.map((w) => w.text)).toEqual(['go', 'cat', 'the', 'beautiful']);
  });

  it('preserves original order for equal-length words', () => {
    const words = [
      makeWord('1', 'bat'),
      makeWord('2', 'cat'),
      makeWord('3', 'ant'),
    ];
    const sorted = sortWordsForLearning(words);
    expect(sorted.map((w) => w.text)).toEqual(['bat', 'cat', 'ant']);
  });

  it('does not mutate original array', () => {
    const words = [makeWord('1', 'dog'), makeWord('2', 'a')];
    const original = [...words];
    sortWordsForLearning(words);
    expect(words).toEqual(original);
  });
});

// ─── Find Next Word ───────────────────────────────────────────

describe('findNextWord', () => {
  const words = [
    makeWord('w1', 'beautiful'),
    makeWord('w2', 'cat'),
    makeWord('w3', 'go'),
  ];

  it('returns shortest non-mastered word', () => {
    const progressMap = new Map<string, WordLearningProgress>();
    const next = findNextWord(words, progressMap);
    expect(next?.id).toBe('w3'); // "go" is shortest
  });

  it('skips mastered words', () => {
    const progressMap = new Map<string, WordLearningProgress>();
    progressMap.set('w3', makeProgress({ wordId: 'w3', mastered: true }));
    const next = findNextWord(words, progressMap);
    expect(next?.id).toBe('w2'); // "cat" is next shortest
  });

  it('returns null when all words mastered', () => {
    const progressMap = new Map<string, WordLearningProgress>();
    progressMap.set('w1', makeProgress({ wordId: 'w1', mastered: true }));
    progressMap.set('w2', makeProgress({ wordId: 'w2', mastered: true }));
    progressMap.set('w3', makeProgress({ wordId: 'w3', mastered: true }));
    const next = findNextWord(words, progressMap);
    expect(next).toBeNull();
  });

  it('returns in-progress word (not yet mastered) over unstarted longer word', () => {
    const progressMap = new Map<string, WordLearningProgress>();
    progressMap.set('w3', makeProgress({ wordId: 'w3', stage: 2, mastered: false }));
    const next = findNextWord(words, progressMap);
    expect(next?.id).toBe('w3'); // still "go" — it's not mastered yet
  });
});

// ─── List Completion ──────────────────────────────────────────

describe('calculateListCompletion', () => {
  it('returns 100 for empty list', () => {
    expect(calculateListCompletion(0, [])).toBe(100);
  });

  it('returns 0 when no words mastered', () => {
    expect(calculateListCompletion(5, [])).toBe(0);
  });

  it('returns correct percentage', () => {
    const progress = [
      makeProgress({ mastered: true }),
      makeProgress({ mastered: true }),
      makeProgress({ mastered: false }),
    ];
    expect(calculateListCompletion(4, progress)).toBe(50);
  });

  it('returns 100 when all mastered', () => {
    const progress = [
      makeProgress({ mastered: true }),
      makeProgress({ mastered: true }),
    ];
    expect(calculateListCompletion(2, progress)).toBe(100);
  });
});

// ─── Edge Cases ───────────────────────────────────────────────

describe('edge cases', () => {
  it('generateWordDisplay handles single-character word', () => {
    const result = generateWordDisplay('a', 1);
    expect(result.display).toBe('_');
    expect(result.hiddenIndices).toEqual([0]);
  });

  it('generateWordDisplay handles empty word', () => {
    const result = generateWordDisplay('', 0);
    expect(result.display).toBe('');
    expect(result.hiddenIndices).toEqual([]);
  });

  it('stage 3 boss level is still keyboard', () => {
    // Stage 3 with 2 successes — should still be keyboard (always keyboard at stage 3)
    expect(getInputMode(3, 2)).toBe('keyboard');
  });

  it('processAttempt never produces invalid stage', () => {
    // Regress from 0 stays at 0
    const p0 = makeProgress({ stage: 0, consecutiveFailures: 1 });
    const result = processAttempt(p0, { correct: false, testOut: false });
    expect(result.stage).toBeGreaterThanOrEqual(0);
    expect(result.stage).toBeLessThanOrEqual(MAX_STAGE);
  });

  it('can master a word through test out on first ever attempt', () => {
    const p = createInitialProgress('p1', 'w1', 'l1');
    const result = processAttempt(p, { correct: true, testOut: true });
    expect(result.mastered).toBe(true);
    expect(result.totalAttempts).toBe(1);
  });
});

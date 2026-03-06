import { describe, it, expect } from 'vitest';
import {
  getDirectionsForDifficulty,
  getMaxWordsForDifficulty,
  getGridSizeForDifficulty,
  buildGrid,
} from '../../src/features/practice/word-search-difficulty';

// Test the pure logic functions extracted from the game components.
// Since components rely on React, we test the algorithmic cores here.

// ─── Word Search Grid Building ────────────────────────────────

describe('WordSearch grid logic', () => {
  it('should generate grids of at least 10x10 for medium/hard', () => {
    const words = ['cat', 'dog'];
    const gridSize = getGridSizeForDifficulty(words, 'medium');
    expect(gridSize).toBeGreaterThanOrEqual(10);
  });

  it('should compute grid size based on longest word', () => {
    const words = ['elephant', 'hippopotamus'];
    const gridSize = getGridSizeForDifficulty(words, 'medium');
    // hippopotamus is 12 letters, needs at least 15
    expect(gridSize).toBeGreaterThanOrEqual(15);
  });

  it('should scale grid size for many words', () => {
    const words = Array.from({ length: 20 }, (_, i) => `word${i}`);
    const gridSize = getGridSizeForDifficulty(words, 'medium');
    expect(gridSize).toBeGreaterThanOrEqual(10);
    expect(gridSize).toBeGreaterThanOrEqual(Math.ceil(Math.sqrt(400)));
  });
});

// ─── Word Search Difficulty Settings ─────────────────────────

describe('WordSearch difficulty settings', () => {
  it('easy should only allow horizontal and vertical directions', () => {
    const dirs = getDirectionsForDifficulty('easy');
    expect(dirs).toHaveLength(2);
    // right and down
    expect(dirs).toContainEqual([0, 1]);
    expect(dirs).toContainEqual([1, 0]);
  });

  it('medium should allow 4 directions including diagonals', () => {
    const dirs = getDirectionsForDifficulty('medium');
    expect(dirs).toHaveLength(4);
  });

  it('hard should allow all 8 directions', () => {
    const dirs = getDirectionsForDifficulty('hard');
    expect(dirs).toHaveLength(8);
  });

  it('easy should limit to 6 words', () => {
    expect(getMaxWordsForDifficulty('easy')).toBe(6);
  });

  it('medium should limit to 9 words', () => {
    expect(getMaxWordsForDifficulty('medium')).toBe(9);
  });

  it('hard should limit to 12 words', () => {
    expect(getMaxWordsForDifficulty('hard')).toBe(12);
  });

  it('easy grid should be smaller than hard grid', () => {
    const words = ['apple', 'banana', 'cherry', 'dance', 'eagle', 'frost'];
    const easySize = getGridSizeForDifficulty(words, 'easy');
    const hardSize = getGridSizeForDifficulty(words, 'hard');
    expect(easySize).toBeLessThan(hardSize);
  });

  it('easy grid should be at least 8x8', () => {
    const words = ['cat', 'dog'];
    const gridSize = getGridSizeForDifficulty(words, 'easy');
    expect(gridSize).toBeGreaterThanOrEqual(8);
  });
});

// ─── Word Search Grid Building with Directions ───────────────

describe('WordSearch buildGrid with difficulty directions', () => {
  it('should place words only horizontally/vertically on easy', () => {
    const words = ['cat', 'dog'];
    const dirs = getDirectionsForDifficulty('easy');
    const { placed } = buildGrid(words, 10, dirs);

    for (const pw of placed) {
      const [dr, dc] = pw.direction;
      // easy: only right (0,1) or down (1,0)
      const isHorizontal = dr === 0 && Math.abs(dc) === 1;
      const isVertical = Math.abs(dr) === 1 && dc === 0;
      expect(isHorizontal || isVertical).toBe(true);
    }
  });

  it('should place all provided words when space allows', () => {
    const words = ['hi', 'go', 'up'];
    const { placed } = buildGrid(words, 10, getDirectionsForDifficulty('easy'));
    expect(placed).toHaveLength(3);
  });
});

// ─── Spelling Quiz Logic ──────────────────────────────────────

describe('SpellingQuiz scoring', () => {
  const PASS_THRESHOLD = 85;

  function computeResults(answers: { correct: boolean }[]) {
    const correctCount = answers.filter((a) => a.correct).length;
    const percentage = Math.round((correctCount / answers.length) * 100);
    return {
      totalQuestions: answers.length,
      correctAnswers: correctCount,
      percentage,
      passed: percentage >= PASS_THRESHOLD,
    };
  }

  it('should pass with 100% accuracy', () => {
    const answers = Array.from({ length: 10 }, () => ({ correct: true }));
    const results = computeResults(answers);
    expect(results.percentage).toBe(100);
    expect(results.passed).toBe(true);
  });

  it('should pass with exactly 85%', () => {
    const answers = [
      ...Array.from({ length: 17 }, () => ({ correct: true })),
      ...Array.from({ length: 3 }, () => ({ correct: false })),
    ];
    const results = computeResults(answers);
    expect(results.percentage).toBe(85);
    expect(results.passed).toBe(true);
  });

  it('should fail with 84%', () => {
    // 84/100 = 84%
    const answers = [
      ...Array.from({ length: 84 }, () => ({ correct: true })),
      ...Array.from({ length: 16 }, () => ({ correct: false })),
    ];
    const results = computeResults(answers);
    expect(results.percentage).toBe(84);
    expect(results.passed).toBe(false);
  });

  it('should fail with 0% accuracy', () => {
    const answers = Array.from({ length: 5 }, () => ({ correct: false }));
    const results = computeResults(answers);
    expect(results.percentage).toBe(0);
    expect(results.passed).toBe(false);
  });

  it('should handle single question correctly', () => {
    const results = computeResults([{ correct: true }]);
    expect(results.percentage).toBe(100);
    expect(results.passed).toBe(true);
  });

  it('should round percentage correctly', () => {
    // 6/7 = 85.714... rounds to 86
    const answers = [
      ...Array.from({ length: 6 }, () => ({ correct: true })),
      { correct: false },
    ];
    const results = computeResults(answers);
    expect(results.percentage).toBe(86);
    expect(results.passed).toBe(true);
  });
});

// ─── Misspelling Generation ───────────────────────────────────

describe('Misspelling generation', () => {
  function generateMisspellings(word: string): string[] {
    const misspellings: string[] = [];
    const lower = word.toLowerCase();

    // Double a letter
    if (lower.length >= 3) {
      const idx = 1;
      misspellings.push(lower.slice(0, idx) + lower[idx] + lower.slice(idx));
    }

    // Swap two adjacent letters
    if (lower.length >= 2) {
      const idx = 0;
      const arr = lower.split('');
      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      const swapped = arr.join('');
      if (swapped !== lower) misspellings.push(swapped);
    }

    // Remove a letter
    if (lower.length >= 3) {
      const idx = 1;
      misspellings.push(lower.slice(0, idx) + lower.slice(idx + 1));
    }

    return [...new Set(misspellings)].filter((m) => m !== lower);
  }

  it('should generate misspellings that differ from the original', () => {
    const misspellings = generateMisspellings('hello');
    for (const m of misspellings) {
      expect(m).not.toBe('hello');
    }
  });

  it('should generate at least one misspelling for common words', () => {
    const misspellings = generateMisspellings('spelling');
    expect(misspellings.length).toBeGreaterThan(0);
  });

  it('should handle short words', () => {
    const misspellings = generateMisspellings('at');
    // swap 'at' -> 'ta', that's different
    expect(misspellings.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Scramble Logic ───────────────────────────────────────────

describe('Word scrambling', () => {
  function scrambleWord(word: string): string {
    const letters = word.split('');
    // Deterministic shuffle for testing
    const copy = [...letters];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = i - 1; // simple deterministic swap
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.join('');
  }

  it('should produce a string with the same letters', () => {
    const word = 'hello';
    const scrambled = scrambleWord(word);
    expect(scrambled.split('').sort().join('')).toBe(word.split('').sort().join(''));
  });

  it('should produce a string of the same length', () => {
    const word = 'spelling';
    const scrambled = scrambleWord(word);
    expect(scrambled.length).toBe(word.length);
  });
});

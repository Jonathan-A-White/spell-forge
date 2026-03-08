import { describe, it, expect } from 'vitest';
import {
  generateDistractors,
  createLetterBatch,
  checkCatch,
  calcWordScore,
  calcDepthLevel,
  calcStartingLives,
  calcCatcherStars,
  calcMaxPossibleScore,
} from '../../src/features/practice/spell-catcher-logic';

// ─── generateDistractors ────────────────────────────────────

describe('generateDistractors', () => {
  it('should return the requested number of distractors', () => {
    const result = generateDistractors('cat', 6);
    expect(result).toHaveLength(6);
  });

  it('should return all lowercase letters', () => {
    const result = generateDistractors('DOG', 4);
    result.forEach((letter) => {
      expect(letter).toMatch(/^[a-z]$/);
    });
  });

  it('should include some letters from the word itself', () => {
    const result = generateDistractors('cat', 6);
    const wordLetters = new Set('cat'.split(''));
    const fromWord = result.filter((l) => wordLetters.has(l));
    expect(fromWord.length).toBeGreaterThan(0);
  });

  it('should return empty array when count is 0', () => {
    expect(generateDistractors('hello', 0)).toHaveLength(0);
  });

  it('should handle single-letter words', () => {
    const result = generateDistractors('a', 3);
    expect(result).toHaveLength(3);
  });
});

// ─── createLetterBatch ──────────────────────────────────────

describe('createLetterBatch', () => {
  it('should create a batch with one target letter', () => {
    const batch = createLetterBatch('cat', 0, 5, 0);
    const targets = batch.filter((l) => l.isTarget);
    expect(targets).toHaveLength(1);
    expect(targets[0].letter).toBe('c');
  });

  it('should fill columns with distractors', () => {
    const batch = createLetterBatch('cat', 0, 5, 0);
    expect(batch.length).toBeLessThanOrEqual(5);
    expect(batch.length).toBeGreaterThanOrEqual(2);
  });

  it('should return empty array if nextLetterIndex is beyond the word', () => {
    expect(createLetterBatch('cat', 5, 5, 0)).toEqual([]);
  });

  it('should set all letters to row 0', () => {
    const batch = createLetterBatch('hello', 2, 4, 1);
    batch.forEach((l) => {
      expect(l.row).toBe(0);
    });
  });

  it('should place target letter in correct column based on batchId', () => {
    const batch = createLetterBatch('cat', 0, 5, 3);
    const target = batch.find((l) => l.isTarget);
    expect(target?.column).toBe(3); // batchId % columns = 3 % 5 = 3
  });

  it('should assign unique ids to all letters', () => {
    const batch = createLetterBatch('cat', 0, 5, 0);
    const ids = batch.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should not place distractors in the target column', () => {
    const batch = createLetterBatch('cat', 1, 5, 2);
    const target = batch.find((l) => l.isTarget)!;
    const distractors = batch.filter((l) => !l.isTarget);
    distractors.forEach((d) => {
      expect(d.column).not.toBe(target.column);
    });
  });
});

// ─── checkCatch ─────────────────────────────────────────────

describe('checkCatch', () => {
  it('should return correct: true for the right letter', () => {
    const result = checkCatch('c', 'cat', 0);
    expect(result.caught).toBe(true);
    expect(result.correct).toBe(true);
    expect(result.letterIndex).toBe(0);
  });

  it('should return correct: false for the wrong letter', () => {
    const result = checkCatch('x', 'cat', 0);
    expect(result.caught).toBe(true);
    expect(result.correct).toBe(false);
  });

  it('should be case insensitive', () => {
    const result = checkCatch('C', 'cat', 0);
    expect(result.correct).toBe(true);
  });

  it('should check the correct index position', () => {
    const result = checkCatch('a', 'cat', 1);
    expect(result.correct).toBe(true);
  });

  it('should return the letterIndex that was checked', () => {
    const result = checkCatch('t', 'cat', 2);
    expect(result.letterIndex).toBe(2);
  });
});

// ─── calcWordScore ──────────────────────────────────────────

describe('calcWordScore', () => {
  it('should calculate base points as wordLength * 10', () => {
    // With 0 lives remaining, bonus is 0, so score = base
    expect(calcWordScore(0, 3, 3)).toBe(30);
  });

  it('should add life bonus for remaining lives', () => {
    // base = 3*10 = 30, lifeBonus = round((3/3) * 3 * 5) = 15
    expect(calcWordScore(3, 3, 3)).toBe(45);
  });

  it('should give partial bonus for partial lives', () => {
    // base = 4*10 = 40, lifeBonus = round((2/4) * 4 * 5) = 10
    expect(calcWordScore(2, 4, 4)).toBe(50);
  });

  it('should scale with word length', () => {
    const shortScore = calcWordScore(3, 3, 3);
    const longScore = calcWordScore(5, 5, 5);
    expect(longScore).toBeGreaterThan(shortScore);
  });
});

// ─── calcDepthLevel ─────────────────────────────────────────

describe('calcDepthLevel', () => {
  it('should return 0 at the start', () => {
    expect(calcDepthLevel(0, 10)).toBe(0);
  });

  it('should return 5 when all words are completed', () => {
    expect(calcDepthLevel(10, 10)).toBe(5);
  });

  it('should return 0 for zero total words', () => {
    expect(calcDepthLevel(0, 0)).toBe(0);
  });

  it('should cap at 5', () => {
    expect(calcDepthLevel(100, 10)).toBe(5);
  });

  it('should return correct level for midpoint', () => {
    // 5/10 = 0.5 * 5 = 2.5 -> floor = 2
    expect(calcDepthLevel(5, 10)).toBe(2);
  });
});

// ─── calcStartingLives ─────────────────────────────────────

describe('calcStartingLives', () => {
  it('should return 3 for short words (<=3)', () => {
    expect(calcStartingLives(2)).toBe(3);
    expect(calcStartingLives(3)).toBe(3);
  });

  it('should return 4 for medium words (4-5)', () => {
    expect(calcStartingLives(4)).toBe(4);
    expect(calcStartingLives(5)).toBe(4);
  });

  it('should return 5 for long words (6+)', () => {
    expect(calcStartingLives(6)).toBe(5);
    expect(calcStartingLives(10)).toBe(5);
  });
});

// ─── calcCatcherStars ───────────────────────────────────────

describe('calcCatcherStars', () => {
  it('should return 3 stars for perfect completion with high score', () => {
    expect(calcCatcherStars(10, 10, 90, 100)).toBe(3);
  });

  it('should return 2 stars for 70%+ completion', () => {
    expect(calcCatcherStars(7, 10, 50, 100)).toBe(2);
  });

  it('should return 1 star for 40%+ completion', () => {
    expect(calcCatcherStars(4, 10, 20, 100)).toBe(1);
  });

  it('should return 0 stars for below 40% completion', () => {
    expect(calcCatcherStars(3, 10, 10, 100)).toBe(0);
  });

  it('should return 0 for zero total words', () => {
    expect(calcCatcherStars(0, 0, 0, 0)).toBe(0);
  });

  it('should require both full completion AND 80% score for 3 stars', () => {
    // Full completion but low score -> 2 stars
    expect(calcCatcherStars(10, 10, 70, 100)).toBe(2);
  });
});

// ─── calcMaxPossibleScore ───────────────────────────────────

describe('calcMaxPossibleScore', () => {
  it('should sum perfect scores for all words', () => {
    const words = ['cat', 'dog'];
    const score = calcMaxPossibleScore(words);
    // cat: length 3, lives 3, score = 3*10 + round((3/3)*3*5) = 30+15 = 45
    // dog: length 3, lives 3, score = 45
    expect(score).toBe(90);
  });

  it('should return 0 for empty word list', () => {
    expect(calcMaxPossibleScore([])).toBe(0);
  });

  it('should use provided maxLives when given', () => {
    const words = ['cat'];
    const withDefault = calcMaxPossibleScore(words);
    const withCustom = calcMaxPossibleScore(words, 5);
    // With 5 lives: base=30, bonus=round((5/5)*3*5)=15 -> 45
    // With default 3 lives: same for 3-letter word -> 45
    expect(withDefault).toBe(45);
    expect(withCustom).toBe(45);
  });

  it('should handle words of different lengths', () => {
    const words = ['hi', 'hello'];
    const score = calcMaxPossibleScore(words);
    expect(score).toBeGreaterThan(0);
    // hi: length 2, lives 3, score = 2*10 + round((3/3)*2*5) = 20+10 = 30
    // hello: length 5, lives 4, score = 5*10 + round((4/4)*5*5) = 50+25 = 75
    expect(score).toBe(105);
  });
});

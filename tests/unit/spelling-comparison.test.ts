import { describe, it, expect } from 'vitest';
import { computeLetterDiff } from '../../src/features/practice/letter-diff';

describe('computeLetterDiff', () => {
  it('should mark all letters as correct when attempt matches', () => {
    const { attemptDiff, correctDiff } = computeLetterDiff('cat', 'cat');

    expect(attemptDiff).toEqual([
      { letter: 'c', status: 'correct' },
      { letter: 'a', status: 'correct' },
      { letter: 't', status: 'correct' },
    ]);
    expect(correctDiff).toEqual([
      { letter: 'c', status: 'correct' },
      { letter: 'a', status: 'correct' },
      { letter: 't', status: 'correct' },
    ]);
  });

  it('should be case insensitive', () => {
    const { attemptDiff } = computeLetterDiff('Cat', 'cat');
    expect(attemptDiff.every((d) => d.status === 'correct')).toBe(true);
  });

  it('should detect extra letters in the attempt', () => {
    const { attemptDiff, correctDiff } = computeLetterDiff('caat', 'cat');

    // Attempt: c-correct, a-correct, a-extra, t-correct
    expect(attemptDiff.filter((d) => d.status === 'extra')).toHaveLength(1);
    expect(attemptDiff.filter((d) => d.status === 'correct')).toHaveLength(3);

    // Correct: all letters should be marked correct
    expect(correctDiff.every((d) => d.status === 'correct')).toBe(true);
  });

  it('should detect missing letters in the attempt', () => {
    const { attemptDiff, correctDiff } = computeLetterDiff('ct', 'cat');

    // Attempt: c-correct, t-correct (both present in correct word)
    expect(attemptDiff).toEqual([
      { letter: 'c', status: 'correct' },
      { letter: 't', status: 'correct' },
    ]);

    // Correct: c-correct, a-missing, t-correct
    expect(correctDiff).toEqual([
      { letter: 'c', status: 'correct' },
      { letter: 'a', status: 'missing' },
      { letter: 't', status: 'correct' },
    ]);
  });

  it('should handle completely wrong attempt', () => {
    const { attemptDiff, correctDiff } = computeLetterDiff('xyz', 'cat');

    // All attempt letters are extra
    expect(attemptDiff.every((d) => d.status === 'extra')).toBe(true);
    // All correct letters are missing
    expect(correctDiff.every((d) => d.status === 'missing')).toBe(true);
  });

  it('should handle empty attempt', () => {
    const { attemptDiff, correctDiff } = computeLetterDiff('', 'cat');

    expect(attemptDiff).toEqual([]);
    expect(correctDiff).toEqual([
      { letter: 'c', status: 'missing' },
      { letter: 'a', status: 'missing' },
      { letter: 't', status: 'missing' },
    ]);
  });

  it('should handle substitution in the middle', () => {
    // "bat" vs "cat" — b is extra, c is missing
    const { attemptDiff, correctDiff } = computeLetterDiff('bat', 'cat');

    // b is extra, a and t are correct
    expect(attemptDiff).toEqual([
      { letter: 'b', status: 'extra' },
      { letter: 'a', status: 'correct' },
      { letter: 't', status: 'correct' },
    ]);

    // c is missing, a and t are correct
    expect(correctDiff).toEqual([
      { letter: 'c', status: 'missing' },
      { letter: 'a', status: 'correct' },
      { letter: 't', status: 'correct' },
    ]);
  });

  it('should handle transposed letters', () => {
    // "freind" vs "friend" — e and i are swapped
    const { attemptDiff, correctDiff } = computeLetterDiff('freind', 'friend');

    // The LCS approach should identify f, r, i, n, d as common
    // attempt: f-correct, r-correct, e-extra, i-correct, n-correct, d-correct
    const attemptCorrect = attemptDiff.filter((d) => d.status === 'correct');
    const attemptExtra = attemptDiff.filter((d) => d.status === 'extra');
    expect(attemptCorrect.length).toBeGreaterThanOrEqual(4);
    expect(attemptExtra.length).toBeGreaterThanOrEqual(1);

    // correct: f-correct, r-correct, e-missing, i-correct ... etc
    const correctMissing = correctDiff.filter((d) => d.status === 'missing');
    expect(correctMissing.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle longer attempt than correct word', () => {
    const { attemptDiff } = computeLetterDiff('because', 'becuse');

    // "because" has an extra 'a' compared to "becuse"
    const extraLetters = attemptDiff.filter((d) => d.status === 'extra');
    expect(extraLetters.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle real-world misspelling: recieve vs receive', () => {
    const { attemptDiff, correctDiff } = computeLetterDiff('recieve', 'receive');

    // Should identify the e/i swap area
    const attemptExtra = attemptDiff.filter((d) => d.status === 'extra');
    const correctMissing = correctDiff.filter((d) => d.status === 'missing');

    // At least some letters should differ
    expect(attemptExtra.length).toBeGreaterThanOrEqual(1);
    expect(correctMissing.length).toBeGreaterThanOrEqual(1);
  });
});

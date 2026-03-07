import { describe, it, expect } from 'vitest';
import {
  calcRunnerPosition,
  formatTime,
  calcStumbleDelay,
  calcStarRating,
} from '../../src/features/practice/relay-race-logic';

// ─── Runner Position ─────────────────────────────────────────

describe('calcRunnerPosition', () => {
  it('should return 0 at the start', () => {
    expect(calcRunnerPosition(0, 10)).toBe(0);
  });

  it('should return 100 when all words are done', () => {
    expect(calcRunnerPosition(10, 10)).toBe(100);
  });

  it('should return 50 at the midpoint', () => {
    expect(calcRunnerPosition(5, 10)).toBe(50);
  });

  it('should return 0 for zero total words', () => {
    expect(calcRunnerPosition(0, 0)).toBe(0);
  });

  it('should round to nearest integer', () => {
    // 1/3 = 33.33...% -> 33
    expect(calcRunnerPosition(1, 3)).toBe(33);
  });
});

// ─── Time Formatting ─────────────────────────────────────────

describe('formatTime', () => {
  it('should format seconds with one decimal', () => {
    expect(formatTime(5000)).toBe('5.0s');
  });

  it('should format sub-second times', () => {
    expect(formatTime(500)).toBe('0.5s');
  });

  it('should format minutes and seconds', () => {
    expect(formatTime(90000)).toBe('1:30.0');
  });

  it('should format zero', () => {
    expect(formatTime(0)).toBe('0.0s');
  });

  it('should pad seconds in minute format', () => {
    // 61.5 seconds => "1:01.5"
    expect(formatTime(61500)).toBe('1:01.5');
  });

  it('should handle large times', () => {
    // 5 minutes exactly
    expect(formatTime(300000)).toBe('5:00.0');
  });
});

// ─── Stumble Delay ───────────────────────────────────────────

describe('calcStumbleDelay', () => {
  it('should return a base delay for short words', () => {
    const delay = calcStumbleDelay(3);
    expect(delay).toBeGreaterThanOrEqual(1000);
  });

  it('should increase delay for longer words', () => {
    const shortDelay = calcStumbleDelay(3);
    const longDelay = calcStumbleDelay(10);
    expect(longDelay).toBeGreaterThan(shortDelay);
  });

  it('should cap at 2000ms', () => {
    const delay = calcStumbleDelay(100);
    expect(delay).toBe(2000);
  });

  it('should be at least 1000ms for single letter', () => {
    expect(calcStumbleDelay(1)).toBeGreaterThanOrEqual(1000);
  });
});

// ─── Star Rating ─────────────────────────────────────────────

describe('calcStarRating', () => {
  it('should give 3 stars for perfect accuracy and new best', () => {
    expect(calcStarRating(10, 10, true)).toBe(3);
  });

  it('should give 2 stars for perfect accuracy without new best', () => {
    expect(calcStarRating(10, 10, false)).toBe(2);
  });

  it('should give 2 stars for 80% accuracy', () => {
    expect(calcStarRating(8, 10, false)).toBe(2);
  });

  it('should give 1 star for 50% accuracy', () => {
    expect(calcStarRating(5, 10, false)).toBe(1);
  });

  it('should give 0 stars for less than 50% accuracy', () => {
    expect(calcStarRating(4, 10, false)).toBe(0);
  });

  it('should give 0 stars for zero correct', () => {
    expect(calcStarRating(0, 10, false)).toBe(0);
  });

  it('should handle zero total words', () => {
    expect(calcStarRating(0, 0, false)).toBe(0);
  });

  it('should give 2 stars for 80% even with new best', () => {
    // Not 100% accuracy, so can't get 3 stars
    expect(calcStarRating(8, 10, true)).toBe(2);
  });
});

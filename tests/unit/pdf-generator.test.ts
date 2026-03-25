// tests/unit/pdf-generator.test.ts — PDF generator tests

import { describe, it, expect } from 'vitest';
import { generateWordListPdf, _testing } from '../../src/features/word-lists/pdf-generator';
import type { PdfMode, PdfFontSize, PdfOptions } from '../../src/features/word-lists/pdf-generator';

const { FONT_SIZES, PAGE } = _testing;

function makeOptions(overrides: Partial<PdfOptions> = {}): PdfOptions {
  return {
    mode: 'full',
    fontSize: 'medium',
    listName: 'Week 10 Spelling',
    words: ['cat', 'dog', 'fish', 'bird', 'tree'],
    ...overrides,
  };
}

describe('pdf-generator', () => {
  describe('generateWordListPdf', () => {
    it('returns a blob URL string', () => {
      const url = generateWordListPdf(makeOptions());
      expect(typeof url).toBe('string');
      // jsPDF in Node/test env returns a data URI or blob URL
      expect(url.length).toBeGreaterThan(0);
    });

    it('works with all three modes', () => {
      const modes: PdfMode[] = ['full', 'trace-only', 'write-only'];
      for (const mode of modes) {
        const url = generateWordListPdf(makeOptions({ mode }));
        expect(url.length).toBeGreaterThan(0);
      }
    });

    it('works with all three font sizes', () => {
      const sizes: PdfFontSize[] = ['small', 'medium', 'large'];
      for (const fontSize of sizes) {
        const url = generateWordListPdf(makeOptions({ fontSize }));
        expect(url.length).toBeGreaterThan(0);
      }
    });

    it('handles a single word', () => {
      const url = generateWordListPdf(makeOptions({ words: ['apple'] }));
      expect(url.length).toBeGreaterThan(0);
    });

    it('handles many words (multi-page)', () => {
      const manyWords = Array.from({ length: 30 }, (_, i) => `word${i + 1}`);
      const url = generateWordListPdf(makeOptions({ words: manyWords }));
      expect(url.length).toBeGreaterThan(0);
    });

    it('handles long words without crashing', () => {
      const url = generateWordListPdf(makeOptions({ words: ['extraordinary', 'communication', 'responsibility'] }));
      expect(url.length).toBeGreaterThan(0);
    });

    it('handles special characters in list name', () => {
      const url = generateWordListPdf(makeOptions({ listName: "Sarah's List #3 — Week 10" }));
      expect(url.length).toBeGreaterThan(0);
    });
  });

  describe('layout constants', () => {
    it('defines three font sizes', () => {
      expect(FONT_SIZES.small).toBeLessThan(FONT_SIZES.medium);
      expect(FONT_SIZES.medium).toBeLessThan(FONT_SIZES.large);
    });

    it('uses US Letter page dimensions', () => {
      expect(PAGE.width).toBe(612);
      expect(PAGE.height).toBe(792);
    });

    it('has reasonable margins', () => {
      expect(PAGE.margin).toBeGreaterThanOrEqual(30);
      expect(PAGE.margin).toBeLessThanOrEqual(72); // max 1 inch
    });
  });
});

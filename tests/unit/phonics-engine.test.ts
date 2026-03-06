// tests/unit/phonics-engine.test.ts — Phonics engine test suite

import { describe, it, expect } from 'vitest';
import { analyzeWord, getPatternFamily, generateHint } from '../../src/core/phonics/index.ts';

describe('phonics engine', () => {
  // ─── "knight" → silent-k and igh ────────────────────────────
  describe('knight', () => {
    it('detects the silent-k pattern', () => {
      const result = analyzeWord('knight');
      const patternIds = result.patterns.map(p => p.id);
      const hassilentK = patternIds.some(
        id => id === 'sl-kn' || id === 'cd-kn',
      );
      expect(hassilentK).toBe(true);
    });

    it('detects the igh vowel-team pattern', () => {
      const result = analyzeWord('knight');
      const patternIds = result.patterns.map(p => p.id);
      const hasIgh = patternIds.some(
        id => id === 'vt-igh' || id === 'ir-ight',
      );
      expect(hasIgh).toBe(true);
    });
  });

  // ─── "bridge" → consonant blend ────────────────────────────
  describe('bridge', () => {
    it('detects a consonant blend', () => {
      const result = analyzeWord('bridge');
      const categories = result.patterns.map(p => p.category);
      expect(categories).toContain('consonant-blend');
    });

    it('detects the dge digraph', () => {
      const result = analyzeWord('bridge');
      const patternIds = result.patterns.map(p => p.id);
      expect(patternIds).toContain('cd-dge');
    });
  });

  // ─── "nation" → tion suffix ─────────────────────────────────
  describe('nation', () => {
    it('detects the -tion suffix', () => {
      const result = analyzeWord('nation');
      const patternIds = result.patterns.map(p => p.id);
      expect(patternIds).toContain('sx-tion');
    });

    it('has the correct hint for -tion', () => {
      const result = analyzeWord('nation');
      const tionPattern = result.patterns.find(p => p.id === 'sx-tion');
      expect(tionPattern).toBeDefined();
      expect(generateHint(tionPattern!)).toMatch(/shun/i);
    });
  });

  // ─── "cake" → silent-e ──────────────────────────────────────
  describe('cake', () => {
    it('detects the silent-e pattern', () => {
      const result = analyzeWord('cake');
      const categories = result.patterns.map(p => p.category);
      expect(categories).toContain('long-vowel-silent-e');
    });

    it('produces phoneme entries', () => {
      const result = analyzeWord('cake');
      expect(result.phonemes.length).toBeGreaterThan(0);
    });
  });

  // ─── Pattern family: light, night, right → igh ─────────────
  describe('pattern family: igh', () => {
    it('returns example words for the vt-igh pattern', () => {
      const family = getPatternFamily('vt-igh');
      expect(family).toContain('light');
      expect(family).toContain('night');
      expect(family).toContain('right');
    });

    it('light, night, and right all detect the same igh pattern', () => {
      for (const word of ['light', 'night', 'right']) {
        const result = analyzeWord(word);
        const patternIds = result.patterns.map(p => p.id);
        const hasIgh = patternIds.some(
          id => id === 'vt-igh' || id === 'ir-ight',
        );
        expect(hasIgh).toBe(true);
      }
    });
  });

  // ─── Multi-syllable words ───────────────────────────────────
  describe('multi-syllable words', () => {
    it('"because" splits into multiple syllables', () => {
      const result = analyzeWord('because');
      expect(result.syllables.length).toBeGreaterThanOrEqual(2);
    });

    it('"important" splits into multiple syllables', () => {
      const result = analyzeWord('important');
      expect(result.syllables.length).toBeGreaterThanOrEqual(2);
    });

    it('"important" detects the im- prefix', () => {
      const result = analyzeWord('important');
      const categories = result.patterns.map(p => p.category);
      expect(categories).toContain('prefix');
    });
  });

  // ─── Difficulty scoring ─────────────────────────────────────
  describe('difficulty scoring', () => {
    it('words with more patterns have higher difficulty', () => {
      const simpleDifficulty = analyzeWord('cat').difficultyScore;
      const complexDifficulty = analyzeWord('knight').difficultyScore;
      expect(complexDifficulty).toBeGreaterThan(simpleDifficulty);
    });

    it('difficulty is between 0 and 1', () => {
      for (const word of ['cat', 'knight', 'nation', 'bridge', 'important']) {
        const result = analyzeWord(word);
        expect(result.difficultyScore).toBeGreaterThanOrEqual(0);
        expect(result.difficultyScore).toBeLessThanOrEqual(1);
      }
    });
  });

  // ─── Basic structural checks ───────────────────────────────
  describe('result structure', () => {
    it('PhonicsResult has all required fields', () => {
      const result = analyzeWord('cake');
      expect(result).toHaveProperty('syllables');
      expect(result).toHaveProperty('phonemes');
      expect(result).toHaveProperty('patterns');
      expect(result).toHaveProperty('difficultyScore');
      expect(result).toHaveProperty('scaffoldingHints');
      expect(result).toHaveProperty('relatedWords');
      expect(Array.isArray(result.syllables)).toBe(true);
      expect(Array.isArray(result.phonemes)).toBe(true);
      expect(Array.isArray(result.patterns)).toBe(true);
    });
  });
});

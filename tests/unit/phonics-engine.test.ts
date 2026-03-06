// tests/unit/phonics-engine.test.ts — Comprehensive phonics engine test suite

import { describe, it, expect } from 'vitest';
import {
  analyzeWord,
  getPatternFamily,
  generateHint,
  patterns,
  splitSyllables,
} from '../../src/core/phonics/index.ts';
import type { DetectedPattern } from '../../src/contracts/types.ts';

// ─── Helper ─────────────────────────────────────────────────────
function patternIds(word: string): string[] {
  return analyzeWord(word).patterns.map(p => p.id);
}

function patternCategories(word: string): string[] {
  return analyzeWord(word).patterns.map(p => p.category);
}

// ─── "knight" → silent-k and igh ────────────────────────────────
describe('knight', () => {
  it('detects the silent-k pattern (kn digraph)', () => {
    const ids = patternIds('knight');
    const hasSilentK = ids.some(id => id === 'sl-kn' || id === 'cd-kn');
    expect(hasSilentK).toBe(true);
  });

  it('detects the igh vowel-team or ight irregular pattern', () => {
    const ids = patternIds('knight');
    const hasIgh = ids.some(id => id === 'vt-igh' || id === 'ir-ight');
    expect(hasIgh).toBe(true);
  });

  it('returns syllables for knight (single syllable)', () => {
    const result = analyzeWord('knight');
    expect(result.syllables).toEqual(['knight']);
  });

  it('produces scaffolding hints', () => {
    const result = analyzeWord('knight');
    expect(result.scaffoldingHints.length).toBeGreaterThan(0);
  });

  it('includes related words from the detected patterns', () => {
    const result = analyzeWord('knight');
    expect(result.relatedWords.length).toBeGreaterThan(0);
  });
});

// ─── "bridge" → consonant blend + short vowel ──────────────────
describe('bridge', () => {
  it('detects a consonant blend (br)', () => {
    const cats = patternCategories('bridge');
    expect(cats).toContain('consonant-blend');
  });

  it('detects the dge digraph', () => {
    const ids = patternIds('bridge');
    expect(ids).toContain('cd-dge');
  });

  it('detects the short-i vowel', () => {
    const cats = patternCategories('bridge');
    expect(cats).toContain('short-vowel');
  });
});

// ─── "nation" → tion suffix ─────────────────────────────────────
describe('nation', () => {
  it('detects the -tion suffix', () => {
    const ids = patternIds('nation');
    expect(ids).toContain('sx-tion');
  });

  it('has the correct hint for -tion', () => {
    const result = analyzeWord('nation');
    const tionPattern = result.patterns.find(p => p.id === 'sx-tion');
    expect(tionPattern).toBeDefined();
    expect(generateHint(tionPattern!)).toMatch(/shun/i);
  });

  it('splits into 2 syllables', () => {
    const result = analyzeWord('nation');
    expect(result.syllables.length).toBe(2);
  });
});

// ─── Pattern family: light, night, right → igh ─────────────────
describe('pattern family: igh', () => {
  it('returns example words for the vt-igh pattern', () => {
    const family = getPatternFamily('vt-igh');
    expect(family).toContain('light');
    expect(family).toContain('night');
    expect(family).toContain('right');
  });

  it('returns example words for the ir-ight pattern', () => {
    const family = getPatternFamily('ir-ight');
    expect(family).toContain('light');
    expect(family).toContain('night');
    expect(family).toContain('right');
  });

  it('light, night, and right all detect the same igh/ight pattern', () => {
    for (const word of ['light', 'night', 'right']) {
      const ids = patternIds(word);
      const hasIgh = ids.some(id => id === 'vt-igh' || id === 'ir-ight');
      expect(hasIgh).toBe(true);
    }
  });

  it('returns an empty array for a nonexistent pattern id', () => {
    expect(getPatternFamily('nonexistent-xyz')).toEqual([]);
  });
});

// ─── "cake" → silent-e long vowel ──────────────────────────────
describe('cake', () => {
  it('detects the silent-e pattern (long-vowel-silent-e)', () => {
    const cats = patternCategories('cake');
    expect(cats).toContain('long-vowel-silent-e');
  });

  it('produces phoneme entries', () => {
    const result = analyzeWord('cake');
    expect(result.phonemes.length).toBeGreaterThan(0);
  });

  it('phonemes cover the entire word length', () => {
    const result = analyzeWord('cake');
    const totalLength = result.phonemes.reduce((sum, p) => sum + p.length, 0);
    expect(totalLength).toBe('cake'.length);
  });

  it('detects only one silent-e pattern (the most specific)', () => {
    const cats = patternCategories('cake');
    const silentECount = cats.filter(c => c === 'long-vowel-silent-e').length;
    expect(silentECount).toBe(1);
  });
});

// ─── Multi-syllable words ───────────────────────────────────────
describe('multi-syllable words', () => {
  it('"because" splits into multiple syllables', () => {
    const result = analyzeWord('because');
    expect(result.syllables.length).toBeGreaterThanOrEqual(2);
  });

  it('"because" detects the au vowel team', () => {
    const cats = patternCategories('because');
    expect(cats).toContain('vowel-team');
  });

  it('"important" splits into multiple syllables', () => {
    const result = analyzeWord('important');
    expect(result.syllables.length).toBeGreaterThanOrEqual(2);
  });

  it('"important" detects the im- prefix', () => {
    const cats = patternCategories('important');
    expect(cats).toContain('prefix');
  });

  it('"important" detects an r-controlled vowel', () => {
    const cats = patternCategories('important');
    expect(cats).toContain('r-controlled');
  });

  it('"together" splits into at least 3 syllables', () => {
    const result = analyzeWord('together');
    expect(result.syllables.length).toBeGreaterThanOrEqual(3);
  });

  it('"together" detects the th consonant digraph', () => {
    const cats = patternCategories('together');
    expect(cats).toContain('consonant-digraph');
  });
});

// ─── Difficulty scoring ─────────────────────────────────────────
describe('difficulty scoring', () => {
  it('words with more patterns have higher difficulty', () => {
    const simpleDifficulty = analyzeWord('cat').difficultyScore;
    const complexDifficulty = analyzeWord('knight').difficultyScore;
    expect(complexDifficulty).toBeGreaterThan(simpleDifficulty);
  });

  it('difficulty is between 0 and 1', () => {
    for (const word of ['cat', 'knight', 'nation', 'bridge', 'important', 'together', 'because']) {
      const result = analyzeWord(word);
      expect(result.difficultyScore).toBeGreaterThanOrEqual(0);
      expect(result.difficultyScore).toBeLessThanOrEqual(1);
    }
  });

  it('short simple words have low difficulty', () => {
    const result = analyzeWord('cat');
    expect(result.difficultyScore).toBeLessThan(0.3);
  });

  it('multi-syllable words with hard patterns have higher difficulty', () => {
    const result = analyzeWord('important');
    expect(result.difficultyScore).toBeGreaterThan(0.3);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────
describe('edge cases', () => {
  it('single-letter word "a" returns a single syllable and no patterns', () => {
    const result = analyzeWord('a');
    expect(result.syllables).toEqual(['a']);
    expect(result.patterns.length).toBe(0);
  });

  it('single-letter word "I" returns a single syllable', () => {
    const result = analyzeWord('I');
    expect(result.syllables).toEqual(['i']);
  });

  it('two-letter word "go" returns a single syllable', () => {
    const result = analyzeWord('go');
    expect(result.syllables.length).toBe(1);
  });

  it('very short word "at" returns valid result', () => {
    const result = analyzeWord('at');
    expect(result.syllables).toEqual(['at']);
    expect(result.phonemes.length).toBeGreaterThan(0);
  });

  it('handles uppercase input by lowercasing', () => {
    const lower = analyzeWord('knight');
    const upper = analyzeWord('KNIGHT');
    expect(lower.patterns.map(p => p.id)).toEqual(upper.patterns.map(p => p.id));
  });

  it('handles input with whitespace by trimming', () => {
    const result = analyzeWord('  cake  ');
    const cats = result.patterns.map(p => p.category);
    expect(cats).toContain('long-vowel-silent-e');
  });
});

// ─── Scaffolding hints ──────────────────────────────────────────
describe('scaffolding hints', () => {
  it('produces hints for each detected pattern', () => {
    const result = analyzeWord('knight');
    expect(result.scaffoldingHints.length).toBe(result.patterns.length);
  });

  it('hints are non-empty strings', () => {
    const result = analyzeWord('bridge');
    for (const hint of result.scaffoldingHints) {
      expect(typeof hint).toBe('string');
      expect(hint.length).toBeGreaterThan(0);
    }
  });

  it('generateHint returns the pattern hint from the database', () => {
    const result = analyzeWord('nation');
    for (const p of result.patterns) {
      const hint = generateHint(p);
      expect(hint.length).toBeGreaterThan(0);
    }
  });

  it('generateHint falls back to pattern.hint for unknown ids', () => {
    const fakePattern: DetectedPattern = {
      id: 'fake-id',
      category: 'irregular',
      grapheme: 'xyz',
      hint: 'Fallback hint text',
    };
    expect(generateHint(fakePattern)).toBe('Fallback hint text');
  });
});

// ─── Related words ──────────────────────────────────────────────
describe('related words', () => {
  it('related words come from the detected patterns examples', () => {
    const result = analyzeWord('bridge');
    expect(result.relatedWords.length).toBeGreaterThan(0);
  });

  it('related words do not have excessive duplicates', () => {
    const result = analyzeWord('knight');
    const unique = new Set(result.relatedWords);
    expect(unique.size).toBe(result.relatedWords.length);
  });
});

// ─── Phoneme structure ──────────────────────────────────────────
describe('phoneme structure', () => {
  it('each phoneme has required fields', () => {
    const result = analyzeWord('cake');
    for (const phoneme of result.phonemes) {
      expect(phoneme).toHaveProperty('grapheme');
      expect(phoneme).toHaveProperty('phoneme');
      expect(phoneme).toHaveProperty('position');
      expect(phoneme).toHaveProperty('length');
      expect(typeof phoneme.grapheme).toBe('string');
      expect(typeof phoneme.phoneme).toBe('string');
      expect(typeof phoneme.position).toBe('number');
      expect(typeof phoneme.length).toBe('number');
    }
  });

  it('phonemes are sorted by position', () => {
    const result = analyzeWord('knight');
    for (let i = 1; i < result.phonemes.length; i++) {
      expect(result.phonemes[i].position).toBeGreaterThanOrEqual(result.phonemes[i - 1].position);
    }
  });
});

// ─── Result structure ───────────────────────────────────────────
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

  it('DetectedPattern has all required fields', () => {
    const result = analyzeWord('bridge');
    for (const p of result.patterns) {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('category');
      expect(p).toHaveProperty('grapheme');
      expect(p).toHaveProperty('hint');
    }
  });
});

// ─── Pattern database ───────────────────────────────────────────
describe('pattern database', () => {
  it('has approximately 200 patterns', () => {
    expect(patterns.length).toBeGreaterThanOrEqual(195);
    expect(patterns.length).toBeLessThanOrEqual(210);
  });

  it('covers all 11 pattern categories', () => {
    const categories = new Set(patterns.map(p => p.category));
    expect(categories.size).toBe(11);
    expect(categories.has('short-vowel')).toBe(true);
    expect(categories.has('long-vowel-silent-e')).toBe(true);
    expect(categories.has('vowel-team')).toBe(true);
    expect(categories.has('r-controlled')).toBe(true);
    expect(categories.has('consonant-digraph')).toBe(true);
    expect(categories.has('consonant-blend')).toBe(true);
    expect(categories.has('silent-letter')).toBe(true);
    expect(categories.has('double-consonant')).toBe(true);
    expect(categories.has('suffix')).toBe(true);
    expect(categories.has('prefix')).toBe(true);
    expect(categories.has('irregular')).toBe(true);
  });

  it('every pattern has a non-empty hint', () => {
    for (const p of patterns) {
      expect(p.hint.length).toBeGreaterThan(0);
    }
  });

  it('every pattern has at least one example word', () => {
    for (const p of patterns) {
      expect(p.examples.length).toBeGreaterThan(0);
    }
  });
});

// ─── Syllabifier ────────────────────────────────────────────────
describe('syllabifier', () => {
  it('single-syllable words remain unsplit', () => {
    expect(splitSyllables('cat')).toEqual(['cat']);
    expect(splitSyllables('dog')).toEqual(['dog']);
  });

  it('common multi-syllable words split correctly', () => {
    expect(splitSyllables('nation').length).toBe(2);
    expect(splitSyllables('important').length).toBeGreaterThanOrEqual(2);
    expect(splitSyllables('together').length).toBeGreaterThanOrEqual(3);
  });

  it('words with common prefixes are split at the prefix boundary', () => {
    const syl = splitSyllables('unhappy');
    expect(syl[0]).toBe('un');
  });
});

// ─── Additional word analyses ───────────────────────────────────
describe('additional word analyses', () => {
  it('"phone" detects the ph consonant digraph', () => {
    const cats = patternCategories('phone');
    expect(cats).toContain('consonant-digraph');
  });

  it('"write" detects the wr silent letter or digraph', () => {
    const ids = patternIds('write');
    const hasWr = ids.some(id => id === 'sl-wr' || id === 'cd-wr');
    expect(hasWr).toBe(true);
  });

  it('"running" detects the -ing suffix', () => {
    const ids = patternIds('running');
    expect(ids).toContain('sx-ing');
  });

  it('"running" detects a double consonant (nn)', () => {
    const cats = patternCategories('running');
    expect(cats).toContain('double-consonant');
  });

  it('"home" detects the silent-e long-o pattern', () => {
    const cats = patternCategories('home');
    expect(cats).toContain('long-vowel-silent-e');
  });

  it('"rain" detects the ai vowel team', () => {
    const cats = patternCategories('rain');
    expect(cats).toContain('vowel-team');
  });

  it('"car" detects the ar r-controlled vowel', () => {
    const cats = patternCategories('car');
    expect(cats).toContain('r-controlled');
  });
});

// tests/unit/spanish-phonics.test.ts — Tests for the Spanish phonics engine

import { describe, it, expect } from 'vitest';
import { analyzeSpanishWord } from '../../src/core/phonics/languages/spanish/engine';
import { splitSpanishSyllables } from '../../src/core/phonics/languages/spanish/syllabifier';
import { analyzeWordMultilingual, splitSyllablesMultilingual, hasPhonicsEngine } from '../../src/core/phonics/multilingual';

// ─── Spanish Syllabifier ───────────────────────────────────────

describe('splitSpanishSyllables', () => {
  it('splits simple CV.CV words', () => {
    expect(splitSpanishSyllables('casa')).toEqual(['ca', 'sa']);
    expect(splitSpanishSyllables('mesa')).toEqual(['me', 'sa']);
  });

  it('splits words with consonant clusters', () => {
    expect(splitSpanishSyllables('libro')).toEqual(['li', 'bro']);
    expect(splitSpanishSyllables('nombre')).toEqual(['nom', 'bre']);
  });

  it('keeps diphthongs together', () => {
    const result = splitSpanishSyllables('agua');
    // "a-gua" — the "ua" diphthong stays together
    expect(result.join('-')).toBe('a-gua');
  });

  it('handles accented vowels', () => {
    const result = splitSpanishSyllables('caf\u00e9');
    expect(result).toEqual(['ca', 'f\u00e9']);
  });

  it('breaks hiatus when weak vowel is accented', () => {
    const result = splitSpanishSyllables('pa\u00eds');
    // "pa-ís" — accent on í breaks the potential diphthong
    expect(result.length).toBe(2);
    expect(result[0]).toBe('pa');
    expect(result[1]).toBe('\u00eds');
  });

  it('handles single-syllable words', () => {
    expect(splitSpanishSyllables('sol')).toEqual(['sol']);
    expect(splitSpanishSyllables('pan')).toEqual(['pan']);
  });

  it('handles very short words', () => {
    expect(splitSpanishSyllables('no')).toEqual(['no']);
    expect(splitSpanishSyllables('si')).toEqual(['si']);
  });
});

// ─── Spanish Phonics Engine ────────────────────────────────────

describe('analyzeSpanishWord', () => {
  it('detects silent h', () => {
    const result = analyzeSpanishWord('hola');
    const silentH = result.patterns.find((p) => p.id === 'es-h-silent');
    expect(silentH).toBeDefined();
    expect(silentH!.hint).toContain('silent');
  });

  it('detects ch digraph', () => {
    const result = analyzeSpanishWord('chico');
    const ch = result.patterns.find((p) => p.id === 'es-ch');
    expect(ch).toBeDefined();
  });

  it('detects ll digraph', () => {
    const result = analyzeSpanishWord('lluvia');
    const ll = result.patterns.find((p) => p.id === 'es-ll');
    expect(ll).toBeDefined();
  });

  it('detects rr digraph', () => {
    const result = analyzeSpanishWord('perro');
    const rr = result.patterns.find((p) => p.id === 'es-rr');
    expect(rr).toBeDefined();
  });

  it('detects accented vowels', () => {
    const result = analyzeSpanishWord('caf\u00e9');
    const accent = result.patterns.find((p) => p.id === 'es-e-accent');
    expect(accent).toBeDefined();
  });

  it('detects ñ', () => {
    const result = analyzeSpanishWord('ni\u00f1o');
    const nn = result.patterns.find((p) => p.id === 'es-nn');
    expect(nn).toBeDefined();
    expect(nn!.hint).toContain('ny');
  });

  it('detects soft c before e/i', () => {
    const result = analyzeSpanishWord('cielo');
    const softC = result.patterns.find((p) => p.id === 'es-c-soft');
    expect(softC).toBeDefined();
  });

  it('detects hard c before a/o/u', () => {
    const result = analyzeSpanishWord('casa');
    const hardC = result.patterns.find((p) => p.id === 'es-c-hard');
    expect(hardC).toBeDefined();
  });

  it('detects v/b equivalence', () => {
    const result = analyzeSpanishWord('vaca');
    const v = result.patterns.find((p) => p.id === 'es-v');
    expect(v).toBeDefined();
    expect(v!.hint).toContain('same as "b"');
  });

  it('produces syllables', () => {
    const result = analyzeSpanishWord('familia');
    expect(result.syllables.length).toBeGreaterThan(1);
  });

  it('produces phonemes covering the whole word', () => {
    const result = analyzeSpanishWord('hola');
    const totalLength = result.phonemes.reduce((sum, p) => sum + p.length, 0);
    expect(totalLength).toBe(4); // h-o-l-a
  });

  it('computes difficulty score between 0 and 1', () => {
    const result = analyzeSpanishWord('sol');
    expect(result.difficultyScore).toBeGreaterThanOrEqual(0);
    expect(result.difficultyScore).toBeLessThanOrEqual(1);
  });

  it('accented words have higher difficulty than plain words', () => {
    const plain = analyzeSpanishWord('casa');
    const accented = analyzeSpanishWord('caf\u00e9');
    expect(accented.difficultyScore).toBeGreaterThan(plain.difficultyScore);
  });

  it('returns related words', () => {
    const result = analyzeSpanishWord('chico');
    expect(result.relatedWords.length).toBeGreaterThan(0);
  });
});

// ─── Multilingual Dispatcher ───────────────────────────────────

describe('multilingual phonics dispatcher', () => {
  it('hasPhonicsEngine returns true for English and Spanish', () => {
    expect(hasPhonicsEngine('en')).toBe(true);
    expect(hasPhonicsEngine('es')).toBe(true);
  });

  it('hasPhonicsEngine returns false for unsupported languages', () => {
    expect(hasPhonicsEngine('zh')).toBe(false);
    expect(hasPhonicsEngine('el')).toBe(false);
  });

  it('analyzeWordMultilingual dispatches to English', () => {
    const result = analyzeWordMultilingual('knight', 'en');
    expect(result.patterns.length).toBeGreaterThan(0);
    // Should detect the "kn" silent letter pattern
    const kn = result.patterns.find((p) => p.grapheme === 'kn');
    expect(kn).toBeDefined();
  });

  it('analyzeWordMultilingual dispatches to Spanish', () => {
    const result = analyzeWordMultilingual('ni\u00f1o', 'es');
    const nn = result.patterns.find((p) => p.id === 'es-nn');
    expect(nn).toBeDefined();
  });

  it('analyzeWordMultilingual returns bypass for unsupported language', () => {
    const result = analyzeWordMultilingual('hello', 'zh');
    expect(result.patterns).toEqual([]);
    expect(result.difficultyScore).toBe(0.3); // bypass default
    expect(result.syllables).toEqual(['hello']);
  });

  it('splitSyllablesMultilingual uses Spanish rules', () => {
    const result = splitSyllablesMultilingual('casa', 'es');
    expect(result).toEqual(['ca', 'sa']);
  });

  it('splitSyllablesMultilingual falls back for unknown language', () => {
    const result = splitSyllablesMultilingual('hello', 'zh');
    expect(result).toEqual(['hello']);
  });
});

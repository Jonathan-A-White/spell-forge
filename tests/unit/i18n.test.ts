// tests/unit/i18n.test.ts — Tests for the language registry and TTS instructions

import { describe, it, expect } from 'vitest';
import {
  getLanguageConfig,
  getAllLanguages,
  getLanguageCodes,
  isLanguageSupported,
  getFullCharacterSet,
  DEFAULT_LANGUAGE,
} from '../../src/i18n/language-registry';
import {
  getTtsInstructions,
  getTtsInstructionsForLanguage,
} from '../../src/i18n/tts-instructions';

// ─── Language Registry ─────────────────────────────────────────

describe('language-registry', () => {
  it('default language is English', () => {
    expect(DEFAULT_LANGUAGE).toBe('en');
  });

  it('getAllLanguages returns at least English and Spanish', () => {
    const langs = getAllLanguages();
    const codes = langs.map((l) => l.code);
    expect(codes).toContain('en');
    expect(codes).toContain('es');
  });

  it('getLanguageCodes returns registered codes', () => {
    const codes = getLanguageCodes();
    expect(codes).toContain('en');
    expect(codes).toContain('es');
  });

  it('isLanguageSupported recognizes registered languages', () => {
    expect(isLanguageSupported('en')).toBe(true);
    expect(isLanguageSupported('es')).toBe(true);
    expect(isLanguageSupported('zh')).toBe(false);
    expect(isLanguageSupported('')).toBe(false);
  });

  it('getLanguageConfig returns English config', () => {
    const config = getLanguageConfig('en');
    expect(config.code).toBe('en');
    expect(config.displayName).toBe('English');
    expect(config.bcp47).toBe('en-US');
    expect(config.hasPhonics).toBe(true);
    expect(config.hasOCR).toBe(true);
    expect(config.strictAccents).toBe(false);
    expect(config.alphabet).toBe('abcdefghijklmnopqrstuvwxyz');
  });

  it('getLanguageConfig returns Spanish config', () => {
    const config = getLanguageConfig('es');
    expect(config.code).toBe('es');
    expect(config.displayName).toBe('Spanish');
    expect(config.bcp47).toBe('es-ES');
    expect(config.hasPhonics).toBe(true);
    expect(config.hasOCR).toBe(false);
    expect(config.strictAccents).toBe(true);
    expect(config.keyboardRows).toBeDefined();
    // Spanish keyboard has ñ in the second row
    expect(config.keyboardRows![1]).toContain('\u00f1');
    // Spanish has an accent row
    expect(config.accentRow).toBeDefined();
    expect(config.accentRow).toContain('\u00e1');
    expect(config.accentRow).toContain('\u00e9');
  });

  it('getLanguageConfig falls back to English for unknown codes', () => {
    const config = getLanguageConfig('xx');
    expect(config.code).toBe('en');
  });

  it('getFullCharacterSet includes alphabet + extras', () => {
    const chars = getFullCharacterSet('es');
    expect(chars).toContain('a');
    expect(chars).toContain('z');
    expect(chars).toContain('\u00f1');
    expect(chars).toContain('\u00e1');
  });

  it('English character set has no extras', () => {
    const chars = getFullCharacterSet('en');
    expect(chars.length).toBe(26);
  });
});

// ─── TTS Instructions ──────────────────────────────────────────

describe('tts-instructions', () => {
  it('returns Android instructions for Spanish', () => {
    const instr = getTtsInstructions('es', 'android');
    expect(instr).not.toBeNull();
    expect(instr!.platform).toBe('android');
    expect(instr!.languageCode).toBe('es');
    expect(instr!.steps.length).toBeGreaterThan(0);
  });

  it('returns iOS instructions for Spanish', () => {
    const instr = getTtsInstructions('es', 'ios');
    expect(instr).not.toBeNull();
    expect(instr!.platform).toBe('ios');
  });

  it('returns both platforms for Spanish', () => {
    const all = getTtsInstructionsForLanguage('es');
    expect(all.length).toBe(2);
    const platforms = all.map((i) => i.platform).sort();
    expect(platforms).toEqual(['android', 'ios']);
  });

  it('returns instructions for English too', () => {
    const all = getTtsInstructionsForLanguage('en');
    expect(all.length).toBe(2);
  });
});

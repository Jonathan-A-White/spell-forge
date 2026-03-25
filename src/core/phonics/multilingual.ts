// src/core/phonics/multilingual.ts — Language-aware phonics dispatcher.
// Routes to the correct language engine or returns a bypass result when
// no phonics engine exists for the requested language.

import type { PhonicsResult } from '../../contracts/types.ts';
import { isLanguageSupported } from '../../i18n/language-registry.ts';
import { analyzeWord as analyzeEnglishWord } from './engine.ts';
import { analyzeSpanishWord } from './languages/spanish/engine.ts';
import { splitSyllables as splitEnglishSyllables } from './syllabifier.ts';
import { splitSpanishSyllables } from './languages/spanish/syllabifier.ts';

type PhonicsEngine = (word: string) => PhonicsResult;
type SyllableEngine = (word: string) => string[];

/** Registry of phonics engines by language code. */
const phonicsEngines: Record<string, PhonicsEngine> = {
  en: analyzeEnglishWord,
  es: analyzeSpanishWord,
};

/** Registry of syllable engines by language code. */
const syllableEngines: Record<string, SyllableEngine> = {
  en: splitEnglishSyllables,
  es: splitSpanishSyllables,
};

/**
 * Analyze a word using the appropriate language engine.
 * If no engine exists for the language, returns a bypass result with
 * basic information (the word as a single "syllable", no patterns).
 */
export function analyzeWordMultilingual(word: string, language: string): PhonicsResult {
  const engine = isLanguageSupported(language) ? phonicsEngines[language] : undefined;

  if (engine) {
    return engine(word);
  }

  // Bypass: return minimal result for unsupported languages
  return createBypassResult(word);
}

/**
 * Split a word into syllables using the appropriate language engine.
 * Falls back to treating the whole word as one syllable if no engine exists.
 */
export function splitSyllablesMultilingual(word: string, language: string): string[] {
  const engine = isLanguageSupported(language) ? syllableEngines[language] : undefined;

  if (engine) {
    return engine(word);
  }

  return [word.toLowerCase().trim()];
}

/**
 * Check if a phonics engine is available for a language.
 */
export function hasPhonicsEngine(language: string): boolean {
  return isLanguageSupported(language) && language in phonicsEngines;
}

/**
 * Minimal PhonicsResult for languages without a phonics engine.
 * The word can still be practiced — just without pattern analysis.
 */
function createBypassResult(word: string): PhonicsResult {
  const lower = word.toLowerCase().trim();
  return {
    syllables: [lower],
    phonemes: lower.split('').map((ch, i) => ({
      grapheme: ch,
      phoneme: `/${ch}/`,
      position: i,
      length: 1,
    })),
    patterns: [],
    difficultyScore: 0.3, // neutral default
    scaffoldingHints: [],
    relatedWords: [],
  };
}

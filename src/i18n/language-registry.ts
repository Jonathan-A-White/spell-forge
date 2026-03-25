// src/i18n/language-registry.ts — Central registry of supported languages and their capabilities.
// To add a new language: add an entry to LANGUAGES below. Everything else adapts automatically.

export type LanguageCode = 'en' | 'es';

export interface LanguageConfig {
  code: LanguageCode;
  displayName: string;           // shown in UI (English label)
  nativeName: string;            // shown in UI (native label)
  /** BCP-47 tag for TTS utterance.lang */
  bcp47: string;
  /** Preferred BCP-47 variants for voice ranking (first = highest priority) */
  voicePreferences: string[];
  /** Alphabet for virtual keyboard distractor pools and spell-catcher */
  alphabet: string;
  /** Whether a phonics engine exists for this language */
  hasPhonics: boolean;
  /** Whether OCR (Tesseract) is supported */
  hasOCR: boolean;
  /** Tesseract language code (e.g. 'eng', 'spa') — only meaningful when hasOCR is true */
  tesseractLang?: string;
  /** Whether diacritics/accents are required for correct spelling (strict mode) */
  strictAccents: boolean;
  /** Additional characters beyond base alphabet (accented chars, special letters) */
  extraCharacters: string[];
  /** Keyboard layout rows (QWERTY-style). If absent, falls back to English layout. */
  keyboardRows?: string[][];
  /** Extra row shown above backspace row for accented/special characters */
  accentRow?: string[];
}

const LANGUAGES: Record<LanguageCode, LanguageConfig> = {
  en: {
    code: 'en',
    displayName: 'English',
    nativeName: 'English',
    bcp47: 'en-US',
    voicePreferences: ['en-US', 'en-GB', 'en-AU'],
    alphabet: 'abcdefghijklmnopqrstuvwxyz',
    hasPhonics: true,
    hasOCR: true,
    tesseractLang: 'eng',
    strictAccents: false,
    extraCharacters: [],
    keyboardRows: [
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
      ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
    ],
  },
  es: {
    code: 'es',
    displayName: 'Spanish',
    nativeName: 'Espanol',
    bcp47: 'es-ES',
    voicePreferences: ['es-ES', 'es-MX', 'es-US', 'es-AR'],
    alphabet: 'abcdefghijklmnopqrstuvwxyz',
    hasPhonics: true,
    hasOCR: false,  // deferred — OCR not yet supported for Spanish
    tesseractLang: 'spa',
    strictAccents: true,
    extraCharacters: ['\u00f1', '\u00e1', '\u00e9', '\u00ed', '\u00f3', '\u00fa', '\u00fc', '\u00a1', '\u00bf'],
    keyboardRows: [
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '\u00f1'],
      ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
    ],
    accentRow: ['\u00e1', '\u00e9', '\u00ed', '\u00f3', '\u00fa', '\u00fc'],
  },
};

/** Get config for a specific language. Falls back to English for unknown codes. */
export function getLanguageConfig(code: string): LanguageConfig {
  return LANGUAGES[code as LanguageCode] ?? LANGUAGES.en;
}

/** Get all registered languages. */
export function getAllLanguages(): LanguageConfig[] {
  return Object.values(LANGUAGES);
}

/** Get all language codes. */
export function getLanguageCodes(): LanguageCode[] {
  return Object.keys(LANGUAGES) as LanguageCode[];
}

/** Check if a language code is registered. */
export function isLanguageSupported(code: string): code is LanguageCode {
  return code in LANGUAGES;
}

/** Get the full character set for a language (alphabet + extra characters). */
export function getFullCharacterSet(code: string): string[] {
  const config = getLanguageConfig(code);
  return [...config.alphabet.split(''), ...config.extraCharacters];
}

/** Default language for new word lists. */
export const DEFAULT_LANGUAGE: LanguageCode = 'en';

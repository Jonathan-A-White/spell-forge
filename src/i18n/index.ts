// src/i18n/index.ts — Barrel exports

export {
  getLanguageConfig,
  getAllLanguages,
  getLanguageCodes,
  isLanguageSupported,
  getFullCharacterSet,
  DEFAULT_LANGUAGE,
} from './language-registry.ts';
export type { LanguageCode, LanguageConfig } from './language-registry.ts';

export {
  getTtsInstructions,
  getTtsInstructionsForLanguage,
} from './tts-instructions.ts';
export type { TtsInstruction } from './tts-instructions.ts';

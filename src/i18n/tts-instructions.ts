// src/i18n/tts-instructions.ts — Platform-specific TTS installation instructions per language.

import type { LanguageCode } from './language-registry.ts';

export interface TtsInstruction {
  platform: 'android' | 'ios';
  languageCode: LanguageCode;
  title: string;
  steps: string[];
}

const instructions: TtsInstruction[] = [
  // ─── English (usually pre-installed) ──────────────────────
  {
    platform: 'android',
    languageCode: 'en',
    title: 'English TTS on Android',
    steps: [
      'English voices are usually pre-installed.',
      'If not: open Settings > System > Language & Input > Text-to-Speech.',
      'Tap your preferred engine (Google TTS is recommended).',
      'Tap "Install voice data" and select English.',
    ],
  },
  {
    platform: 'ios',
    languageCode: 'en',
    title: 'English TTS on iPhone/iPad',
    steps: [
      'English voices are usually pre-installed.',
      'For enhanced voices: Settings > Accessibility > Spoken Content > Voices.',
      'Tap English and download an enhanced voice.',
    ],
  },

  // ─── Spanish ──────────────────────────────────────────────
  {
    platform: 'android',
    languageCode: 'es',
    title: 'Spanish TTS on Android',
    steps: [
      'Open Settings > System > Language & Input > Text-to-Speech.',
      'Tap your TTS engine (Google TTS recommended).',
      'Tap "Install voice data" or "Language".',
      'Find "Spanish" (Espanol) and tap to download.',
      'Choose a regional variant if prompted (Spain, Mexico, etc.).',
      'Return to SpellForge and the Spanish voice will be available.',
    ],
  },
  {
    platform: 'ios',
    languageCode: 'es',
    title: 'Spanish TTS on iPhone/iPad',
    steps: [
      'Open Settings > Accessibility > Spoken Content > Voices.',
      'Scroll to "Spanish" and tap it.',
      'Download a voice (e.g., "Monica" for Spain, "Paulina" for Mexico).',
      'Enhanced voices sound more natural but require more storage.',
      'Return to SpellForge and the Spanish voice will be available.',
    ],
  },
];

/** Get TTS installation instructions for a language and platform. */
export function getTtsInstructions(
  languageCode: LanguageCode,
  platform: 'android' | 'ios',
): TtsInstruction | null {
  return instructions.find(
    (i) => i.languageCode === languageCode && i.platform === platform,
  ) ?? null;
}

/** Get all TTS instructions for a language (both platforms). */
export function getTtsInstructionsForLanguage(
  languageCode: LanguageCode,
): TtsInstruction[] {
  return instructions.filter((i) => i.languageCode === languageCode);
}

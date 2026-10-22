// src/audio/voice.ts — The one voice setting (profile.settings.tutorVoice, chosen under Tutor settings) and the ranking
// SpellForge gives voice-kit/speech's preferredVoice (through speak's `rank`).  The tutor's sentences (tutor-speech.ts)
// and the spelling words (speech.ts) both take their voice from here, so the Voice picker changes both.

import { getLanguageConfig } from '../i18n/language-registry.ts';

/** The language of a voice or tag as the kit compares it: lower case, hyphenated, e.g. 'en-gb'. */
export const normaliseLang = (lang: string): string => lang.replace('_', '-').toLowerCase();
/** 'en' of 'en-GB'. */
export const primaryOf = (lang: string): string => normaliseLang(lang).split('-')[0];

let pickedVoiceURI: string | null = null;

/** Sets the voice every speech takes unless it is given another: the active profile's tutorVoice (voiceURI), or none. */
export function setSpeechVoice(voiceURI: string | null | undefined): void {
  pickedVoiceURI = voiceURI || null;
}

/** The voiceURI set with setSpeechVoice, if any. */
export function speechVoiceURI(): string | null {
  return pickedVoiceURI;
}

/** The phone's voice with this voiceURI; undefined when none is given or the phone does not list it (now, or yet). */
export function findVoice(voiceURI: string | null | undefined): SpeechSynthesisVoice | undefined {
  if (!voiceURI || typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;
  return window.speechSynthesis.getVoices().find((v) => v.voiceURI === voiceURI);
}

/**
 * How much SpellForge wants this voice for `lang` (higher wins; the kit takes the first of equals): the order of the
 * language's voicePreferences in the language registry (en-US, en-GB, en-AU; es-ES, es-MX, ...), then the rest alike.
 * The kit applies it after its language match, so it never picks a voice of another language.
 */
export function rankVoice(voice: SpeechSynthesisVoice, lang: string): number {
  const config = getLanguageConfig(primaryOf(lang));
  if (config.code !== primaryOf(lang)) return 0; // a language with no preferences (the registry falls back to English)
  const voiceLang = normaliseLang(voice.lang);
  const prefs = config.voicePreferences.map((p) => p.toLowerCase());
  const at = prefs.findIndex((p) => voiceLang.startsWith(p));
  return at >= 0 ? prefs.length - at : 0;
}

/** How long a speech that needs a particular voice waits for the phone to list its voices (the kit waits as long for its own choice). */
export const VOICES_LISTED_WAIT_MS = 1000;

/** Resolves once the phone lists voices (Chrome Android lists them late), or after VOICES_LISTED_WAIT_MS, or at once when it does or cannot. */
export function voicesListed(): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return Promise.resolve();
  const synth = window.speechSynthesis;
  if (synth.getVoices().length > 0 || typeof synth.addEventListener !== 'function') return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      synth.removeEventListener('voiceschanged', onChanged);
      clearTimeout(timer);
      resolve();
    };
    const onChanged = () => {
      if (synth.getVoices().length > 0) done();
    };
    const timer = setTimeout(done, VOICES_LISTED_WAIT_MS);
    synth.addEventListener('voiceschanged', onChanged);
  });
}

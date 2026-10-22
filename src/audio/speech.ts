// src/audio/speech.ts — Spelling practice's single words (sayWord, sayWordSlowly, spellWord, sayThenSpell), the voice list
// for the Voice picker and the engine warm-up.  All speech goes through voice-kit/speech's speak(), the engine the tutor
// uses too (src/audio/tutor-speech.ts): SpellForge has no engine of its own.  The voice is the one setting both share (see
// voice.ts); the language-aware ranking of voices is rankVoice, given to the kit as `rank`.

import { isSpeaking, isSupported, speak, stop, subscribe, whenDone } from 'voice-kit/speech';
import { getLanguageConfig } from '../i18n/language-registry.ts';
import { findVoice, normaliseLang, primaryOf, rankVoice, speechVoiceURI } from './voice.ts';

/** Who the words (and the warm-up's blank) are, in the kit: a new one replaces the old, and the tutor's bar does not show for it. */
export const WORD_SPEECH_KEY = 'word';

/**
 * A word is let go of this long after it is asked for, plus a second a word at normal speed, if the engine has said
 * nothing: the kit has no timeout for an engine that never starts, and the audio manager would stay busy for ever.
 * (The old retry with another voice, five tries and a cooldown, is gone: a word that errors is silent and a tap says it again.)
 */
export const STUCK_ENGINE_MS = 10_000;
const WARM_UP_TIMEOUT_MS = 2_000;

/** True when the browser supports speech synthesis. */
export function isTtsAvailable(): boolean {
  return isSupported();
}

// ─── The voice list ─────────────────────────────────────────

function deviceLanguage(): string {
  return typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';
}

/** The device's voices for the phone's language, best first by rankVoice (the same rank the words give the kit): what the Voice picker offers. */
export function listTutorVoices(language: string = deviceLanguage()): SpeechSynthesisVoice[] {
  if (!isSupported()) return [];
  const primary = primaryOf(language);
  return window.speechSynthesis
    .getVoices()
    .filter((v) => primaryOf(v.lang) === primary)
    .map((voice, order) => ({ voice, order, score: rankVoice(voice, language) }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((entry) => entry.voice);
}

/** Calls back when the device finishes loading its voices (Chrome Android does it late); returns the unsubscribe. */
export function onVoicesChanged(callback: () => void): () => void {
  if (!isSupported()) return () => undefined;
  const synth = window.speechSynthesis;
  synth.addEventListener('voiceschanged', callback);
  return () => synth.removeEventListener('voiceschanged', callback);
}

/** True when the device lists a voice for this app language ('en', 'es'). */
export function hasVoicesForLanguage(languageCode: string): boolean {
  if (!isSupported()) return false;
  const prefix = getLanguageConfig(languageCode).code;
  return window.speechSynthesis.getVoices().some((v) => normaliseLang(v.lang).startsWith(prefix));
}

/** A human-readable status for TTS availability for a language. */
export function getTtsStatus(languageCode: string): 'available' | 'no-voices' | 'unavailable' {
  if (!isTtsAvailable()) return 'unavailable';
  if (hasVoicesForLanguage(languageCode)) return 'available';
  return 'no-voices';
}

// ─── Warm-up ────────────────────────────────────────────────

let warmedUp = false;

/**
 * Prime the TTS engine during a user gesture so Chrome Android unlocks audio and lists its voices.  It speaks a blank
 * (the kit's speak() has no volume, and a space is silent), once.  Resolves when the primer is over or after two seconds.
 */
export function warmUp(): Promise<void> {
  if (warmedUp || !isSupported()) return Promise.resolve();
  warmedUp = true;
  return waitFor(WORD_SPEECH_KEY, WARM_UP_TIMEOUT_MS, () => speak(' ', { key: WORD_SPEECH_KEY }));
}

// ─── The words ──────────────────────────────────────────────

/**
 * Runs `start` (which calls the kit's speak under `key`) and resolves when that speech is over for good: played out,
 * errored (the kit drops it), stopped or replaced by a newer one.  Gives up after `limitMs` against a stuck engine.
 */
function waitFor(key: string, limitMs: number, start: () => void): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, limitMs);
    const unsubscribe = subscribe(() => {
      if (!isSpeaking(key)) done();
    });
    function done() {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    }
    start();
    if (isSpeaking(key)) whenDone(key, done);
    else done();
  });
}

/**
 * The picked voice (Tutor settings) when it speaks this app language, else none and the kit takes the best by rankVoice.
 * A word in Spanish is not read in an English voice, whatever the Tutor voice is.
 */
function pickedVoiceFor(bcp47: string): SpeechSynthesisVoice | undefined {
  const voice = findVoice(speechVoiceURI());
  return voice && primaryOf(voice.lang) === primaryOf(bcp47) ? voice : undefined;
}

function say(text: string, language: string, rate?: number): Promise<void> {
  if (!isSupported()) return Promise.resolve();
  const bcp47 = getLanguageConfig(language).bcp47;
  const voice = pickedVoiceFor(bcp47);
  const words = text.split(/\s+/).length;
  const limit = STUCK_ENGINE_MS + (words * 1000) / (rate ?? 1);
  return waitFor(WORD_SPEECH_KEY, limit, () => speak(text, { key: WORD_SPEECH_KEY, lang: voice?.lang ?? bcp47, voice, rank: rankVoice, rate }));
}

const spelled = (word: string) => word.split('').join(', ');

/** Say a word out loud. Optionally specify language for correct pronunciation. */
export function sayWord(word: string, language: string = 'en'): Promise<void> {
  return say(word, language);
}

/** Say a word slowly (0.6x speed). */
export function sayWordSlowly(word: string, language: string = 'en'): Promise<void> {
  return say(word, language, 0.6);
}

/** Spell a word letter-by-letter (single utterance, commas create pauses). */
export function spellWord(word: string, language: string = 'en'): Promise<void> {
  return say(spelled(word), language);
}

/** Say the word, pause, then spell it (single utterance). */
export function sayThenSpell(word: string, language: string = 'en'): Promise<void> {
  return say(`${word},,,, ${spelled(word)}`, language);
}

/** Stop whatever is being said, at once, and drop what is queued.  Ends the tutor's speech too: nothing is kept to resume. */
export function stopSpeaking(): void {
  stop();
}

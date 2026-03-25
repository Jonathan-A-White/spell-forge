// src/audio/speech.ts — TTS for Chrome PWA on Android.  Uses only the Web
// Speech API with robust retry logic (exponential backoff, voice fallback).
// Supports multiple languages via the language-aware voice selection system.

import { getLanguageConfig } from '../i18n/language-registry.ts';

const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500; // longer base delay — engine needs real recovery time

// ─── Debug logging ──────────────────────────────────────────

function dbg(msg: string, data?: Record<string, unknown>): void {
  const ts = new Date().toISOString().slice(11, 23);
  const extra = data ? ' ' + JSON.stringify(data) : '';
  console.log(`[TTS ${ts}] ${msg}${extra}`);
}

// ─── Voice selection ────────────────────────────────────────

// Cache: keyed by language code. null = not yet resolved, empty array = no voices found.
const voiceCache = new Map<string, SpeechSynthesisVoice[]>();

/**
 * Return all voices for a language ranked by preference.
 * Uses the voicePreferences from the language config to rank.
 */
function getVoicesForLanguage(languageCode: string): SpeechSynthesisVoice[] {
  if (voiceCache.has(languageCode)) return voiceCache.get(languageCode)!;

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    voiceCache.set(languageCode, []);
    return [];
  }

  const config = getLanguageConfig(languageCode);
  const allVoices = window.speechSynthesis.getVoices();

  // Match voices by language prefix (e.g., 'es' matches 'es-ES', 'es-MX')
  const langPrefix = config.code;
  const matched = allVoices.filter((v) => {
    const vLang = v.lang.replace('_', '-').toLowerCase();
    return vLang.startsWith(langPrefix);
  });

  // Rank by voicePreferences order
  const prefs = config.voicePreferences.map((p) => p.toLowerCase());
  matched.sort((a, b) => {
    const aLang = a.lang.replace('_', '-').toLowerCase();
    const bLang = b.lang.replace('_', '-').toLowerCase();
    const aRank = prefs.findIndex((p) => aLang.startsWith(p));
    const bRank = prefs.findIndex((p) => bLang.startsWith(p));
    const aScore = aRank >= 0 ? aRank : 999;
    const bScore = bRank >= 0 ? bRank : 999;
    return aScore - bScore;
  });

  voiceCache.set(languageCode, matched);

  if (matched.length > 0) {
    dbg(`Voices found for ${languageCode}`, {
      count: matched.length,
      voices: matched.map((v) => ({ name: v.name, lang: v.lang })),
    });
  } else {
    dbg(`No voices found for ${languageCode} — will rely on lang attribute`);
  }

  return matched;
}

function logVoices(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices();
  dbg('Available voices', {
    count: voices.length,
    voices: voices.map((v) => ({
      name: v.name,
      lang: v.lang,
      default: v.default,
      local: v.localService,
    })),
  });
}

// Listen for voices to load asynchronously (Chrome Android fires this late).
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  dbg('Registering onvoiceschanged listener');
  window.speechSynthesis.onvoiceschanged = () => {
    dbg('voiceschanged fired');
    logVoices();
    // Clear all cached voices when the list changes (voices load async on Android).
    voiceCache.clear();
  };
  // Also try eagerly — voices may already be available.
  logVoices();
}

// ─── TTS engine status ──────────────────────────────────────

// Track consecutive failures.  After repeated failures we back off with a
// cooldown rather than permanently giving up — TTS can recover after the
// engine finishes initialising or after a user gesture.
let consecutiveFailures = 0;
let cooldownUntil = 0;
const COOLDOWN_MS = 5_000; // wait 5 s before retrying after all attempts fail

// ─── Core TTS speak ─────────────────────────────────────────

/** Voice + lang strategy for a single TTS attempt. */
interface SpeakStrategy {
  voice: SpeechSynthesisVoice | null;
  lang: string | null; // null = don't set lang attribute
  label: string;       // human-readable label for logs
}

/**
 * Attempt to speak via Web Speech API.  Returns true if onend fired
 * (success), false if onerror/timeout fired.
 */
function trySpeak(
  text: string,
  rate: number,
  strategy: SpeakStrategy,
): Promise<boolean> {
  const synth = window.speechSynthesis;

  dbg('trySpeak()', {
    text: text.slice(0, 60),
    rate,
    strategy: strategy.label,
    speaking: synth.speaking,
    pending: synth.pending,
    paused: synth.paused,
  });

  // resume() recovers from Chrome's silent-pause (screen off / tab switch).
  synth.resume();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;

  if (strategy.lang) {
    utterance.lang = strategy.lang;
  }
  if (strategy.voice) {
    utterance.voice = strategy.voice;
  }

  return new Promise<boolean>((resolve) => {
    let done = false;

    const finish = (reason: string, success: boolean) => {
      if (!done) {
        done = true;
        clearTimeout(timeout);
        dbg(`trySpeak() finished — ${reason}`, {
          success,
          speaking: synth.speaking,
          pending: synth.pending,
        });
        resolve(success);
      }
    };

    const timeout = setTimeout(() => finish('timeout', false), TIMEOUT_MS);
    utterance.onend = () => finish('onend', true);
    utterance.onerror = (ev) => {
      const err = (ev as SpeechSynthesisErrorEvent).error ?? 'unknown';
      dbg('trySpeak() onerror', { error: err });
      finish('onerror', false);
    };

    synth.speak(utterance);
    dbg('trySpeak() synth.speak() returned', {
      speaking: synth.speaking,
      pending: synth.pending,
    });
  });
}

/**
 * Build a list of strategies to try for a given language.
 *
 *   1-3. Language-specific voices with correct lang tag
 *   4.   Device default voice with lang tag — some engines can speak any
 *        language with any voice; the default voice may have a working synth
 *        pipeline even when language-specific ones are broken.
 *   5.   Bare-minimum utterance — no voice, no lang.  Lets the engine pick
 *        everything itself.
 */
function buildStrategies(languageCode: string = 'en'): SpeakStrategy[] {
  const config = getLanguageConfig(languageCode);
  const langVoices = getVoicesForLanguage(languageCode);
  const strategies: SpeakStrategy[] = [];
  const bcp47 = config.bcp47;

  // Language-specific voices with lang tag (up to 3).
  for (const v of langVoices.slice(0, 3)) {
    strategies.push({ voice: v, lang: bcp47, label: `${v.name} + lang=${bcp47}` });
  }

  // Device default voice with lang tag.
  const allVoices = typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis.getVoices()
    : [];
  const defaultVoice = allVoices.find((v) => v.default) ?? allVoices[0] ?? null;
  if (defaultVoice && !langVoices.includes(defaultVoice)) {
    strategies.push({
      voice: defaultVoice,
      lang: bcp47,
      label: `default voice (${defaultVoice.name}) + lang=${bcp47}`,
    });
  }

  // Bare-minimum: no voice, no lang.  The engine picks everything.
  strategies.push({ voice: null, lang: null, label: 'bare-minimum (no voice, no lang)' });

  return strategies;
}

/**
 * Try TTS, cycling through voice strategies with exponential backoff.
 *
 * On total failure a short cooldown prevents hammering a broken engine.
 */
async function ttsSpeak(text: string, rate: number, languageCode: string = 'en'): Promise<boolean> {
  // Respect cooldown after repeated failures.
  if (Date.now() < cooldownUntil) {
    dbg('ttsSpeak() skipped — cooling down', {
      remainingMs: cooldownUntil - Date.now(),
    });
    return false;
  }

  const strategies = buildStrategies(languageCode);
  const attempts = Math.min(strategies.length, MAX_ATTEMPTS);

  for (let i = 0; i < attempts; i++) {
    const strategy = strategies[i];
    const attemptNum = i + 1;

    // On retries: cancel stuck state and wait for the engine to recover.
    if (i > 0) {
      const synth = window.speechSynthesis;
      synth.cancel();
      const delay = BASE_DELAY_MS * Math.pow(2, i - 1);
      dbg(`ttsSpeak() attempt ${attemptNum - 1} failed — cancel + wait ${delay}ms`);
      await new Promise<void>((r) => setTimeout(r, delay));
    }

    dbg(`ttsSpeak() attempt ${attemptNum}/${attempts}`, {
      strategy: strategy.label,
    });
    const ok = await trySpeak(text, rate, strategy);

    if (ok) {
      consecutiveFailures = 0;
      cooldownUntil = 0;
      return true;
    }
  }

  consecutiveFailures++;
  cooldownUntil = Date.now() + COOLDOWN_MS;
  dbg('ttsSpeak() all attempts failed — entering cooldown', {
    consecutiveFailures,
    cooldownMs: COOLDOWN_MS,
  });
  return false;
}

// ─── Warm-up ────────────────────────────────────────────────

let warmedUp = false;

/**
 * Prime the TTS engine during a user gesture so Chrome Android unlocks audio.
 * Call this once from any early user interaction (tap, click).  It speaks a
 * silent utterance to force voice loading and engine initialisation.
 *
 * Waits for the primer to finish (or fail) before resolving, so callers know
 * the engine is ready.
 */
export function warmUp(): Promise<void> {
  if (warmedUp) {
    dbg('warmUp() already done — skipping');
    return Promise.resolve();
  }
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    dbg('warmUp() speechSynthesis not available');
    return Promise.resolve();
  }

  warmedUp = true;
  const synth = window.speechSynthesis;
  dbg('warmUp() priming TTS engine');
  logVoices();

  // Don't cancel() before the primer — on some Chrome versions, cancel()
  // leaves the engine in a bad state that makes the next speak() fail.
  // Instead, just speak the primer directly.  If something was queued, the
  // primer will be appended and eventually played.

  return new Promise<void>((resolve) => {
    let resolved = false;
    const finish = (reason: string) => {
      if (resolved) return;
      resolved = true;
      dbg(`warmUp() ${reason}`, { speaking: synth.speaking, pending: synth.pending });
      resolve();
    };

    // Use a truly silent utterance — just enough to unlock the audio context
    // during a user gesture.  An empty string is ignored by some engines, so
    // we use a single space.  Volume 0 ensures nothing is audible.
    const primer = new SpeechSynthesisUtterance(' ');
    primer.volume = 0;

    primer.onend = () => finish('primer succeeded');
    primer.onerror = () => finish('primer failed — engine may need user gesture');

    // Safety timeout — don't block forever if the engine is unresponsive.
    setTimeout(() => finish('primer timed out'), 2000);

    synth.speak(primer);
    dbg('warmUp() primer queued', { speaking: synth.speaking, pending: synth.pending });
  });
}

// ─── Voice availability check ────────────────────────────────

/**
 * Check if TTS voices are available for a specific language.
 * Returns true if at least one voice matches, or if speechSynthesis is available
 * (since the engine may still speak the language via the lang attribute).
 */
export function hasVoicesForLanguage(languageCode: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  const voices = getVoicesForLanguage(languageCode);
  return voices.length > 0;
}

/**
 * Get a human-readable status for TTS availability for a language.
 */
export function getTtsStatus(languageCode: string): 'available' | 'no-voices' | 'unavailable' {
  if (!isTtsAvailable()) return 'unavailable';
  if (hasVoicesForLanguage(languageCode)) return 'available';
  return 'no-voices';
}

// ─── Public API ─────────────────────────────────────────────

/** Say a word out loud. Optionally specify language for correct pronunciation. */
export async function sayWord(word: string, language: string = 'en'): Promise<void> {
  dbg(`sayWord("${word}", lang=${language})`);
  await ttsSpeak(word, 1, language);
}

/** Say a word slowly (0.6x speed). */
export async function sayWordSlowly(word: string, language: string = 'en'): Promise<void> {
  dbg(`sayWordSlowly("${word}", lang=${language})`);
  await ttsSpeak(word, 0.6, language);
}

/** Spell a word letter-by-letter (single utterance, commas create pauses). */
export async function spellWord(word: string, language: string = 'en'): Promise<void> {
  dbg(`spellWord("${word}", lang=${language})`);
  const spelled = word.split('').join(', ');
  await ttsSpeak(spelled, 1, language);
}

/** Say the word, pause, then spell it (single utterance). */
export async function sayThenSpell(word: string, language: string = 'en'): Promise<void> {
  dbg(`sayThenSpell("${word}", lang=${language})`);
  const spelled = word.split('').join(', ');
  await ttsSpeak(`${word},,,, ${spelled}`, 1, language);
}

/** True when the browser supports speech synthesis. */
export function isTtsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

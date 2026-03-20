// src/audio/speech.ts — TTS for Chrome PWA on Android.  Uses only the Web
// Speech API with robust retry logic (exponential backoff, voice fallback).

const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 150;

// ─── Debug logging ──────────────────────────────────────────

function dbg(msg: string, data?: Record<string, unknown>): void {
  const ts = new Date().toISOString().slice(11, 23);
  const extra = data ? ' ' + JSON.stringify(data) : '';
  console.log(`[TTS ${ts}] ${msg}${extra}`);
}

// ─── Voice selection ────────────────────────────────────────

// Cache: null = not yet resolved, empty array = no English voices found.
let cachedEnglishVoices: SpeechSynthesisVoice[] | null = null;

/**
 * Return all English voices ranked by preference.
 * Order: en_US > en_GB > en_AU > en_IN > any en_*.
 */
function getEnglishVoices(): SpeechSynthesisVoice[] {
  if (cachedEnglishVoices !== null) return cachedEnglishVoices;

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    cachedEnglishVoices = [];
    return cachedEnglishVoices;
  }

  const voices = window.speechSynthesis.getVoices();
  const english = voices.filter((v) => /^en[-_]/i.test(v.lang));

  const rank = (v: SpeechSynthesisVoice): number => {
    const lang = v.lang.replace('_', '-').toLowerCase();
    if (lang.startsWith('en-us')) return 0;
    if (lang.startsWith('en-gb')) return 1;
    if (lang.startsWith('en-au')) return 2;
    return 3;
  };

  english.sort((a, b) => rank(a) - rank(b));
  cachedEnglishVoices = english;

  if (english.length > 0) {
    dbg('English voices found', {
      count: english.length,
      voices: english.map((v) => ({ name: v.name, lang: v.lang })),
    });
  } else {
    dbg('No English voices found — will rely on lang attribute');
  }

  return cachedEnglishVoices;
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
    // Re-resolve voices when the list changes (voices load async on Android).
    cachedEnglishVoices = null;
    getEnglishVoices();
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

/**
 * Attempt to speak via Web Speech API.  Returns true if onend fired
 * (success), false if onerror/timeout fired.
 *
 * @param voice — explicit voice to use, or null to use only the lang attribute
 */
function trySpeak(
  text: string,
  rate: number,
  voice: SpeechSynthesisVoice | null,
): Promise<boolean> {
  const synth = window.speechSynthesis;

  dbg('trySpeak()', {
    text: text.slice(0, 60),
    rate,
    voice: voice ? { name: voice.name, lang: voice.lang } : 'none (lang-only)',
    speaking: synth.speaking,
    pending: synth.pending,
    paused: synth.paused,
  });

  // resume() recovers from Chrome's silent-pause (screen off / tab switch).
  synth.resume();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  // Always set the lang attribute so the engine knows this is English text,
  // even when the device default voice is non-English (e.g. Assamese).
  utterance.lang = 'en-US';

  if (voice) {
    utterance.voice = voice;
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
 * Build a list of voice strategies to try.  Each entry is a voice object or
 * null (meaning "no explicit voice — rely on utterance.lang only").
 *
 * We try each distinct English voice once, then a final lang-only attempt.
 * This way if en_US is listed but broken, en_GB / en_AU / en_IN get a shot.
 */
function buildVoiceStrategies(): Array<SpeechSynthesisVoice | null> {
  const voices = getEnglishVoices();
  // Cap at MAX_ATTEMPTS-1 voices so we always have room for a lang-only try.
  const strategies: Array<SpeechSynthesisVoice | null> = voices.slice(0, MAX_ATTEMPTS - 1);
  strategies.push(null); // final: lang-only, no explicit voice
  return strategies;
}

/**
 * Try TTS, cycling through available English voices with exponential backoff.
 *
 * Strategy per attempt:
 *   1. cancel() to clear any stuck engine state (skipped on first attempt)
 *   2. Wait with exponential backoff (skipped on first attempt)
 *   3. Try a different English voice (cycles through en_US → en_GB → … → lang-only)
 *
 * On total failure a short cooldown prevents hammering a broken engine.
 */
async function ttsSpeak(text: string, rate: number): Promise<boolean> {
  // Respect cooldown after repeated failures.
  if (Date.now() < cooldownUntil) {
    dbg('ttsSpeak() skipped — cooling down', {
      remainingMs: cooldownUntil - Date.now(),
    });
    return false;
  }

  const strategies = buildVoiceStrategies();
  const attempts = Math.min(strategies.length, MAX_ATTEMPTS);

  for (let i = 0; i < attempts; i++) {
    const voice = strategies[i];
    const attemptNum = i + 1;

    // On retries: cancel stuck state and wait for the engine to recover.
    if (i > 0) {
      const synth = window.speechSynthesis;
      synth.cancel();
      const delay = BASE_DELAY_MS * Math.pow(2, i);
      dbg(`ttsSpeak() attempt ${attemptNum - 1} failed — cancel + wait ${delay}ms`);
      await new Promise<void>((r) => setTimeout(r, delay));
    }

    dbg(`ttsSpeak() attempt ${attemptNum}/${attempts}`, {
      voice: voice ? voice.name : 'lang-only',
    });
    const ok = await trySpeak(text, rate, voice);

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
  synth.cancel();
  logVoices();

  return new Promise<void>((resolve) => {
    const primer = new SpeechSynthesisUtterance('.');
    primer.volume = 0.01; // nearly silent but not zero
    primer.lang = 'en-US';
    const voices = getEnglishVoices();
    if (voices.length > 0) primer.voice = voices[0];

    const done = () => {
      dbg('warmUp() engine primed', { speaking: synth.speaking, pending: synth.pending });
      resolve();
    };

    primer.onend = done;
    primer.onerror = () => {
      dbg('warmUp() primer failed — engine may need user gesture');
      resolve(); // resolve anyway so callers aren't blocked
    };

    // Safety timeout — don't block forever if the engine is unresponsive.
    setTimeout(done, 2000);

    synth.speak(primer);
    dbg('warmUp() primer queued', { speaking: synth.speaking, pending: synth.pending });
  });
}

// ─── Public API ─────────────────────────────────────────────

/** Say a word out loud. */
export async function sayWord(word: string): Promise<void> {
  dbg(`sayWord("${word}")`);
  await ttsSpeak(word, 1);
}

/** Say a word slowly (0.6× speed). */
export async function sayWordSlowly(word: string): Promise<void> {
  dbg(`sayWordSlowly("${word}")`);
  await ttsSpeak(word, 0.6);
}

/** Spell a word letter-by-letter (single utterance, commas create pauses). */
export async function spellWord(word: string): Promise<void> {
  dbg(`spellWord("${word}")`);
  const spelled = word.split('').join(', ');
  await ttsSpeak(spelled, 1);
}

/** Say the word, pause, then spell it (single utterance). */
export async function sayThenSpell(word: string): Promise<void> {
  dbg(`sayThenSpell("${word}")`);
  const spelled = word.split('').join(', ');
  await ttsSpeak(`${word},,,, ${spelled}`, 1);
}

/** True when the browser supports speech synthesis. */
export function isTtsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

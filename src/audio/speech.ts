// src/audio/speech.ts — TTS for Chrome PWA on Android.  Uses only the Web
// Speech API with robust retry logic (exponential backoff, voice fallback).

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
 * Build a list of strategies to try.  Each one varies the voice and/or lang
 * attribute to work around different failure modes:
 *
 *   1-3. English voices (en_US, en_GB, en_AU) with lang='en-US'
 *   4.   Device default voice with lang='en-US' — some engines can speak any
 *        language with any voice; the default voice may have a working synth
 *        pipeline even when English-specific ones are broken.
 *   5.   Bare-minimum utterance — no voice, no lang.  Lets the engine pick
 *        everything itself.  Works around Chrome bugs where setting lang
 *        triggers a broken code path.
 */
function buildStrategies(): SpeakStrategy[] {
  const englishVoices = getEnglishVoices();
  const strategies: SpeakStrategy[] = [];

  // English voices with lang='en-US' (up to 3).
  for (const v of englishVoices.slice(0, 3)) {
    strategies.push({ voice: v, lang: 'en-US', label: `${v.name} + lang=en-US` });
  }

  // Device default voice with lang='en-US'.  On Android, the default voice
  // (e.g. Assamese) may still be able to synthesise English text — the lang
  // attribute tells the engine what language the text is in.
  const allVoices = typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis.getVoices()
    : [];
  const defaultVoice = allVoices.find((v) => v.default) ?? allVoices[0] ?? null;
  if (defaultVoice && !englishVoices.includes(defaultVoice)) {
    strategies.push({
      voice: defaultVoice,
      lang: 'en-US',
      label: `default voice (${defaultVoice.name}) + lang=en-US`,
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
async function ttsSpeak(text: string, rate: number): Promise<boolean> {
  // Respect cooldown after repeated failures.
  if (Date.now() < cooldownUntil) {
    dbg('ttsSpeak() skipped — cooling down', {
      remainingMs: cooldownUntil - Date.now(),
    });
    return false;
  }

  const strategies = buildStrategies();
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

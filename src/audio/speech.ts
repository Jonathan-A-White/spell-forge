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

// Cache the best English voice once found.  Null means "not yet resolved",
// undefined means "no suitable voice found — use browser default".
let cachedEnglishVoice: SpeechSynthesisVoice | undefined | null = null;

/**
 * Pick the best English voice from the available set.
 * Preference order: en_US > en_GB > en_AU > en_IN > any en_*.
 * Returns undefined if no English voice is available.
 */
function pickEnglishVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return undefined;

  // Normalise lang tags: "en_US" and "en-US" both occur.
  const english = voices.filter((v) => /^en[-_]/i.test(v.lang));
  if (english.length === 0) return undefined;

  // Rank by preference.
  const rank = (v: SpeechSynthesisVoice): number => {
    const lang = v.lang.replace('_', '-').toLowerCase();
    if (lang.startsWith('en-us')) return 0;
    if (lang.startsWith('en-gb')) return 1;
    if (lang.startsWith('en-au')) return 2;
    return 3;
  };

  english.sort((a, b) => rank(a) - rank(b));
  return english[0];
}

function resolveVoice(): SpeechSynthesisVoice | undefined {
  if (cachedEnglishVoice !== null) return cachedEnglishVoice;
  const voice = pickEnglishVoice();
  cachedEnglishVoice = voice;
  if (voice) {
    dbg('Selected English voice', { name: voice.name, lang: voice.lang });
  } else {
    dbg('No English voice found — using browser default');
  }
  return voice;
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
    // Re-resolve voice when the list changes (voices load async on Android).
    cachedEnglishVoice = null;
    resolveVoice();
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
 * @param clearFirst — cancel any stuck state before speaking (used on retries)
 * @param voiceOverride — explicit voice to use (undefined = browser default)
 */
function trySpeak(
  text: string,
  rate: number,
  clearFirst = false,
  voiceOverride?: SpeechSynthesisVoice | null,
): Promise<boolean> {
  const synth = window.speechSynthesis;

  if (clearFirst) {
    synth.cancel();
  }

  dbg('trySpeak()', {
    text: text.slice(0, 60),
    rate,
    clearFirst,
    speaking: synth.speaking,
    pending: synth.pending,
    paused: synth.paused,
  });

  // resume() recovers from Chrome's silent-pause (screen off / tab switch).
  synth.resume();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;

  // Use the provided voice override.  When voiceOverride is explicitly null
  // we intentionally skip setting a voice (browser default).  When undefined
  // we auto-resolve.
  if (voiceOverride === undefined) {
    const voice = resolveVoice();
    if (voice) utterance.voice = voice;
  } else if (voiceOverride !== null) {
    utterance.voice = voiceOverride;
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
 * Try TTS with up to MAX_ATTEMPTS retries and exponential backoff.
 *
 * Strategy:
 *   1. First attempt with the resolved English voice, no cancel.
 *   2. Subsequent attempts cancel stuck state, wait with exponential backoff,
 *      then retry.
 *   3. Final attempt falls back to browser-default voice (no explicit voice)
 *      in case the selected voice itself is broken.
 *
 * On total failure a short cooldown is set so callers can back off instead of
 * hammering a broken engine.  The cooldown is reset on success.
 */
async function ttsSpeak(text: string, rate: number): Promise<boolean> {
  // Respect cooldown after repeated failures.
  if (Date.now() < cooldownUntil) {
    dbg('ttsSpeak() skipped — cooling down', {
      remainingMs: cooldownUntil - Date.now(),
    });
    return false;
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isLast = attempt === MAX_ATTEMPTS;
    // On the last attempt, fall back to browser-default voice (null = skip
    // explicit voice assignment) in case the selected voice is the problem.
    const voiceOverride = isLast ? null : undefined;

    dbg(`ttsSpeak() attempt ${attempt}/${MAX_ATTEMPTS}`);
    const ok = await trySpeak(text, rate, attempt > 1, voiceOverride);

    if (ok) {
      consecutiveFailures = 0;
      cooldownUntil = 0;
      return true;
    }

    if (!isLast) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      dbg(`ttsSpeak() attempt ${attempt} failed — retrying after ${delay}ms`);
      await new Promise<void>((r) => setTimeout(r, delay));
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
 */
export function warmUp(): void {
  if (warmedUp) {
    dbg('warmUp() already done — skipping');
    return;
  }
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    dbg('warmUp() speechSynthesis not available');
    return;
  }

  warmedUp = true;
  const synth = window.speechSynthesis;
  dbg('warmUp() priming TTS engine');
  synth.cancel();
  logVoices();
  // Speak a short word so the engine is truly initialised.  An empty string
  // or volume=0 may be silently ignored by some Android TTS engines.
  const primer = new SpeechSynthesisUtterance('.');
  primer.volume = 0.01; // nearly silent but not zero
  const voice = resolveVoice();
  if (voice) primer.voice = voice;
  synth.speak(primer);
  dbg('warmUp() done', { speaking: synth.speaking, pending: synth.pending });
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

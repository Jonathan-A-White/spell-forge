// src/audio/speech.ts — TTS for Chrome PWA on Android, with dictionary API
// fallback.  Every public function first attempts the Web Speech API.  If TTS
// fails (common on some Android devices), it falls back to fetching
// pronunciation audio from the Free Dictionary API.

import { playFromDictionary } from './dictionary-provider.ts';

const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 150;

// ─── Debug logging ──────────────────────────────────────────

function dbg(msg: string, data?: Record<string, unknown>): void {
  const ts = new Date().toISOString().slice(11, 23);
  const extra = data ? ' ' + JSON.stringify(data) : '';
  console.log(`[TTS ${ts}] ${msg}${extra}`);
}

// ─── Voice helpers ──────────────────────────────────────────

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
  };
  // Also try eagerly — voices may already be available.
  logVoices();
}

// ─── TTS engine status ──────────────────────────────────────

// Track whether TTS has ever succeeded.  Once we know the engine is broken
// we skip it entirely and go straight to the dictionary fallback.
let ttsKnownBroken = false;

// ─── Core TTS speak ─────────────────────────────────────────

/**
 * Attempt to speak via Web Speech API.  Returns true if onend fired
 * (success), false if onerror/timeout fired.
 */
function trySpeak(text: string, rate: number): Promise<boolean> {
  const synth = window.speechSynthesis;

  dbg('trySpeak()', {
    text: text.slice(0, 60),
    rate,
    speaking: synth.speaking,
    pending: synth.pending,
    paused: synth.paused,
  });

  // resume() recovers from Chrome's silent-pause (screen off / tab switch).
  synth.resume();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;

  // Do NOT set utterance.voice — let the OS/browser pick its default voice.
  // On Chrome Android, forcing a voice from getVoices() can cause
  // "synthesis-failed" if that voice isn't actually usable on the device.

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
 * Try TTS with one automatic retry.  Returns true if audio played.
 */
async function ttsSpeak(text: string, rate: number): Promise<boolean> {
  if (ttsKnownBroken) {
    dbg('ttsSpeak() skipped — TTS known broken');
    return false;
  }

  dbg('ttsSpeak() attempt 1');
  const ok = await trySpeak(text, rate);
  if (ok) return true;

  // Retry: cancel any stuck state, short delay, then try again.
  dbg('ttsSpeak() attempt 1 failed — retrying after cancel + delay');
  const synth = window.speechSynthesis;
  synth.cancel();
  await new Promise<void>((r) => setTimeout(r, RETRY_DELAY_MS));

  dbg('ttsSpeak() attempt 2');
  const ok2 = await trySpeak(text, rate);
  if (ok2) return true;

  dbg('ttsSpeak() both attempts failed — marking TTS as broken');
  ttsKnownBroken = true;
  return false;
}

// ─── Speak with dictionary fallback ─────────────────────────

/**
 * Speak a word, falling back to the dictionary API if TTS fails.
 * The `word` param is the plain word (for dictionary lookup).
 * The `ttsText` param is what to send to TTS (may include spelling).
 */
async function speakWithFallback(
  word: string,
  ttsText: string,
  rate = 1,
): Promise<void> {
  const ok = await ttsSpeak(ttsText, rate);
  if (ok) return;

  // Dictionary API fallback — can only pronounce whole words, not spelling.
  dbg('Falling back to dictionary audio', { word });
  const played = await playFromDictionary(word);
  if (!played) {
    dbg('Dictionary fallback also failed', { word });
  }
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
  synth.speak(primer);
  dbg('warmUp() done', { speaking: synth.speaking, pending: synth.pending });
}

// ─── Public API ─────────────────────────────────────────────

/** Say a word out loud. */
export function sayWord(word: string): Promise<void> {
  dbg(`sayWord("${word}")`);
  return speakWithFallback(word, word);
}

/** Say a word slowly (0.6× speed). */
export function sayWordSlowly(word: string): Promise<void> {
  dbg(`sayWordSlowly("${word}")`);
  return speakWithFallback(word, word, 0.6);
}

/** Spell a word letter-by-letter (single utterance, commas create pauses). */
export function spellWord(word: string): Promise<void> {
  dbg(`spellWord("${word}")`);
  const spelled = word.split('').join(', ');
  // Dictionary audio can't spell — but at least say the word as fallback.
  return speakWithFallback(word, spelled);
}

/** Say the word, pause, then spell it (single utterance). */
export function sayThenSpell(word: string): Promise<void> {
  dbg(`sayThenSpell("${word}")`);
  const spelled = word.split('').join(', ');
  // Dictionary fallback will just say the word (no spelling).
  return speakWithFallback(word, `${word},,,, ${spelled}`);
}

/** True when the browser supports speech synthesis. */
export function isTtsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

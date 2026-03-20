// src/audio/speech.ts — Minimal TTS for Chrome PWA on Android.
// Every public function builds a text string and makes ONE synth.speak()
// call synchronously from the user gesture so Chrome doesn't block it.

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

// ─── Core speak() ───────────────────────────────────────────

/**
 * Attempt to speak. Returns true if onend fired (success), false if
 * onerror/timeout fired.
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
 * Speak text with one automatic retry.  On the first attempt we call
 * speak() synchronously in the user-gesture call stack.  If that fails
 * with synthesis-failed, we cancel(), wait a short delay, and retry.
 * The retry is outside the gesture context but Chrome typically allows
 * it after a successful warm-up.
 */
async function speak(text: string, rate = 1): Promise<void> {
  dbg('speak() attempt 1');
  const ok = await trySpeak(text, rate);
  if (ok) return;

  // Retry: cancel any stuck state, short delay, then try again.
  dbg('speak() attempt 1 failed — retrying after cancel + delay');
  const synth = window.speechSynthesis;
  synth.cancel();
  await new Promise<void>((r) => setTimeout(r, RETRY_DELAY_MS));

  dbg('speak() attempt 2');
  const ok2 = await trySpeak(text, rate);
  if (!ok2) {
    dbg('speak() attempt 2 also failed — giving up');
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
  primer.volume = 0.01;   // nearly silent but not zero
  synth.speak(primer);
  dbg('warmUp() done', { speaking: synth.speaking, pending: synth.pending });
}

// ─── Public API ─────────────────────────────────────────────

/** Say a word out loud. */
export function sayWord(word: string): Promise<void> {
  dbg(`sayWord("${word}")`);
  return speak(word);
}

/** Say a word slowly (0.6× speed). */
export function sayWordSlowly(word: string): Promise<void> {
  dbg(`sayWordSlowly("${word}")`);
  return speak(word, 0.6);
}

/** Spell a word letter-by-letter (single utterance, commas create pauses). */
export function spellWord(word: string): Promise<void> {
  dbg(`spellWord("${word}")`);
  const spelled = word.split('').join(', ');
  return speak(spelled);
}

/** Say the word, pause, then spell it (single utterance). */
export function sayThenSpell(word: string): Promise<void> {
  dbg(`sayThenSpell("${word}")`);
  const spelled = word.split('').join(', ');
  return speak(`${word},,,, ${spelled}`);
}

/** True when the browser supports speech synthesis. */
export function isTtsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// src/audio/speech.ts — Minimal TTS for Chrome PWA on Android.
// Every public function builds a text string and makes ONE synth.speak()
// call synchronously from the user gesture so Chrome doesn't block it.

const TIMEOUT_MS = 10_000;

// ─── Debug logging ──────────────────────────────────────────

function dbg(msg: string, data?: Record<string, unknown>): void {
  const ts = new Date().toISOString().slice(11, 23);
  const extra = data ? ' ' + JSON.stringify(data) : '';
  console.log(`[TTS ${ts}] ${msg}${extra}`);
}

// ─── Voice caching ──────────────────────────────────────────

let cachedVoice: SpeechSynthesisVoice | null = null;
function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  dbg('pickVoice()', { voiceCount: voices.length, sampleVoices: voices.slice(0, 5).map((v) => `${v.name} (${v.lang})`) });
  if (voices.length === 0) return null;
  // Prefer an English voice; fall back to whatever is first.
  cachedVoice = voices.find((v) => v.lang.startsWith('en')) ?? voices[0];
  dbg('pickVoice() selected', { name: cachedVoice.name, lang: cachedVoice.lang });
  return cachedVoice;
}

// Listen for voices to load asynchronously (Chrome Android fires this late).
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  dbg('Registering onvoiceschanged listener');
  window.speechSynthesis.onvoiceschanged = () => {
    dbg('voiceschanged fired');
    cachedVoice = null; // reset so pickVoice() re-selects
    pickVoice();
  };
  // Also try eagerly — voices may already be available.
  const earlyVoices = window.speechSynthesis.getVoices();
  dbg('Early voice check', { count: earlyVoices.length });
}

// ─── Core speak() ───────────────────────────────────────────

function speak(text: string, rate = 1): Promise<void> {
  const synth = window.speechSynthesis;

  dbg('speak() called', {
    text: text.slice(0, 60),
    rate,
    synthAvailable: !!synth,
    speaking: synth.speaking,
    pending: synth.pending,
    paused: synth.paused,
  });

  // Do NOT call cancel() here — on Chrome Android, cancel() + speak() in
  // the same tick causes "synthesis-failed".  The warmUp() call on first
  // user interaction handles stuck-queue cleanup instead.

  // resume() recovers from Chrome's silent-pause (screen off / tab switch).
  synth.resume();
  dbg('speak() after resume()', { speaking: synth.speaking, pending: synth.pending });

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;

  // Explicitly set a voice — Chrome Android sometimes silently fails
  // when no voice is set and voices loaded asynchronously.
  const voice = pickVoice();
  if (voice) {
    utterance.voice = voice;
    dbg('speak() voice set', { name: voice.name, lang: voice.lang });
  } else {
    dbg('speak() WARNING: no voice available — using browser default');
  }

  return new Promise<void>((resolve) => {
    let done = false;

    const finish = (reason: string) => {
      if (!done) {
        done = true;
        clearTimeout(timeout);
        dbg(`speak() finished — ${reason}`, {
          speaking: synth.speaking,
          pending: synth.pending,
        });
        resolve();
      }
    };

    const timeout = setTimeout(() => finish('timeout'), TIMEOUT_MS);

    utterance.onend = () => finish('onend');

    utterance.onerror = (ev) => {
      dbg('speak() onerror fired', { error: (ev as SpeechSynthesisErrorEvent).error ?? 'unknown' });
      finish('onerror');
    };

    // speak() must be synchronous in the user-gesture call stack.
    // Do NOT wrap in setTimeout — Chrome Android blocks non-gesture speech.
    synth.speak(utterance);
    dbg('speak() synth.speak() returned', {
      speaking: synth.speaking,
      pending: synth.pending,
    });
  });
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
  // Clear any stuck utterances from a previous session.
  synth.cancel();
  // Force voice enumeration.
  pickVoice();
  // Speak a truly silent utterance so the engine is unlocked for later calls.
  // The cancel() above is safe here because the silent utterance is just for
  // priming — the real speak() calls happen later in separate user gestures.
  const silent = new SpeechSynthesisUtterance('');
  silent.volume = 0;
  synth.speak(silent);
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

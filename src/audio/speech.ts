// src/audio/speech.ts — Minimal TTS for Chrome PWA on Android.
// Every public function builds a text string and makes ONE synth.speak()
// call synchronously from the user gesture so Chrome doesn't block it.

const TIMEOUT_MS = 10_000;

// ─── Voice caching ──────────────────────────────────────────

let cachedVoice: SpeechSynthesisVoice | null = null;
function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  if (voices.length === 0) return null;
  // Prefer an English voice; fall back to whatever is first.
  cachedVoice = voices.find((v) => v.lang.startsWith('en')) ?? voices[0];
  return cachedVoice;
}

// Listen for voices to load asynchronously (Chrome Android fires this late).
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null; // reset so pickVoice() re-selects
    pickVoice();
  };
}

// ─── Core speak() ───────────────────────────────────────────

function speak(text: string, rate = 1): Promise<void> {
  const synth = window.speechSynthesis;

  // Cancel any stuck utterances sitting in the queue.  Without this,
  // a prior utterance that never fired "end" blocks all future speech.
  synth.cancel();

  // resume() recovers from Chrome's silent-pause (screen off / tab switch).
  synth.resume();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;

  // Explicitly set a voice — Chrome Android sometimes silently fails
  // when no voice is set and voices loaded asynchronously.
  const voice = pickVoice();
  if (voice) utterance.voice = voice;

  return new Promise<void>((resolve) => {
    let done = false;

    const finish = () => {
      if (!done) {
        done = true;
        clearTimeout(timeout);
        resolve();
      }
    };

    const timeout = setTimeout(finish, TIMEOUT_MS);
    utterance.onend = finish;
    utterance.onerror = finish;

    // speak() must be synchronous in the user-gesture call stack.
    // Do NOT wrap in setTimeout — Chrome Android blocks non-gesture speech.
    synth.speak(utterance);
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
  if (warmedUp) return;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  warmedUp = true;
  const synth = window.speechSynthesis;
  // Force voice enumeration.
  pickVoice();
  // Speak a truly silent utterance so the engine is unlocked for later calls.
  const silent = new SpeechSynthesisUtterance('');
  silent.volume = 0;
  synth.speak(silent);
}

// ─── Public API ─────────────────────────────────────────────

/** Say a word out loud. */
export function sayWord(word: string): Promise<void> {
  return speak(word);
}

/** Say a word slowly (0.6× speed). */
export function sayWordSlowly(word: string): Promise<void> {
  return speak(word, 0.6);
}

/** Spell a word letter-by-letter (single utterance, commas create pauses). */
export function spellWord(word: string): Promise<void> {
  const spelled = word.split('').join(', ');
  return speak(spelled);
}

/** Say the word, pause, then spell it (single utterance). */
export function sayThenSpell(word: string): Promise<void> {
  const spelled = word.split('').join(', ');
  return speak(`${word},,,, ${spelled}`);
}

/** True when the browser supports speech synthesis. */
export function isTtsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

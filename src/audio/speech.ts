// src/audio/speech.ts — Minimal TTS for Chrome PWA on Android.
// Every public function builds a text string and makes ONE synth.speak()
// call synchronously from the user gesture so Chrome doesn't block it.

const TIMEOUT_MS = 10_000;

function speak(text: string, rate = 1): Promise<void> {
  const synth = window.speechSynthesis;

  // resume() recovers from Chrome's silent-pause (screen off / tab switch).
  synth.resume();

  // Speak synchronously — no setTimeout, no cancel().  setTimeout would
  // move speak() out of the user-gesture call stack and Chrome Android
  // would block it.  cancel() before speak() causes the new utterance to
  // be immediately cancelled on modern Chrome.
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;

  return new Promise<void>((resolve) => {
    let done = false;

    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        resolve();
      }
    }, TIMEOUT_MS);

    utterance.onend = () => {
      if (!done) {
        done = true;
        clearTimeout(timeout);
        resolve();
      }
    };

    utterance.onerror = () => {
      if (!done) {
        done = true;
        clearTimeout(timeout);
        resolve();
      }
    };

    synth.speak(utterance);
  });
}

// ─── Public API ──────────────────────────────────────────────

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

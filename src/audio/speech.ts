// src/audio/speech.ts — Minimal TTS for Chrome PWA on Android.
// One speak function, no cancel/resume gymnastics.

const TIMEOUT_MS = 5_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Speak a piece of text.  Returns when the utterance finishes. */
function speak(text: string, rate = 1): Promise<void> {
  const synth = window.speechSynthesis;

  return new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;

    let done = false;

    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        synth.cancel();
        resolve(); // treat timeout as silent success so spelling continues
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
        resolve(); // swallow errors so spelling continues
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

/** Spell a word letter-by-letter. */
export async function spellWord(word: string, delayMs = 400): Promise<void> {
  for (const letter of word) {
    await speak(letter);
    await delay(delayMs);
  }
}

/** Say the word, pause, then spell it. */
export async function sayThenSpell(
  word: string,
  gapMs = 300,
  letterDelayMs = 400,
): Promise<void> {
  await sayWord(word);
  await delay(gapMs);
  await spellWord(word, letterDelayMs);
}

/** True when the browser supports speech synthesis. */
export function isTtsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

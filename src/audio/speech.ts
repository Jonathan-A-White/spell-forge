// src/audio/speech.ts — Single TTS module.  Every utterance goes through
// `speakText` so the same voice and Chrome-Android workarounds are used
// everywhere.

/** Max time (ms) to wait for an utterance before treating it as a silent failure. */
const TIMEOUT_MS = 5_000;

/**
 * Delay (ms) after cancel() before the next speak() — Chrome Android drops
 * the new utterance if speak() fires synchronously after cancel().
 */
const SETTLE_MS = 50;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Low-level: speak a single piece of text.
 *
 * @param text        The text to speak (a word or a single letter).
 * @param rate        Speech rate (1 = normal, 0.6 = slow).
 * @param forceCancel When true, always call synth.cancel() first (needed
 *                    for the first utterance after user interaction to
 *                    clear Chrome Android's stuck queue).  When false,
 *                    cancel only if synth is actively speaking/pending
 *                    (avoids dropping short utterances in a sequence).
 */
function speakText(
  text: string,
  rate: number,
  forceCancel: boolean,
): Promise<void> {
  const synth = window.speechSynthesis;

  // Recover from Chrome Android's silent pause state (screen off / tab switch).
  synth.resume();

  const needsCancel = forceCancel || synth.speaking || synth.pending;
  if (needsCancel) {
    synth.cancel();
  }

  return new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;

      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          synth.cancel();
          reject(new Error('Speech synthesis timed out'));
        }
      }, TIMEOUT_MS);

      utterance.onend = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve();
        }
      };
      utterance.onerror = (event) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`Speech synthesis error: ${event.error}`));
        }
      };

      synth.speak(utterance);
    }, needsCancel ? SETTLE_MS : 0);
  });
}

// ─── Public API ──────────────────────────────────────────────

/** Say a word out loud at normal speed. */
export function sayWord(word: string): Promise<void> {
  return speakText(word, 1, true);
}

/** Say a word out loud at a slower speed (0.6×). */
export function sayWordSlowly(word: string): Promise<void> {
  return speakText(word, 0.6, true);
}

/**
 * Spell a word letter-by-letter.  Each letter is spoken using the same
 * voice as `sayWord`.  Uses conditional cancel between letters so Chrome
 * Android doesn't drop short utterances.
 */
export async function spellWord(
  word: string,
  delayMs = 400,
): Promise<void> {
  const letters = word.split('');
  for (let i = 0; i < letters.length; i++) {
    // First letter uses force-cancel to clear any leftover queue.
    // Subsequent letters use conditional cancel only.
    await speakText(letters[i], 1, i === 0);
    if (i < letters.length - 1) {
      await delay(delayMs);
    }
  }
}

/** Say the word, pause, then spell it letter-by-letter. */
export async function sayThenSpell(
  word: string,
  gapMs = 300,
  letterDelayMs = 400,
): Promise<void> {
  await sayWord(word);
  await delay(gapMs);
  await spellWord(word, letterDelayMs);
}

/** Returns true when the browser supports speech synthesis. */
export function isTtsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

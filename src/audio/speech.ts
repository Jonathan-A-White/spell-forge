// src/audio/speech.ts — Minimal TTS for Chrome PWA on Android.
// Every public function builds a text string and makes ONE synth.speak()
// call, avoiding all multi-utterance queuing issues.

const TIMEOUT_MS = 10_000;

/** Single speak call.  cancel() clears stuck Chrome queue, resume()
 *  recovers from Chrome's silent-pause state. */
function speak(text: string, rate = 1): Promise<void> {
  const synth = window.speechSynthesis;
  synth.resume();
  synth.cancel();

  return new Promise<void>((resolve) => {
    // Short delay after cancel — Chrome Android drops speak() if it
    // fires synchronously after cancel().
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;

      let done = false;

      const timeout = setTimeout(() => {
        if (!done) {
          done = true;
          synth.cancel();
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
    }, 50);
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

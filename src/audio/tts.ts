import type { AudioProvider } from '../contracts/types.ts';

// Heuristic: voice names containing these words tend to be male voices.
const maleHints = [
  '\\bmale\\b', '\\bman\\b',
  'daniel', 'james', '\\balex\\b', '\\btom\\b', 'fred', 'rishi',
  'david', '\\bmark\\b', '\\bguy\\b', 'ryan',
  'google.*\\bmale\\b',
];

/** Resolved voice, cached so every utterance uses the same voice. */
let cachedVoice: SpeechSynthesisVoice | null | undefined;

/** Clear the voice cache (exposed for testing). */
export function clearVoiceCache(): void {
  cachedVoice = undefined;
}

/** Clear the cache when the browser finishes loading voices (Chrome loads them async). */
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    cachedVoice = undefined;
  });
}

/**
 * Pick a male SpeechSynthesisVoice.
 * Falls back to the first English voice, then null (browser default).
 */
function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  const english = voices.filter((v) => v.lang.startsWith('en'));
  const pool = english.length > 0 ? english : voices;

  const match = pool.find((v) => {
    const name = v.name.toLowerCase();
    return maleHints.some((h) => new RegExp(h).test(name));
  });

  const selected = match ?? pool[0] ?? null;
  cachedVoice = selected;
  return selected;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Max time (ms) to wait for an utterance before treating it as a silent failure. */
const SPEAK_TIMEOUT_MS = 5_000;

/**
 * Delay (ms) between cancel() and speak() — Chrome Android drops the new
 * utterance if speak() is called synchronously after cancel().
 */
const CANCEL_SETTLE_MS = 50;

function speakWithRate(word: string, rate: number): Promise<void> {
  const synth = window.speechSynthesis;

  // Chrome Android sometimes silently pauses synthesis (e.g. after screen
  // off or tab switch).  resume() is a no-op when not paused.
  synth.resume();

  // Always cancel before speaking — Chrome Android can silently drop new
  // utterances even when synth.speaking and synth.pending both report false
  // (stuck internal queue). Unconditional cancel + settle delay fixes this.
  synth.cancel();

  return new Promise<void>((resolve, reject) => {
    const startDelay = CANCEL_SETTLE_MS;

    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.rate = rate;

      const voice = pickVoice();
      if (voice) {
        utterance.voice = voice;
      }

      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          synth.cancel();
          reject(new Error('Speech synthesis timed out'));
        }
      }, SPEAK_TIMEOUT_MS);

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
    }, startDelay);
  });
}

/**
 * Speak a short chunk (single letter) without calling cancel() first.
 * Used inside speakChunks where cancel is done once before the loop.
 */
function speakChunkDirect(word: string): Promise<void> {
  const synth = window.speechSynthesis;
  synth.resume();

  return new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.rate = 1;

    const voice = pickVoice();
    if (voice) {
      utterance.voice = voice;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        synth.cancel();
        reject(new Error('Speech synthesis timed out'));
      }
    }, SPEAK_TIMEOUT_MS);

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
  });
}

export class TtsProvider implements AudioProvider {
  readonly priority = 10;

  speak(word: string): Promise<void> {
    return speakWithRate(word, 1);
  }

  speakSlowly(word: string): Promise<void> {
    return speakWithRate(word, 0.6);
  }

  async speakChunks(chunks: string[], delayMs = 500): Promise<void> {
    const synth = window.speechSynthesis;

    // Cancel once at the start so previous audio stops, then speak each
    // chunk without the per-utterance cancel+settle that drops short
    // utterances on Chrome Android.
    synth.resume();
    synth.cancel();
    await delay(CANCEL_SETTLE_MS);

    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) {
        await delay(delayMs);
      }
      await speakChunkDirect(chunks[i]);
    }
  }

  isAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }
}

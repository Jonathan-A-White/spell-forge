import type { AudioProvider } from '../contracts/types.ts';

// Heuristic: voice names containing these words tend to be male voices.
const maleHints = [
  '\\bmale\\b', '\\bman\\b',
  'daniel', 'james', '\\balex\\b', '\\btom\\b', 'fred', 'rishi',
  'david', '\\bmark\\b', '\\bguy\\b', 'ryan',
  'google.*\\bmale\\b',
];

/** Resolved male voice, cached so every utterance uses the same voice. */
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

/** How long to wait for speechSynthesis before assuming it silently failed (e.g. Kindle Silk). */
const SPEAK_TIMEOUT_MS = 5000;

function speakWord(word: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const synth = window.speechSynthesis;

    // Some browsers (Kindle Silk) have speechSynthesis but no working voices.
    // Cancel any queued speech first to avoid stale utterances.
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(word);
    const voice = pickVoice();
    if (voice) {
      utterance.voice = voice;
    }

    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        fn();
      }
    };

    // Timeout: if neither onend nor onerror fires, the browser silently failed.
    const timer = window.setTimeout(() => {
      settle(() => reject(new Error('Speech synthesis timed out')));
    }, SPEAK_TIMEOUT_MS);

    utterance.onend = () => settle(resolve);
    utterance.onerror = (event) =>
      settle(() => reject(new Error(`Speech synthesis error: ${event.error}`)));

    synth.speak(utterance);
  });
}

/**
 * Queue all letter utterances up-front and let the browser's native speech
 * queue play them in order.  This avoids the speak→wait→speak cycle that
 * causes Kindle Silk to silently drop every letter after the first.
 *
 * The promise resolves when the **last** queued utterance finishes.
 */
function speakQueued(texts: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const synth = window.speechSynthesis;
    synth.cancel();

    const voice = pickVoice();

    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        fn();
      }
    };

    // Generous timeout: 3 seconds per queued item.
    const timer = window.setTimeout(() => {
      settle(() => reject(new Error('Speech synthesis timed out')));
    }, texts.length * 3000);

    for (let i = 0; i < texts.length; i++) {
      const utterance = new SpeechSynthesisUtterance(texts[i]);
      if (voice) {
        utterance.voice = voice;
      }

      if (i === texts.length - 1) {
        // Resolve/reject only on the last utterance.
        utterance.onend = () => settle(resolve);
        utterance.onerror = (event) =>
          settle(() => reject(new Error(`Speech synthesis error: ${event.error}`)));
      }

      synth.speak(utterance);
    }
  });
}

export class TtsProvider implements AudioProvider {
  readonly priority = 1;

  speak(word: string): Promise<void> {
    return speakWord(word);
  }

  speakSlowly(word: string): Promise<void> {
    return speakWord(word);
  }

  async speakChunks(chunks: string[]): Promise<void> {
    // Queue all chunks at once and let the browser's native speech queue
    // play them sequentially.  This avoids the speak→wait→speak cycle
    // that Kindle Silk silently breaks on after the first utterance.
    // Use uppercase for single chars so TTS reads them as letter names.
    const texts = chunks.map((c) =>
      c.length === 1 ? c.toUpperCase() : c,
    );
    await speakQueued(texts);
  }

  isAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }
}

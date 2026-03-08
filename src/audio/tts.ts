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

function speakWithRate(word: string, rate: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.rate = rate;

    const voice = pickVoice();
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => resolve();
    utterance.onerror = (event) => reject(new Error(`Speech synthesis error: ${event.error}`));
    synth.speak(utterance);
  });
}

export class TtsProvider implements AudioProvider {
  readonly priority = 1;

  speak(word: string): Promise<void> {
    return speakWithRate(word, 1);
  }

  speakSlowly(word: string): Promise<void> {
    return speakWithRate(word, 0.6);
  }

  async speakChunks(chunks: string[], delayMs = 500): Promise<void> {
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) {
        await delay(delayMs);
      }
      await this.speak(chunks[i]);
    }
  }

  isAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }
}

import type { AudioProvider } from '../contracts/types.ts';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

/**
 * Phonetic letter names — real words that any TTS engine can pronounce.
 * Kindle Silk's TTS silently fails on single-character utterances, so we
 * spell words using the letter names as individual utterances instead.
 */
const LETTER_NAMES: Record<string, string> = {
  a: 'ay', b: 'bee', c: 'see', d: 'dee', e: 'ee', f: 'eff',
  g: 'jee', h: 'aitch', i: 'eye', j: 'jay', k: 'kay', l: 'ell',
  m: 'em', n: 'en', o: 'oh', p: 'pee', q: 'cue', r: 'are',
  s: 'ess', t: 'tee', u: 'you', v: 'vee', w: 'double-you',
  x: 'ex', y: 'why', z: 'zee',
};

/** How long to wait for speechSynthesis before assuming it silently failed (e.g. Kindle Silk). */
const SPEAK_TIMEOUT_MS = 5000;

interface SpeakOptions {
  /** Skip the synth.cancel() call — used between letters in a spelling sequence. */
  skipCancel?: boolean;
}

function speakWord(word: string, options: SpeakOptions = {}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const synth = window.speechSynthesis;

    // Some browsers (Kindle Silk) have speechSynthesis but no working voices.
    // Cancel any queued speech first — but skip between letters so Kindle's
    // slower TTS isn't interrupted mid-utterance.
    if (!options.skipCancel) {
      synth.cancel();
    }

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

export class TtsProvider implements AudioProvider {
  readonly priority = 1;

  speak(word: string): Promise<void> {
    return speakWord(word);
  }

  speakSlowly(word: string): Promise<void> {
    return speakWord(word);
  }

  async speakChunks(chunks: string[], delayMs = 500): Promise<void> {
    // Cancel once before the sequence, then skip cancel between letters
    // so Kindle Silk's slower TTS isn't interrupted mid-utterance.
    window.speechSynthesis.cancel();

    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) {
        await delay(delayMs);
      }
      // For single characters, use phonetic letter names (real words) so
      // TTS engines that silently fail on bare characters can still speak.
      const text = chunks[i].length === 1
        ? (LETTER_NAMES[chunks[i].toLowerCase()] ?? chunks[i])
        : chunks[i];
      await speakWord(text, { skipCancel: true });
    }
  }

  isAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }
}

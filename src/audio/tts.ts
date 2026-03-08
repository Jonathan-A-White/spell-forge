import type { AudioProvider } from '../contracts/types.ts';

export type VoiceGender = 'female' | 'male';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Heuristic: voice names containing these words tend to match the gender.
// Use word-boundary regex to avoid false positives (e.g. "Samantha" matching "man").
const femaleHints = [
  'female', 'woman',
  // macOS / iOS
  'samantha', 'karen', 'moira', 'fiona', 'victoria', 'tessa', 'kate',
  // Windows / Edge
  'zira', 'jenny', 'aria', 'sara',
  // Google TTS
  'google.*female',
];
const maleHints = [
  '\\bmale\\b', '\\bman\\b',
  // macOS / iOS
  'daniel', 'james', '\\balex\\b', '\\btom\\b', 'fred', 'rishi',
  // Windows / Edge
  'david', '\\bmark\\b', '\\bguy\\b', 'ryan',
  // Google TTS
  'google.*\\bmale\\b',
];

// Pitch adjustment so male and female sound distinct even when the same underlying
// voice is used (common on systems with only one available voice).
const PITCH: Record<VoiceGender, number> = { female: 1.1, male: 0.85 };

/** Cache of resolved voices keyed by gender so the same voice is used every time. */
const voiceCache = new Map<VoiceGender, SpeechSynthesisVoice>();

/** Clear the voice cache (exposed for testing). */
export function clearVoiceCache(): void {
  voiceCache.clear();
}

/** Clear the cache when the browser finishes loading voices (Chrome loads them async). */
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    voiceCache.clear();
  });
}

/**
 * Pick a SpeechSynthesisVoice that best matches the requested gender.
 * The result is cached so every utterance for a given gender uses the exact same voice.
 * Falls back to a voice not already assigned to the opposite gender, then to the
 * first English voice, then to null (browser default).
 */
function pickVoice(gender: VoiceGender): SpeechSynthesisVoice | null {
  const cached = voiceCache.get(gender);
  if (cached) return cached;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  // Prefer English voices
  const english = voices.filter((v) => v.lang.startsWith('en'));
  const pool = english.length > 0 ? english : voices;

  const hints = gender === 'female' ? femaleHints : maleHints;
  const match = pool.find((v) => {
    const name = v.name.toLowerCase();
    return hints.some((h) => new RegExp(h).test(name));
  });

  let selected = match ?? null;

  // When no heuristic match, pick a voice different from the opposite gender if possible.
  if (!selected) {
    const opposite: VoiceGender = gender === 'female' ? 'male' : 'female';
    const oppositeVoice = voiceCache.get(opposite);
    if (oppositeVoice) {
      selected = pool.find((v) => v !== oppositeVoice) ?? pool[0] ?? null;
    } else {
      selected = pool[0] ?? null;
    }
  }

  if (selected) {
    voiceCache.set(gender, selected);
  }
  return selected;
}

function speakWithRate(word: string, rate: number, gender: VoiceGender): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.rate = rate;
    utterance.pitch = PITCH[gender];
    const voice = pickVoice(gender);
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
  private gender: VoiceGender = 'female';

  setVoicePreference(gender: VoiceGender): void {
    this.gender = gender;
    // Clear cached voice for this gender so pickVoice re-evaluates with the
    // current voice list and avoids reusing a stale (wrong-gender) fallback.
    voiceCache.delete(gender);
  }

  speak(word: string): Promise<void> {
    return speakWithRate(word, 1, this.gender);
  }

  speakSlowly(word: string): Promise<void> {
    return speakWithRate(word, 0.6, this.gender);
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

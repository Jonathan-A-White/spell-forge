// src/audio/dictionary-provider.ts — Fallback audio provider that fetches
// pronunciation audio from the Free Dictionary API when TTS is unavailable.

const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en';
const CACHE_SIZE = 50;

function dbg(msg: string, data?: Record<string, unknown>): void {
  const ts = new Date().toISOString().slice(11, 23);
  const extra = data ? ' ' + JSON.stringify(data) : '';
  console.log(`[DictAudio ${ts}] ${msg}${extra}`);
}

// Simple LRU-ish cache: Map preserves insertion order, we evict oldest.
const audioUrlCache = new Map<string, string | null>();

function cacheSet(word: string, url: string | null): void {
  if (audioUrlCache.size >= CACHE_SIZE) {
    const oldest = audioUrlCache.keys().next().value;
    if (oldest !== undefined) audioUrlCache.delete(oldest);
  }
  audioUrlCache.set(word, url);
}

/**
 * Look up a word in the Free Dictionary API and return a pronunciation
 * audio URL (mp3), or null if not found.
 */
async function fetchAudioUrl(word: string): Promise<string | null> {
  const cached = audioUrlCache.get(word);
  if (cached !== undefined) {
    dbg('cache hit', { word, url: cached });
    return cached;
  }

  try {
    const resp = await fetch(`${API_BASE}/${encodeURIComponent(word.toLowerCase())}`);
    if (!resp.ok) {
      dbg('API returned error', { word, status: resp.status });
      cacheSet(word, null);
      return null;
    }

    const data = (await resp.json()) as Array<{
      phonetics?: Array<{ audio?: string }>;
    }>;

    // Find the first phonetic entry with a non-empty audio URL.
    for (const entry of data) {
      for (const phonetic of entry.phonetics ?? []) {
        if (phonetic.audio) {
          dbg('found audio URL', { word, url: phonetic.audio });
          cacheSet(word, phonetic.audio);
          return phonetic.audio;
        }
      }
    }

    dbg('no audio in API response', { word });
    cacheSet(word, null);
    return null;
  } catch (err) {
    dbg('fetch error', { word, error: String(err) });
    return null; // Don't cache network errors — they may be transient.
  }
}

/**
 * Play a word's pronunciation from the dictionary API.
 * Returns true if audio played successfully, false otherwise.
 */
export async function playFromDictionary(word: string): Promise<boolean> {
  dbg('playFromDictionary()', { word });

  const url = await fetchAudioUrl(word);
  if (!url) return false;

  try {
    const audio = new Audio(url);
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => {
        dbg('playback ended', { word });
        resolve();
      };
      audio.onerror = () => {
        dbg('playback error', { word });
        reject(new Error('playback-failed'));
      };
      audio.play().catch(reject);
    });
    return true;
  } catch (err) {
    dbg('play failed', { word, error: String(err) });
    return false;
  }
}

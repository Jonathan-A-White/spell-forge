import type { AudioProvider } from '../contracts/types.ts';

interface DictionaryEntry {
  phonetics: Array<{ audio?: string }>;
}

export class DictionaryProvider implements AudioProvider {
  readonly priority = 3;

  private cache = new Map<string, string>();
  private available = true;

  async speak(word: string): Promise<void> {
    const url = await this.getAudioUrl(word);
    if (!url) {
      throw new Error(`No dictionary audio found for "${word}"`);
    }
    await this.playUrl(url);
  }

  async speakSlowly(word: string): Promise<void> {
    const url = await this.getAudioUrl(word);
    if (!url) {
      throw new Error(`No dictionary audio found for "${word}"`);
    }
    await this.playUrl(url);
  }

  async speakChunks(chunks: string[], delayMs = 500): Promise<void> {
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      await this.speak(chunks[i]);
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  private async getAudioUrl(word: string): Promise<string | null> {
    const cached = this.cache.get(word);
    if (cached) return cached;

    try {
      const response = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      );
      if (!response.ok) return null;

      const data = (await response.json()) as DictionaryEntry[];
      const audioUrl = data[0]?.phonetics
        ?.map((p) => p.audio)
        .find((a) => a && a.length > 0);

      if (audioUrl) {
        this.cache.set(word, audioUrl);
        return audioUrl;
      }
      return null;
    } catch {
      this.available = false;
      return null;
    }
  }

  private playUrl(url: string, playbackRate = 1): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const audio = new Audio(url);
      audio.playbackRate = playbackRate;
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error(`Failed to play audio from ${url}`));
      audio.play().catch(reject);
    });
  }
}

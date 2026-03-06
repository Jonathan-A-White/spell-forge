import type { AudioProvider } from '../contracts/types.ts';

export interface AudioManager {
  speak(word: string): Promise<void>;
  speakSlowly(word: string): Promise<void>;
  speakChunks(chunks: string[], delayMs?: number): Promise<void>;
  registerProvider(provider: AudioProvider): void;
}

export class AudioManagerImpl implements AudioManager {
  private providers: AudioProvider[] = [];

  registerProvider(provider: AudioProvider): void {
    this.providers.push(provider);
    this.providers.sort((a, b) => b.priority - a.priority);
  }

  async speak(word: string): Promise<void> {
    await this.tryProviders((p) => p.speak(word));
  }

  async speakSlowly(word: string): Promise<void> {
    await this.tryProviders((p) => p.speakSlowly(word));
  }

  async speakChunks(chunks: string[], delayMs?: number): Promise<void> {
    await this.tryProviders((p) => p.speakChunks(chunks, delayMs));
  }

  private async tryProviders(
    action: (provider: AudioProvider) => Promise<void>,
  ): Promise<void> {
    for (const provider of this.providers) {
      if (!provider.isAvailable()) continue;
      try {
        await action(provider);
        return;
      } catch {
        // provider failed, try next
      }
    }
    console.warn('All audio providers failed or none available');
  }
}

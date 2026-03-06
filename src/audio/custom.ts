import type { AudioProvider } from '../contracts/types.ts';

export class CustomAudioProvider implements AudioProvider {
  readonly priority = 5;

  private recordings = new Map<string, Blob>();

  registerRecording(word: string, blob: Blob): void {
    this.recordings.set(word.toLowerCase(), blob);
  }

  removeRecording(word: string): void {
    this.recordings.delete(word.toLowerCase());
  }

  hasRecording(word: string): boolean {
    return this.recordings.has(word.toLowerCase());
  }

  async speak(word: string): Promise<void> {
    await this.playRecording(word);
  }

  async speakSlowly(word: string): Promise<void> {
    await this.playRecording(word, 0.6);
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
    return this.recordings.size > 0;
  }

  private playRecording(word: string, playbackRate = 1): Promise<void> {
    const blob = this.recordings.get(word.toLowerCase());
    if (!blob) {
      return Promise.reject(new Error(`No custom recording for "${word}"`));
    }

    const url = URL.createObjectURL(blob);
    return new Promise<void>((resolve, reject) => {
      const audio = new Audio(url);
      audio.playbackRate = playbackRate;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Failed to play custom recording for "${word}"`));
      };
      audio.play().catch((err) => {
        URL.revokeObjectURL(url);
        reject(err);
      });
    });
  }
}

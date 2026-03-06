import type { AudioProvider } from '../contracts/types.ts';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function speakWithRate(word: string, rate: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.rate = rate;
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

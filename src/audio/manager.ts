import type { AudioProvider } from '../contracts/types.ts';

export interface AudioManager {
  speak(word: string): Promise<void>;
  speakSlowly(word: string): Promise<void>;
  speakChunks(chunks: string[], delayMs?: number): Promise<void>;
  registerProvider(provider: AudioProvider): void;
  /** Returns true while a runExclusive block is executing. */
  isBusy(): boolean;
  /**
   * Run an async action exclusively — if audio is already playing the call
   * is silently skipped (returns false). Returns true when the action ran.
   */
  runExclusive(action: () => Promise<void>): Promise<boolean>;
  /** Subscribe to busy-state changes. Returns an unsubscribe function. */
  onBusyChange(cb: (busy: boolean) => void): () => void;
}

export class AudioManagerImpl implements AudioManager {
  private providers: AudioProvider[] = [];
  private busy = false;
  private busyListeners = new Set<(busy: boolean) => void>();

  registerProvider(provider: AudioProvider): void {
    this.providers.push(provider);
    this.providers.sort((a, b) => b.priority - a.priority);
  }

  isBusy(): boolean {
    return this.busy;
  }

  async runExclusive(action: () => Promise<void>): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.notifyBusy();
    try {
      await action();
    } finally {
      this.busy = false;
      this.notifyBusy();
    }
    return true;
  }

  onBusyChange(cb: (busy: boolean) => void): () => void {
    this.busyListeners.add(cb);
    return () => this.busyListeners.delete(cb);
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

  private notifyBusy(): void {
    for (const cb of this.busyListeners) cb(this.busy);
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

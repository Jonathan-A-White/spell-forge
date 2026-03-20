// src/audio/manager.ts — Thin wrapper that adds exclusive-execution (busy
// state) on top of the speech functions in speech.ts.

import { sayWord, sayWordSlowly, sayThenSpell, spellWord } from './speech.ts';

export interface AudioManager {
  sayWord(word: string): Promise<void>;
  sayWordSlowly(word: string): Promise<void>;
  spellWord(word: string, delayMs?: number): Promise<void>;
  sayThenSpell(word: string, gapMs?: number, letterDelayMs?: number): Promise<void>;
  isBusy(): boolean;
  runExclusive(action: () => Promise<void>): Promise<boolean>;
  onBusyChange(cb: (busy: boolean) => void): () => void;
}

export class AudioManagerImpl implements AudioManager {
  private busy = false;
  private busyListeners = new Set<(busy: boolean) => void>();

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

  sayWord(word: string): Promise<void> {
    return sayWord(word);
  }

  sayWordSlowly(word: string): Promise<void> {
    return sayWordSlowly(word);
  }

  spellWord(word: string, delayMs?: number): Promise<void> {
    return spellWord(word, delayMs);
  }

  sayThenSpell(word: string, gapMs?: number, letterDelayMs?: number): Promise<void> {
    return sayThenSpell(word, gapMs, letterDelayMs);
  }

  private notifyBusy(): void {
    for (const cb of this.busyListeners) cb(this.busy);
  }
}

// src/audio/manager.ts — Thin wrapper that adds exclusive-execution (busy
// state) on top of the speech functions in speech.ts.

import { sayWord, sayWordSlowly, sayThenSpell, spellWord } from './speech.ts';

const dbg = (msg: string) => console.log(`[AudioMgr] ${msg}`);

export interface AudioManager {
  sayWord(word: string): Promise<void>;
  sayWordSlowly(word: string): Promise<void>;
  spellWord(word: string): Promise<void>;
  sayThenSpell(word: string): Promise<void>;
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
    if (this.busy) {
      dbg('runExclusive() SKIPPED — already busy');
      return false;
    }
    dbg('runExclusive() starting');
    this.busy = true;
    this.notifyBusy();
    try {
      await action();
      dbg('runExclusive() action completed');
    } catch (err) {
      dbg(`runExclusive() action threw: ${err}`);
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

  spellWord(word: string): Promise<void> {
    return spellWord(word);
  }

  sayThenSpell(word: string): Promise<void> {
    return sayThenSpell(word);
  }

  private notifyBusy(): void {
    for (const cb of this.busyListeners) cb(this.busy);
  }
}

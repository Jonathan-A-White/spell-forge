// Spelling practice's single words: sayWord, sayWordSlowly, spellWord, sayThenSpell, warmUp and the retry logic behind them.
// The synthesiser is bsv-kit/testing's honest fake; an engine that sticks or errors is made by wrapping its speak().
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installSpeech, type SpeechFake } from 'bsv-kit/testing/speech';
import { AudioManagerImpl } from '../../src/audio/manager.ts';

let speech: SpeechFake;

beforeEach(async () => {
  speech = installSpeech(window);
  await new Promise((r) => setTimeout(r, 60)); // the phone lists its voices
});

afterEach(() => {
  speech.uninstall();
});

async function getSpeech() {
  vi.resetModules();
  return await import('../../src/audio/speech.ts');
}

describe('sayWord', () => {
  it('should speak a word via SpeechSynthesis', async () => {
    const { sayWord } = await getSpeech();
    await sayWord('hello');

    expect(speech.log).toHaveLength(1);
    expect(speech.log[0]).toMatchObject({ text: 'hello', rate: 1, outcome: 'ended' });
  });

  it('should NOT cancel before speak (Chrome Android synthesis-failed bug)', async () => {
    const cancel = vi.spyOn(speech.synth, 'cancel');
    const { sayWord } = await getSpeech();
    await sayWord('hello');
    expect(cancel).not.toHaveBeenCalled();
  });

  it('should speak slowly at reduced rate', async () => {
    const { sayWordSlowly } = await getSpeech();
    await sayWordSlowly('world');

    expect(speech.log).toHaveLength(1);
    expect(speech.log[0]).toMatchObject({ text: 'world', rate: 0.6 });
  });
});

describe('spellWord', () => {
  it('should build a single utterance with comma-separated letters', async () => {
    const { spellWord } = await getSpeech();
    await spellWord('cat');

    expect(speech.spoken()).toEqual(['c, a, t']);
  });
});

describe('sayThenSpell', () => {
  it('should build a single utterance with word then spelled letters', async () => {
    const { sayThenSpell } = await getSpeech();
    await sayThenSpell('hi');

    expect(speech.spoken()).toEqual(['hi,,,, h, i']);
  });
});

describe('long utterances (the tutor read-aloud)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('speaks once and never cancels when an utterance has started and runs 25 s before onend', async () => {
    const cancel = vi.spyOn(speech.synth, 'cancel');
    const { sayWord } = await getSpeech();
    let resolved = false;
    const p = sayWord(Array(400).fill('word').join(' ')).then(() => {
      resolved = true;
    }); // 400 words take 24.15 s

    await vi.advanceTimersByTimeAsync(24_000);
    expect(resolved).toBe(false);
    expect(speech.log).toHaveLength(1);
    expect(cancel).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_500);
    await p;
    expect(resolved).toBe(true);
    expect(speech.log).toHaveLength(1);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('still fails a started utterance that errors, and retries', async () => {
    const queue = speech.synth.speak.bind(speech.synth);
    let calls = 0;
    vi.spyOn(speech.synth, 'speak').mockImplementation((utterance) => {
      queue(utterance);
      calls += 1;
      if (calls === 1) setTimeout(() => speech.synth.cancel(), 100); // interrupted while speaking: onerror
    });
    const cancel = vi.spyOn(speech.synth, 'cancel');

    const { sayWord } = await getSpeech();
    const p = sayWord('hello');
    await vi.advanceTimersByTimeAsync(5_000);
    await p;
    expect(speech.log).toHaveLength(2);
    expect(speech.log.map((entry) => entry.outcome)).toEqual(['interrupted', 'ended']);
    expect(cancel).toHaveBeenCalled();
  });

  it('still times out an utterance that never starts, and retries with the next voice', async () => {
    const queue = speech.synth.speak.bind(speech.synth);
    let calls = 0;
    vi.spyOn(speech.synth, 'speak').mockImplementation((utterance) => {
      calls += 1;
      if (calls === 1) return; // engine stuck: no onstart, no onend
      queue(utterance);
    });
    const cancel = vi.spyOn(speech.synth, 'cancel');

    const { sayWord } = await getSpeech();
    const p = sayWord('hello');

    await vi.advanceTimersByTimeAsync(9_000);
    expect(calls).toBe(1);
    expect(cancel).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3_000);
    await p;
    expect(cancel).toHaveBeenCalled();
    expect(calls).toBe(2);
    expect(speech.spoken()).toEqual(['hello']);
  });
});

describe('warmUp', () => {
  it('should speak a silent utterance to prime the TTS engine', async () => {
    const { warmUp } = await getSpeech();
    void warmUp();
    // warmUp speaks one silent utterance (volume=0) to unlock audio.
    expect(speech.log).toHaveLength(1);
  });
});

// ─── AudioManager ────────────────────────────────────────────

describe('AudioManagerImpl', () => {
  it('should report isBusy=false by default', () => {
    const manager = new AudioManagerImpl();
    expect(manager.isBusy()).toBe(false);
  });

  it('should report isBusy=true while runExclusive action is executing', async () => {
    const manager = new AudioManagerImpl();

    let busyDuringAction = false;
    await manager.runExclusive(async () => {
      busyDuringAction = manager.isBusy();
    });

    expect(busyDuringAction).toBe(true);
    expect(manager.isBusy()).toBe(false);
  });

  it('should skip a second runExclusive call while one is already running', async () => {
    const manager = new AudioManagerImpl();

    let resolve1!: () => void;
    const action1 = new Promise<void>((r) => { resolve1 = r; });
    const action2Ran = vi.fn();

    const p1 = manager.runExclusive(() => action1);
    const p2Result = await manager.runExclusive(async () => { action2Ran(); });

    expect(p2Result).toBe(false);
    expect(action2Ran).not.toHaveBeenCalled();

    resolve1();
    const p1Result = await p1;
    expect(p1Result).toBe(true);
  });

  it('should reset isBusy after runExclusive action throws', async () => {
    const manager = new AudioManagerImpl();

    await manager.runExclusive(async () => {
      throw new Error('oops');
    }).catch(() => { /* expected */ });

    expect(manager.isBusy()).toBe(false);
  });

  it('should notify listeners on busy state changes', async () => {
    const manager = new AudioManagerImpl();
    const states: boolean[] = [];

    manager.onBusyChange((busy) => states.push(busy));

    await manager.runExclusive(async () => {
      // no-op
    });

    expect(states).toEqual([true, false]);
  });

  it('should allow unsubscribing from busy state changes', async () => {
    const manager = new AudioManagerImpl();
    const states: boolean[] = [];

    const unsub = manager.onBusyChange((busy) => states.push(busy));
    unsub();

    await manager.runExclusive(async () => {
      // no-op
    });

    expect(states).toEqual([]);
  });

  it('should delegate sayWord to speech module', async () => {
    const manager = new AudioManagerImpl();
    await manager.sayWord('test');
    expect(speech.spoken()).toEqual(['test']);
  });

  it('should delegate spellWord to speech module', async () => {
    const manager = new AudioManagerImpl();
    await manager.spellWord('ab');
    expect(speech.spoken()).toEqual(['a, b']);
  });
});

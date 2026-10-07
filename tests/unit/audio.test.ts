import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioManagerImpl } from '../../src/audio/manager.ts';

// ─── Mock SpeechSynthesisUtterance ───────────────────────────

class MockUtterance {
  text: string;
  rate = 1;
  voice: SpeechSynthesisVoice | null = null;
  onstart: ((ev: Event) => void) | null = null;
  onend: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);

// ─── Mock SpeechSynthesis ────────────────────────────────────

function createMockSpeechSynthesis() {
  const speak = vi.fn((utterance: MockUtterance) => {
    setTimeout(() => utterance.onend?.(new Event('end')), 0);
  });

  return {
    speak,
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    pending: false,
    speaking: false,
    paused: false,
    getVoices: vi.fn(() => []),
    onvoiceschanged: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  } as unknown as SpeechSynthesis;
}

let mockSynth: SpeechSynthesis;

beforeEach(() => {
  vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);
  mockSynth = createMockSpeechSynthesis();
  vi.stubGlobal('speechSynthesis', mockSynth);
});

// ─── speech.ts ──────────────────────────────────────────────

describe('sayWord', () => {
  async function getSpeech() {
    return await import('../../src/audio/speech.ts');
  }

  it('should speak a word via SpeechSynthesis', async () => {
    const { sayWord } = await getSpeech();
    await sayWord('hello');

    expect(mockSynth.speak).toHaveBeenCalledOnce();
    const utterance = vi.mocked(mockSynth.speak).mock.calls[0][0] as unknown as MockUtterance;
    expect(utterance.text).toBe('hello');
    expect(utterance.rate).toBe(1);
  });

  it('should NOT cancel before speak (Chrome Android synthesis-failed bug)', async () => {
    const { sayWord } = await getSpeech();
    await sayWord('hello');
    expect(mockSynth.cancel).not.toHaveBeenCalled();
  });

  it('should speak slowly at reduced rate', async () => {
    const { sayWordSlowly } = await getSpeech();
    await sayWordSlowly('world');

    expect(mockSynth.speak).toHaveBeenCalledOnce();
    const utterance = vi.mocked(mockSynth.speak).mock.calls[0][0] as unknown as MockUtterance;
    expect(utterance.text).toBe('world');
    expect(utterance.rate).toBe(0.6);
  });
});

describe('spellWord', () => {
  async function getSpeech() {
    return await import('../../src/audio/speech.ts');
  }

  it('should build a single utterance with comma-separated letters', async () => {
    const { spellWord } = await getSpeech();
    await spellWord('cat');

    expect(mockSynth.speak).toHaveBeenCalledOnce();
    const utterance = vi.mocked(mockSynth.speak).mock.calls[0][0] as unknown as MockUtterance;
    expect(utterance.text).toBe('c, a, t');
  });
});

describe('sayThenSpell', () => {
  async function getSpeech() {
    return await import('../../src/audio/speech.ts');
  }

  it('should build a single utterance with word then spelled letters', async () => {
    const { sayThenSpell } = await getSpeech();
    await sayThenSpell('hi');

    expect(mockSynth.speak).toHaveBeenCalledOnce();
    const utterance = vi.mocked(mockSynth.speak).mock.calls[0][0] as unknown as MockUtterance;
    expect(utterance.text).toBe('hi,,,, h, i');
  });
});

describe('long utterances (the tutor read-aloud)', () => {
  const voices = [
    { name: 'A', lang: 'en-US', default: true, localService: true },
    { name: 'B', lang: 'en-GB', default: false, localService: true },
  ] as SpeechSynthesisVoice[];

  async function freshSpeech() {
    vi.resetModules();
    return await import('../../src/audio/speech.ts');
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(mockSynth.getVoices).mockReturnValue(voices);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('speaks once and never cancels when an utterance has started and runs 25 s before onend', async () => {
    vi.mocked(mockSynth.speak).mockImplementation(((u: MockUtterance) => {
      setTimeout(() => u.onstart?.(new Event('start')), 10);
      setTimeout(() => u.onend?.(new Event('end')), 25_000);
    }) as unknown as SpeechSynthesis['speak']);

    const { sayWord } = await freshSpeech();
    let resolved = false;
    const p = sayWord('a long tutor message').then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(24_000);
    expect(resolved).toBe(false);
    expect(mockSynth.speak).toHaveBeenCalledOnce();
    expect(mockSynth.cancel).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_500);
    await p;
    expect(resolved).toBe(true);
    expect(mockSynth.speak).toHaveBeenCalledOnce();
    expect(mockSynth.cancel).not.toHaveBeenCalled();
  });

  it('still fails a started utterance that errors, and retries', async () => {
    let calls = 0;
    vi.mocked(mockSynth.speak).mockImplementation(((u: MockUtterance) => {
      calls++;
      const n = calls;
      setTimeout(() => u.onstart?.(new Event('start')), 10);
      setTimeout(() => (n === 1 ? u.onerror?.(new Event('error')) : u.onend?.(new Event('end'))), 100);
    }) as unknown as SpeechSynthesis['speak']);

    const { sayWord } = await freshSpeech();
    const p = sayWord('hello');
    await vi.advanceTimersByTimeAsync(5_000);
    await p;
    expect(mockSynth.speak).toHaveBeenCalledTimes(2);
    expect(mockSynth.cancel).toHaveBeenCalled();
  });

  it('still times out an utterance that never starts, and retries with the next voice', async () => {
    let calls = 0;
    vi.mocked(mockSynth.speak).mockImplementation(((u: MockUtterance) => {
      calls++;
      if (calls === 1) return; // engine stuck: no onstart, no onend
      setTimeout(() => u.onstart?.(new Event('start')), 10);
      setTimeout(() => u.onend?.(new Event('end')), 50);
    }) as unknown as SpeechSynthesis['speak']);

    const { sayWord } = await freshSpeech();
    const p = sayWord('hello');

    await vi.advanceTimersByTimeAsync(9_000);
    expect(mockSynth.speak).toHaveBeenCalledOnce();
    expect(mockSynth.cancel).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3_000);
    await p;
    expect(mockSynth.cancel).toHaveBeenCalled();
    expect(mockSynth.speak).toHaveBeenCalledTimes(2);
  });
});

describe('warmUp', () => {
  it('should speak a silent utterance to prime the TTS engine', async () => {
    const { warmUp } = await import('../../src/audio/speech.ts');
    warmUp();
    // warmUp speaks one silent utterance (volume=0) to unlock audio.
    expect(mockSynth.speak).toHaveBeenCalled();
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
    expect(mockSynth.speak).toHaveBeenCalledOnce();
  });

  it('should delegate spellWord to speech module', async () => {
    const manager = new AudioManagerImpl();
    await manager.spellWord('ab');
    expect(mockSynth.speak).toHaveBeenCalledOnce();
    const utterance = vi.mocked(mockSynth.speak).mock.calls[0][0] as unknown as MockUtterance;
    expect(utterance.text).toBe('a, b');
  });
});

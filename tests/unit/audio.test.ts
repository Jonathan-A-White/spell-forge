// Spelling practice's single words: sayWord, sayWordSlowly, spellWord, sayThenSpell and warmUp, thin helpers over
// voice-kit/speech's speak() (mw-vmx5cb.5). The synthesiser is voice-kit/testing's honest fake; an engine that sticks or
// errors is made by wrapping its speak().
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { stop } from 'voice-kit/speech';
import { installSpeech, type SpeechFake } from 'voice-kit/testing/speech';
import { AudioManagerImpl } from '../../src/audio/manager.ts';
import { sayThenSpell, sayWord, sayWordSlowly, spellWord, warmUp } from '../../src/audio/speech.ts';

let speech: SpeechFake;

beforeEach(async () => {
  speech = installSpeech(window);
  await new Promise((r) => setTimeout(r, 60)); // the phone lists its voices
});

afterEach(() => {
  stop();
  speech.uninstall();
});

describe('sayWord', () => {
  it('should speak a word via SpeechSynthesis', async () => {
    await sayWord('hello', 'en');

    expect(speech.log).toHaveLength(1);
    expect(speech.log[0]).toMatchObject({ text: 'hello', rate: 1, lang: 'en-US', outcome: 'ended' });
  });

  it('speaks a Spanish word in Spanish', async () => {
    await sayWord('hola', 'es');
    expect(speech.log[0]).toMatchObject({ text: 'hola', lang: 'es-ES' });
  });

  it('resolves when the word is over, not before', async () => {
    let done = false;
    const p = sayWord('hello', 'en').then(() => (done = true));
    expect(done).toBe(false);
    await p;
    expect(done).toBe(true);
  });
});

describe('sayWordSlowly', () => {
  it('should speak slowly at a rate below 1', async () => {
    await sayWordSlowly('world', 'en');

    expect(speech.log).toHaveLength(1);
    expect(speech.log[0].text).toBe('world');
    expect(speech.log[0].rate).toBeLessThan(1);
    expect(speech.log[0].rate).toBe(0.6);
  });
});

describe('spellWord', () => {
  it('should build a single utterance with comma-separated letters', async () => {
    await spellWord('cat', 'en');

    expect(speech.spoken()).toEqual(['c, a, t']);
    expect(speech.log[0].rate).toBe(1);
  });
});

describe('sayThenSpell', () => {
  it('should build a single utterance with word then spelled letters', async () => {
    await sayThenSpell('hi', 'en');

    expect(speech.spoken()).toEqual(['hi,,,, h, i']);
    expect(speech.log[0].rate).toBe(1);
  });
});

describe('the engine is the kit\'s alone', () => {
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
    });

  it('has no synth.speak and no new SpeechSynthesisUtterance anywhere in src/', () => {
    const offenders = sources(join(__dirname, '../../src')).filter((file) =>
      /\.speak\s*(\(|=)|new\s+SpeechSynthesisUtterance|SpeechSynthesisUtterance\s*\(/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  // Kestrel 15d (M2): a game or drill asks a word of src/audio (which names the language) and never calls the kit's speak() itself.
  it("calls the kit's speak() from the two modules of src/audio that speak, and nowhere else", () => {
    const speakers = sources(join(__dirname, '../../src'))
      .filter((file) => /import\s*\{[^}]*\bspeak\b[^}]*\}\s*from\s*'voice-kit\/speech'/.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(join(__dirname, '../../').length));
    expect(speakers.sort()).toEqual(['src/audio/speech.ts', 'src/audio/tutor-speech.ts']);
  });
});

describe('long and failing speech', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('speaks once and holds the word until its onend when an utterance runs 25 s', async () => {
    let resolved = false;
    const p = sayWord(Array(400).fill('word').join(' '), 'en').then(() => {
      resolved = true;
    }); // 400 words take 24.15 s

    await vi.advanceTimersByTimeAsync(24_000);
    expect(resolved).toBe(false);
    expect(speech.log).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1_500);
    await p;
    expect(resolved).toBe(true);
    expect(speech.log).toHaveLength(1);
  });

  it('resolves, without a second try, when the engine errors on the word', async () => {
    const queue = speech.synth.speak.bind(speech.synth);
    vi.spyOn(speech.synth, 'speak').mockImplementation((utterance) => {
      queue(utterance);
      setTimeout(() => speech.synth.cancel(), 100); // interrupted while speaking: onerror
    });
    const p = sayWord('hello', 'en');
    await vi.advanceTimersByTimeAsync(5_000);
    await p;
    expect(speech.log.map((entry) => entry.outcome)).toEqual(['interrupted']);
  });

  it('lets go of a word the engine never starts, so the audio manager is not busy for ever', async () => {
    vi.spyOn(speech.synth, 'speak').mockImplementation(() => undefined); // engine stuck: no onstart, no onend
    const manager = new AudioManagerImpl();
    const ran = manager.runExclusive(() => manager.sayWord('hello', 'en'));
    await vi.advanceTimersByTimeAsync(9_000);
    expect(manager.isBusy()).toBe(true);
    await vi.advanceTimersByTimeAsync(5_000);
    await ran;
    expect(manager.isBusy()).toBe(false);
  });
});

describe('warmUp', () => {
  it('should speak a silent utterance to prime the TTS engine', async () => {
    const primed = warmUp();
    await vi.waitFor(() => expect(speech.log).toHaveLength(1));
    expect(speech.log[0].text.trim()).toBe('');
    await primed;
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
    await manager.sayWord('test', 'en');
    expect(speech.spoken()).toEqual(['test']);
  });

  it('should delegate spellWord to speech module', async () => {
    const manager = new AudioManagerImpl();
    await manager.spellWord('ab', 'en');
    expect(speech.spoken()).toEqual(['a, b']);
  });
});

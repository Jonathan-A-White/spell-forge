import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TtsProvider, clearVoiceCache } from '../../src/audio/tts.ts';
import { DictionaryProvider } from '../../src/audio/dictionary.ts';
import { AudioManagerImpl } from '../../src/audio/manager.ts';
import type { AudioProvider } from '../../src/contracts/types.ts';

// ─── Mock SpeechSynthesisUtterance ───────────────────────────

class MockUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  voice: SpeechSynthesisVoice | null = null;
  onend: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function createMockVoice(name: string, lang: string): SpeechSynthesisVoice {
  return { name, lang, default: false, localService: true, voiceURI: name } as SpeechSynthesisVoice;
}

vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);

// ─── Mock SpeechSynthesis ────────────────────────────────────

function createMockSpeechSynthesis(voices: SpeechSynthesisVoice[] = []) {
  const speak = vi.fn((utterance: MockUtterance) => {
    // Simulate async completion
    setTimeout(() => utterance.onend?.(new Event('end')), 0);
  });

  return { speak, cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(), pending: false, speaking: false, paused: false, getVoices: vi.fn(() => voices), onvoiceschanged: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(() => true) } as unknown as SpeechSynthesis;
}

let mockSynth: SpeechSynthesis;

beforeEach(() => {
  vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);
  mockSynth = createMockSpeechSynthesis();
  vi.stubGlobal('speechSynthesis', mockSynth);
  clearVoiceCache();
});

// ─── TTS Provider ────────────────────────────────────────────

describe('TtsProvider', () => {
  it('should have priority 1', () => {
    const tts = new TtsProvider();
    expect(tts.priority).toBe(1);
  });

  it('should be available when speechSynthesis exists', () => {
    const tts = new TtsProvider();
    expect(tts.isAvailable()).toBe(true);
  });

  it('should speak a word via SpeechSynthesis', async () => {
    const tts = new TtsProvider();
    await tts.speak('hello');

    expect(mockSynth.speak).toHaveBeenCalledOnce();
    const utterance = vi.mocked(mockSynth.speak).mock.calls[0][0] as unknown as MockUtterance;
    expect(utterance.text).toBe('hello');
    expect(utterance.rate).toBe(1);
  });

  it('should speak slowly with rate < 1', async () => {
    const tts = new TtsProvider();
    await tts.speakSlowly('world');

    expect(mockSynth.speak).toHaveBeenCalledOnce();
    const utterance = vi.mocked(mockSynth.speak).mock.calls[0][0] as unknown as MockUtterance;
    expect(utterance.text).toBe('world');
    expect(utterance.rate).toBeLessThan(1);
  });

  it('should select a matching voice by gender preference', async () => {
    const femaleVoice = createMockVoice('Samantha', 'en-US');
    const maleVoice = createMockVoice('Daniel', 'en-US');
    mockSynth = createMockSpeechSynthesis([femaleVoice, maleVoice]);
    vi.stubGlobal('speechSynthesis', mockSynth);

    const tts = new TtsProvider();
    tts.setVoicePreference('male');
    await tts.speak('test');

    const utterance = vi.mocked(mockSynth.speak).mock.calls[0][0] as unknown as MockUtterance;
    expect(utterance.voice).toBe(maleVoice);
  });

  it('should default to female voice preference', async () => {
    const femaleVoice = createMockVoice('Samantha', 'en-US');
    const maleVoice = createMockVoice('Daniel', 'en-US');
    mockSynth = createMockSpeechSynthesis([femaleVoice, maleVoice]);
    vi.stubGlobal('speechSynthesis', mockSynth);

    const tts = new TtsProvider();
    await tts.speak('test');

    const utterance = vi.mocked(mockSynth.speak).mock.calls[0][0] as unknown as MockUtterance;
    expect(utterance.voice).toBe(femaleVoice);
  });

  it('should fall back to first voice when no gender match', async () => {
    const unknownVoice = createMockVoice('SomeVoice', 'en-US');
    mockSynth = createMockSpeechSynthesis([unknownVoice]);
    vi.stubGlobal('speechSynthesis', mockSynth);

    const tts = new TtsProvider();
    tts.setVoicePreference('male');
    await tts.speak('test');

    const utterance = vi.mocked(mockSynth.speak).mock.calls[0][0] as unknown as MockUtterance;
    expect(utterance.voice).toBe(unknownVoice);
  });

  it('should switch voice when gender preference changes', async () => {
    const femaleVoice = createMockVoice('Samantha', 'en-US');
    const maleVoice = createMockVoice('Daniel', 'en-US');
    mockSynth = createMockSpeechSynthesis([femaleVoice, maleVoice]);
    vi.stubGlobal('speechSynthesis', mockSynth);

    const tts = new TtsProvider();

    // Start with female (default)
    await tts.speak('hello');
    const u1 = vi.mocked(mockSynth.speak).mock.calls[0][0] as unknown as MockUtterance;
    expect(u1.voice).toBe(femaleVoice);

    // Switch to male
    tts.setVoicePreference('male');
    await tts.speak('world');
    const u2 = vi.mocked(mockSynth.speak).mock.calls[1][0] as unknown as MockUtterance;
    expect(u2.voice).toBe(maleVoice);

    // Switch back to female
    tts.setVoicePreference('female');
    await tts.speak('again');
    const u3 = vi.mocked(mockSynth.speak).mock.calls[2][0] as unknown as MockUtterance;
    expect(u3.voice).toBe(femaleVoice);
  });

  it('should pick different fallback voices per gender when no hints match', async () => {
    const voiceA = createMockVoice('VoiceAlpha', 'en-US');
    const voiceB = createMockVoice('VoiceBeta', 'en-US');
    mockSynth = createMockSpeechSynthesis([voiceA, voiceB]);
    vi.stubGlobal('speechSynthesis', mockSynth);

    const tts = new TtsProvider();

    // Female gets first fallback voice
    await tts.speak('hello');
    const u1 = vi.mocked(mockSynth.speak).mock.calls[0][0] as unknown as MockUtterance;
    expect(u1.voice).toBe(voiceA);

    // Male should pick a different voice
    tts.setVoicePreference('male');
    await tts.speak('world');
    const u2 = vi.mocked(mockSynth.speak).mock.calls[1][0] as unknown as MockUtterance;
    expect(u2.voice).toBe(voiceB);
  });

  it('should set higher pitch for female and lower pitch for male', async () => {
    const voice = createMockVoice('GenericVoice', 'en-US');
    mockSynth = createMockSpeechSynthesis([voice]);
    vi.stubGlobal('speechSynthesis', mockSynth);

    const tts = new TtsProvider();

    // Default female — pitch should be > 1
    await tts.speak('hello');
    const u1 = vi.mocked(mockSynth.speak).mock.calls[0][0] as unknown as MockUtterance;
    expect(u1.pitch).toBeGreaterThan(1);

    // Switch to male — pitch should be < 1
    tts.setVoicePreference('male');
    await tts.speak('world');
    const u2 = vi.mocked(mockSynth.speak).mock.calls[1][0] as unknown as MockUtterance;
    expect(u2.pitch).toBeLessThan(1);
  });

  it('should match Google TTS voices with gender suffix', async () => {
    const googleFemale = createMockVoice('Google UK English Female', 'en-GB');
    const googleMale = createMockVoice('Google UK English Male', 'en-GB');
    mockSynth = createMockSpeechSynthesis([googleFemale, googleMale]);
    vi.stubGlobal('speechSynthesis', mockSynth);

    const tts = new TtsProvider();

    await tts.speak('hello');
    const u1 = vi.mocked(mockSynth.speak).mock.calls[0][0] as unknown as MockUtterance;
    expect(u1.voice).toBe(googleFemale);

    tts.setVoicePreference('male');
    await tts.speak('world');
    const u2 = vi.mocked(mockSynth.speak).mock.calls[1][0] as unknown as MockUtterance;
    expect(u2.voice).toBe(googleMale);
  });

  it('should speak chunks with delays between them', async () => {
    vi.useFakeTimers();
    const tts = new TtsProvider();

    const promise = tts.speakChunks(['cat', 'dog', 'bird'], 100);

    // First chunk speaks immediately, then onend fires after setTimeout(0)
    await vi.advanceTimersByTimeAsync(0);
    expect(mockSynth.speak).toHaveBeenCalledTimes(1);

    // Advance past the delay between chunks (100ms) + onend setTimeout(0)
    await vi.advanceTimersByTimeAsync(101);
    expect(mockSynth.speak).toHaveBeenCalledTimes(2);

    // Advance past the second delay + onend
    await vi.advanceTimersByTimeAsync(101);
    expect(mockSynth.speak).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(0);
    await promise;
    vi.useRealTimers();
  });
});

// ─── Dictionary Provider ─────────────────────────────────────

describe('DictionaryProvider', () => {
  it('should have priority 3', () => {
    const dict = new DictionaryProvider();
    expect(dict.priority).toBe(3);
  });

  it('should be available by default', () => {
    const dict = new DictionaryProvider();
    expect(dict.isAvailable()).toBe(true);
  });

  it('should become unavailable on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const dict = new DictionaryProvider();

    await expect(dict.speak('hello')).rejects.toThrow();
    expect(dict.isAvailable()).toBe(false);

    vi.unstubAllGlobals();
    // Re-stub speechSynthesis after unstubbing
    vi.stubGlobal('speechSynthesis', mockSynth);
  });
});

// ─── AudioManager ────────────────────────────────────────────

describe('AudioManagerImpl', () => {
  function createMockProvider(
    prio: number,
    available: boolean,
    shouldFail = false,
  ): AudioProvider {
    return {
      priority: prio,
      isAvailable: vi.fn(() => available),
      speak: vi.fn(shouldFail
        ? () => Promise.reject(new Error('fail'))
        : () => Promise.resolve()),
      speakSlowly: vi.fn(shouldFail
        ? () => Promise.reject(new Error('fail'))
        : () => Promise.resolve()),
      speakChunks: vi.fn(shouldFail
        ? () => Promise.reject(new Error('fail'))
        : () => Promise.resolve()),
    };
  }

  it('should try providers in priority order (highest first)', async () => {
    const manager = new AudioManagerImpl();
    const low = createMockProvider(1, true);
    const high = createMockProvider(5, true);

    manager.registerProvider(low);
    manager.registerProvider(high);

    await manager.speak('test');

    expect(high.speak).toHaveBeenCalledWith('test');
    expect(low.speak).not.toHaveBeenCalled();
  });

  it('should fall back when top provider is unavailable', async () => {
    const manager = new AudioManagerImpl();
    const unavailable = createMockProvider(5, false);
    const available = createMockProvider(1, true);

    manager.registerProvider(unavailable);
    manager.registerProvider(available);

    await manager.speak('fallback');

    expect(unavailable.speak).not.toHaveBeenCalled();
    expect(available.speak).toHaveBeenCalledWith('fallback');
  });

  it('should fall back when top provider fails', async () => {
    const manager = new AudioManagerImpl();
    const failing = createMockProvider(5, true, true);
    const backup = createMockProvider(1, true);

    manager.registerProvider(failing);
    manager.registerProvider(backup);

    await manager.speak('recover');

    expect(failing.speak).toHaveBeenCalledWith('recover');
    expect(backup.speak).toHaveBeenCalledWith('recover');
  });

  it('should handle all providers failing gracefully (no throw)', async () => {
    const manager = new AudioManagerImpl();
    const failing1 = createMockProvider(5, true, true);
    const failing2 = createMockProvider(1, true, true);

    manager.registerProvider(failing1);
    manager.registerProvider(failing2);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Should not throw
    await expect(manager.speak('nope')).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith('All audio providers failed or none available');

    warnSpy.mockRestore();
  });

  it('should handle no providers registered gracefully', async () => {
    const manager = new AudioManagerImpl();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(manager.speak('empty')).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('should delegate speakSlowly to the best available provider', async () => {
    const manager = new AudioManagerImpl();
    const provider = createMockProvider(3, true);
    manager.registerProvider(provider);

    await manager.speakSlowly('slow');
    expect(provider.speakSlowly).toHaveBeenCalledWith('slow');
  });

  it('should delegate speakChunks to the best available provider', async () => {
    const manager = new AudioManagerImpl();
    const provider = createMockProvider(3, true);
    manager.registerProvider(provider);

    await manager.speakChunks(['a', 'b'], 200);
    expect(provider.speakChunks).toHaveBeenCalledWith(['a', 'b'], 200);
  });

  it('should forward voice preference to TtsProvider instances', async () => {
    const maleVoice = createMockVoice('David', 'en-US');
    mockSynth = createMockSpeechSynthesis([maleVoice]);
    vi.stubGlobal('speechSynthesis', mockSynth);

    const manager = new AudioManagerImpl();
    const tts = new TtsProvider();
    manager.registerProvider(tts);

    manager.setVoicePreference('male');
    await manager.speak('test');

    const utterance = vi.mocked(mockSynth.speak).mock.calls[0][0] as unknown as MockUtterance;
    expect(utterance.voice).toBe(maleVoice);
  });
});

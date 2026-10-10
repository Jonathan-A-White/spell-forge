// mw-kuy7rx.8 / mw-m7v5kc.4: the tutor speaks (through bsv-kit/speech) with the phone's default voice for its language
// unless a voice is picked; spelling practice keeps its en-US/GB/AU ranking. The synthesiser is bsv-kit/testing's honest fake.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resume, stop } from 'bsv-kit/speech';
import { installSpeech, type FakeVoice, type SpeechFake } from 'bsv-kit/testing/speech';
import { listTutorVoices, pauseTutorSpeech, sayAsTutor, sayWord } from '../../src/audio';

const v = (name: string, lang: string, isDefault = false): FakeVoice => ({
  name,
  lang,
  voiceURI: `uri:${name}`,
  default: isDefault,
  localService: true,
});

let speech: SpeechFake;

async function install(voices: FakeVoice[], navLang: string) {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(navLang);
  speech = installSpeech(window, { voices });
  await vi.advanceTimersByTimeAsync(60); // the phone lists its voices
}

/** The voice and language each utterance was given. */
const given = () => speech.log.map((entry) => ({ voice: entry.voice, lang: entry.lang }));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  stop();
  speech.uninstall();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('sayAsTutor', () => {
  it('speaks with the voice that matches the phone language exactly', async () => {
    await install([v('US', 'en-US', true), v('GB', 'en-GB'), v('AU', 'en-AU')], 'en-GB');
    void sayAsTutor('Hello there');
    await vi.advanceTimersByTimeAsync(500);
    expect(given()).toEqual([{ voice: 'GB', lang: 'en-GB' }]);
  });

  it('else takes a voice with the same primary language', async () => {
    await install([v('FR', 'fr-FR', true), v('AU', 'en-AU'), v('US', 'en-US')], 'en-NZ');
    void sayAsTutor('Hello');
    await vi.advanceTimersByTimeAsync(500);
    expect(given()[0].voice).toBe('AU');
  });

  it('with no matching voice, names the language and leaves the voice to the browser default', async () => {
    await install([v('FR', 'fr-FR', true)], 'de-DE');
    void sayAsTutor('Hello');
    await vi.advanceTimersByTimeAsync(500);
    expect(given()).toEqual([{ voice: null, lang: 'de-DE' }]);
  });

  it('uses a picked voice (by voiceURI) over the default rule, for every sentence of the speech', async () => {
    await install([v('US', 'en-US', true), v('GB', 'en-GB'), v('AU', 'en-AU')], 'en-GB');
    void sayAsTutor('Hello. Hello again.', 'uri:AU');
    await vi.advanceTimersByTimeAsync(1000);
    expect(given()).toEqual([
      { voice: 'AU', lang: 'en-AU' },
      { voice: 'AU', lang: 'en-AU' },
    ]);
  });

  it('keeps the picked voice when the speech is paused and resumed', async () => {
    await install([v('US', 'en-US', true), v('GB', 'en-GB'), v('AU', 'en-AU')], 'en-GB');
    void sayAsTutor('Hello. Hello again.', 'uri:AU');
    await vi.advanceTimersByTimeAsync(300);
    pauseTutorSpeech();
    resume();
    await vi.advanceTimersByTimeAsync(1000);
    expect(given().map((g) => g.voice)).toEqual(['AU', 'AU', 'AU']);
  });

  it('a picked voice the phone no longer has falls back to the default rule', async () => {
    await install([v('US', 'en-US', true), v('GB', 'en-GB')], 'en-GB');
    void sayAsTutor('Hello', 'uri:Gone');
    await vi.advanceTimersByTimeAsync(500);
    expect(given()[0].voice).toBe('GB');
  });

  it('a later speech with no pick is not stuck with the earlier pick', async () => {
    await install([v('US', 'en-US', true), v('GB', 'en-GB'), v('AU', 'en-AU')], 'en-GB');
    void sayAsTutor('Hello', 'uri:AU');
    await vi.advanceTimersByTimeAsync(500);
    void sayAsTutor('Hello');
    await vi.advanceTimersByTimeAsync(500);
    expect(given().map((g) => g.voice)).toEqual(['AU', 'GB']);
  });
});

describe('listTutorVoices', () => {
  it("lists the device's voices for the phone's language", async () => {
    await install([v('US', 'en-US', true), v('FR', 'fr-FR'), v('GB', 'en-GB')], 'en-GB');
    expect(listTutorVoices().map((x) => x.name)).toEqual(['US', 'GB']);
  });
});

describe('spelling practice keeps its voice ranking', () => {
  it('sayWord still prefers en-US, then en-GB, then en-AU, and forces the lang', async () => {
    await install([v('AU', 'en-AU'), v('GB', 'en-GB'), v('US', 'en-US')], 'en-AU');
    void sayWord('cat');
    await vi.advanceTimersByTimeAsync(500);
    expect(given()).toEqual([{ voice: 'US', lang: 'en-US' }]);
  });

  it('the first three strategies are still the ranked voices', async () => {
    await install([v('AU', 'en-AU'), v('GB', 'en-GB'), v('US', 'en-US')], 'en-AU');
    // an engine that fails every utterance: it is cancelled the moment it is queued, which the honest fake reports as an error
    const queue = speech.synth.speak.bind(speech.synth);
    vi.spyOn(speech.synth, 'speak').mockImplementation((utterance) => {
      queue(utterance);
      speech.synth.cancel();
    });
    const p = sayWord('cat');
    await vi.advanceTimersByTimeAsync(10_000);
    await p;
    expect(given().slice(0, 3).map((g) => g.voice)).toEqual(['US', 'GB', 'AU']);
  });
});

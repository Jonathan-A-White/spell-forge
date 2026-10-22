// mw-kuy7rx.8 / mw-m7v5kc.4: the tutor speaks (through voice-kit/speech) with the phone's default voice for its language
// unless a voice is picked; spelling practice's words rank voices en-US, en-GB, en-AU (rankVoice, given to the kit's
// preferredVoice) and take the same picked voice (mw-vmx5cb.5). The synthesiser is voice-kit/testing's honest fake.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resume, stop } from 'voice-kit/speech';
import { installSpeech, type FakeVoice, type SpeechFake } from 'voice-kit/testing/speech';
import { listTutorVoices, pauseTutorSpeech, rankVoice, sayAsTutor, sayWord, setSpeechVoice } from '../../src/audio';

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
  it("lists the device's voices for the phone's language, best first by the words' rank", async () => {
    await install([v('AU', 'en-AU'), v('FR', 'fr-FR'), v('GB', 'en-GB', true), v('US', 'en-US')], 'en-GB');
    expect(listTutorVoices().map((x) => x.name)).toEqual(['US', 'GB', 'AU']);
  });

  it('keeps the phone\'s order among voices the rank does not tell apart', async () => {
    await install([v('NZ', 'en-NZ'), v('IN', 'en-IN'), v('US', 'en-US')], 'en-GB');
    expect(listTutorVoices().map((x) => x.name)).toEqual(['US', 'NZ', 'IN']);
  });

  it('is empty when the phone cannot speak', () => {
    expect(listTutorVoices('en-US')).toEqual([]);
  });
});

describe('rankVoice', () => {
  const score = (name: string, lang: string, want: string) => rankVoice(v(name, lang), want);

  it('prefers en-US, then en-GB, then en-AU, then any other English', () => {
    const scores = ['en-US', 'en-GB', 'en-AU', 'en-NZ'].map((lang) => score(lang, lang, 'en-US'));
    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(scores[1]).toBeGreaterThan(scores[2]);
    expect(scores[2]).toBeGreaterThan(scores[3]);
  });

  it('prefers es-ES, then es-MX for Spanish', () => {
    expect(score('ES', 'es-ES', 'es-ES')).toBeGreaterThan(score('MX', 'es-MX', 'es-ES'));
    expect(score('MX', 'es-MX', 'es-ES')).toBeGreaterThan(score('CO', 'es-CO', 'es-ES'));
  });

  it('reads a voice tag with an underscore or capitals as the phone writes it', () => {
    expect(score('GB', 'en_GB', 'en-US')).toBe(score('GB', 'en-gb', 'en-US'));
  });

  it('scores every voice alike for a language it has no preferences for', () => {
    expect(score('A', 'el-GR', 'el-GR')).toBe(score('B', 'el-CY', 'el-GR'));
  });
});

describe("spelling practice's words", () => {
  it('sayWord prefers a same-language voice by rank when the phone has no exact tag: US, then GB, then AU', async () => {
    await install([v('AU', 'en-AU'), v('GB', 'en-GB'), v('US', 'en-US')], 'en-AU');
    void sayWord('cat');
    await vi.advanceTimersByTimeAsync(500);
    expect(given()).toEqual([{ voice: 'US', lang: 'en-US' }]);
  });

  it('with only en-GB and en-AU voices, sayWord ranks en-GB first (the kit takes a rank over the first match)', async () => {
    await install([v('AU', 'en-AU'), v('GB', 'en-GB')], 'en-AU');
    void sayWord('cat');
    await vi.advanceTimersByTimeAsync(500);
    expect(given()[0].voice).toBe('GB');
  });
});

describe('one Tutor voice for the tutor and the words', () => {
  afterEach(() => setSpeechVoice(null));

  it('the voice set in Tutor settings reaches the tutor and a word alike', async () => {
    await install([v('US', 'en-US', true), v('GB', 'en-GB'), v('AU', 'en-AU')], 'en-GB');
    setSpeechVoice('uri:AU');
    void sayAsTutor('Hello there');
    await vi.advanceTimersByTimeAsync(500);
    void sayWord('cat');
    await vi.advanceTimersByTimeAsync(500);
    expect(given()).toEqual([
      { voice: 'AU', lang: 'en-AU' },
      { voice: 'AU', lang: 'en-AU' },
    ]);
  });

  it('every word helper takes it', async () => {
    await install([v('US', 'en-US', true), v('AU', 'en-AU')], 'en-US');
    setSpeechVoice('uri:AU');
    const { sayWordSlowly, spellWord, sayThenSpell } = await import('../../src/audio');
    for (const say of [sayWordSlowly, spellWord, sayThenSpell]) {
      void say('cat');
      await vi.advanceTimersByTimeAsync(2000);
    }
    expect(given().map((g) => g.voice)).toEqual(['AU', 'AU', 'AU']);
  });

  it('with none picked, words and tutor both take the default rule', async () => {
    await install([v('US', 'en-US', true), v('GB', 'en-GB')], 'en-GB');
    void sayWord('cat');
    await vi.advanceTimersByTimeAsync(500);
    expect(given()[0].voice).toBe('US');
  });

  it('a picked voice the phone no longer lists is ignored by the word', async () => {
    await install([v('US', 'en-US', true), v('GB', 'en-GB')], 'en-GB');
    setSpeechVoice('uri:Gone');
    void sayWord('cat');
    await vi.advanceTimersByTimeAsync(500);
    expect(given()[0].voice).toBe('US');
  });

  it('a picked voice of another language is not used for a word of this one', async () => {
    await install([v('ES', 'es-ES'), v('US', 'en-US', true)], 'en-US');
    setSpeechVoice('uri:ES');
    void sayWord('cat');
    await vi.advanceTimersByTimeAsync(500);
    expect(given()).toEqual([{ voice: 'US', lang: 'en-US' }]);
  });

  it('Try (a sample in a given voice) does not change the voice the words use', async () => {
    await install([v('US', 'en-US', true), v('AU', 'en-AU')], 'en-US');
    void sayAsTutor('Hello', 'uri:AU');
    await vi.advanceTimersByTimeAsync(500);
    void sayWord('cat');
    await vi.advanceTimersByTimeAsync(500);
    expect(given().map((g) => g.voice)).toEqual(['AU', 'US']);
  });
});

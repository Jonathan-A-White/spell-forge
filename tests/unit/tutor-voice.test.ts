// mw-kuy7rx.8: the tutor speaks with the phone's default voice by Postern's rule unless a voice is picked;
// spelling practice keeps its en-US/GB/AU ranking.
import { beforeEach, describe, expect, it, vi } from 'vitest';

class MockUtterance {
  text: string;
  rate = 1;
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  onstart: ((ev: Event) => void) | null = null;
  onend: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

const v = (name: string, lang: string, isDefault = false) =>
  ({ name, lang, voiceURI: `uri:${name}`, default: isDefault, localService: true }) as SpeechSynthesisVoice;

let synth: SpeechSynthesis;
let voices: SpeechSynthesisVoice[];

function install(list: SpeechSynthesisVoice[], navLang: string) {
  voices = list;
  synth = {
    speak: vi.fn((u: MockUtterance) => {
      setTimeout(() => u.onend?.(new Event('end')), 0);
    }),
    cancel: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
    speaking: false,
    pending: false,
    paused: false,
    getVoices: vi.fn(() => voices),
    onvoiceschanged: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as SpeechSynthesis;
  vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);
  vi.stubGlobal('speechSynthesis', synth);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(navLang);
}

const spoken = () => vi.mocked(synth.speak).mock.calls.map((c) => c[0] as unknown as MockUtterance);

async function freshSpeech() {
  vi.resetModules();
  return await import('../../src/audio/speech.ts');
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('pickPosternVoice (the tutor default)', () => {
  it('takes the voice that matches the phone language exactly', async () => {
    install([], 'en-GB');
    const { pickPosternVoice } = await freshSpeech();
    const list = [v('US', 'en-US', true), v('GB', 'en-GB'), v('AU', 'en-AU')];
    expect(pickPosternVoice(list, 'en-GB')?.name).toBe('GB');
    expect(pickPosternVoice(list, 'en_gb')?.name).toBe('GB');
  });

  it('else takes a voice with the same primary language', async () => {
    install([], 'en-NZ');
    const { pickPosternVoice } = await freshSpeech();
    const list = [v('FR', 'fr-FR', true), v('AU', 'en-AU'), v('US', 'en-US')];
    expect(pickPosternVoice(list, 'en-NZ')?.name).toBe('AU');
  });

  it('else leaves it to the browser default', async () => {
    install([], 'de-DE');
    const { pickPosternVoice } = await freshSpeech();
    expect(pickPosternVoice([v('US', 'en-US', true), v('FR', 'fr-FR')], 'de-DE')).toBeNull();
    expect(pickPosternVoice([], 'en-US')).toBeNull();
  });
});

describe('sayAsTutor', () => {
  it('speaks with the voice Postern would pick, and leaves the lang to that voice', async () => {
    install([v('US', 'en-US', true), v('GB', 'en-GB'), v('AU', 'en-AU')], 'en-GB');
    const { sayAsTutor } = await freshSpeech();
    await sayAsTutor('Hello there');
    expect(spoken()).toHaveLength(1);
    expect(spoken()[0].voice?.name).toBe('GB');
    expect(spoken()[0].lang).toBe('');
  });

  it('with no matching voice speaks a bare utterance: the browser default', async () => {
    install([v('FR', 'fr-FR', true)], 'de-DE');
    const { sayAsTutor } = await freshSpeech();
    await sayAsTutor('Hello');
    expect(spoken()[0].voice).toBeNull();
    expect(spoken()[0].lang).toBe('');
  });

  it('uses a picked voice (by voiceURI) over the default rule', async () => {
    install([v('US', 'en-US', true), v('GB', 'en-GB'), v('AU', 'en-AU')], 'en-GB');
    const { sayAsTutor } = await freshSpeech();
    await sayAsTutor('Hello', 'uri:AU');
    expect(spoken()[0].voice?.name).toBe('AU');
    expect(spoken()[0].lang).toBe('');
  });

  it('a picked voice the phone no longer has falls back to the default rule', async () => {
    install([v('US', 'en-US', true), v('GB', 'en-GB')], 'en-GB');
    const { sayAsTutor } = await freshSpeech();
    await sayAsTutor('Hello', 'uri:Gone');
    expect(spoken()[0].voice?.name).toBe('GB');
  });

  it('keeps the fallbacks: when the chosen voice errors it tries the device default voice', async () => {
    install([v('US', 'en-US', true), v('GB', 'en-GB')], 'en-GB');
    let n = 0;
    vi.mocked(synth.speak).mockImplementation(((u: MockUtterance) => {
      n += 1;
      const call = n;
      setTimeout(() => (call === 1 ? u.onerror?.(new Event('error')) : u.onend?.(new Event('end'))), 0);
    }) as unknown as SpeechSynthesis['speak']);
    const { sayAsTutor } = await freshSpeech();
    await sayAsTutor('Hello');
    expect(spoken().map((u) => u.voice?.name)).toEqual(['GB', 'US']);
  });
});

describe('listTutorVoices', () => {
  it("lists the device's voices for the phone's language", async () => {
    install([v('US', 'en-US', true), v('FR', 'fr-FR'), v('GB', 'en-GB')], 'en-GB');
    const { listTutorVoices } = await freshSpeech();
    expect(listTutorVoices().map((x) => x.name)).toEqual(['US', 'GB']);
  });
});

describe('spelling practice keeps its voice ranking', () => {
  it('sayWord still prefers en-US, then en-GB, then en-AU, and forces the lang', async () => {
    install([v('AU', 'en-AU'), v('GB', 'en-GB'), v('US', 'en-US')], 'en-AU');
    const { sayWord } = await freshSpeech();
    await sayWord('cat');
    expect(spoken()[0].voice?.name).toBe('US');
    expect(spoken()[0].lang).toBe('en-US');
  });

  it('the first three strategies are still the ranked voices', async () => {
    install([v('AU', 'en-AU'), v('GB', 'en-GB'), v('US', 'en-US')], 'en-AU');
    vi.mocked(synth.speak).mockImplementation(((u: MockUtterance) => {
      setTimeout(() => u.onerror?.(new Event('error')), 0);
    }) as unknown as SpeechSynthesis['speak']);
    vi.useFakeTimers();
    const { sayWord } = await freshSpeech();
    const p = sayWord('cat');
    await vi.advanceTimersByTimeAsync(10_000);
    await p;
    vi.useRealTimers();
    expect(spoken().slice(0, 3).map((u) => u.voice?.name)).toEqual(['US', 'GB', 'AU']);
  });
});

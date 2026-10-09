// mw-kuy7rx.20: the tutor's sentences can be paused (the position kept), resumed from that sentence, restarted and
// stopped; new tutor speech replaces what plays instead of queueing behind it; single words are untouched.
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

let synth: SpeechSynthesis;
let live: MockUtterance[];

/** A synthesiser that speaks nothing by itself: the test ends each utterance. cancel() errors the playing one, as browsers do. */
function install() {
  live = [];
  synth = {
    speak: vi.fn((u: MockUtterance) => {
      live.push(u);
    }),
    cancel: vi.fn(() => {
      const gone = live.splice(0);
      for (const u of gone) setTimeout(() => u.onerror?.({ error: 'interrupted' } as unknown as Event), 0);
    }),
    resume: vi.fn(),
    pause: vi.fn(),
    speaking: false,
    pending: false,
    paused: false,
    getVoices: vi.fn(() => []),
    onvoiceschanged: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as SpeechSynthesis;
  vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);
  vi.stubGlobal('speechSynthesis', synth);
}

const spoken = () => vi.mocked(synth.speak).mock.calls.map((c) => (c[0] as unknown as MockUtterance).text);
const tick = () => new Promise<void>((r) => setTimeout(r, 5));

/** Ends the utterance that is playing, as the engine does at the end of a sentence. */
async function endCurrent() {
  const u = live.shift();
  u?.onend?.(new Event('end'));
  await tick();
}

async function fresh() {
  vi.resetModules();
  return await import('../../src/audio/speech.ts');
}

const THREE = 'First sentence. Second sentence! Third sentence?';

beforeEach(() => {
  vi.restoreAllMocks();
  install();
});

describe('the tutor speaks sentence by sentence and keeps its place', () => {
  it('speaks each sentence in turn and ends idle', async () => {
    const s = await fresh();
    const done = s.sayAsTutor(THREE);
    expect(spoken()).toEqual(['First sentence.']);
    expect(s.getTutorSpeech()).toMatchObject({ status: 'playing', index: 0, total: 3 });
    await endCurrent();
    expect(spoken()).toEqual(['First sentence.', 'Second sentence!']);
    expect(s.getTutorSpeech().index).toBe(1);
    await endCurrent();
    await endCurrent();
    await done;
    expect(spoken()).toHaveLength(3);
    expect(s.getTutorSpeech().status).toBe('idle');
  });

  it('does not split a decimal number', async () => {
    const s = await fresh();
    void s.sayAsTutor('Add 3.5 and 2.');
    expect(spoken()).toEqual(['Add 3.5 and 2.']);
  });

  it('pausing keeps the sentence reached and says nothing more', async () => {
    const s = await fresh();
    void s.sayAsTutor(THREE);
    await endCurrent();
    s.pauseTutorSpeech();
    await tick();
    expect(s.getTutorSpeech()).toMatchObject({ status: 'paused', index: 1, total: 3 });
    expect(synth.cancel).toHaveBeenCalled();
    expect(spoken()).toEqual(['First sentence.', 'Second sentence!']);
  });

  it('resuming speaks on from the kept sentence, not from the start', async () => {
    const s = await fresh();
    void s.sayAsTutor(THREE);
    await endCurrent();
    s.pauseTutorSpeech();
    await tick();
    s.resumeTutorSpeech();
    expect(spoken().slice(2)).toEqual(['Second sentence!']);
    expect(s.getTutorSpeech().status).toBe('playing');
    await endCurrent();
    await endCurrent();
    await tick();
    expect(spoken().slice(2)).toEqual(['Second sentence!', 'Third sentence?']);
    expect(s.getTutorSpeech().status).toBe('idle');
  });

  it('restart speaks from the first sentence, playing or paused', async () => {
    const s = await fresh();
    void s.sayAsTutor(THREE);
    await endCurrent();
    s.restartTutorSpeech();
    await tick();
    expect(spoken().slice(2)).toEqual(['First sentence.']);
    expect(s.getTutorSpeech()).toMatchObject({ status: 'playing', index: 0 });
    s.pauseTutorSpeech();
    await tick();
    s.restartTutorSpeech();
    expect(spoken().slice(3)).toEqual(['First sentence.']);
    expect(s.getTutorSpeech().status).toBe('playing');
  });

  it('stop ends it: nothing is kept and a resume does nothing', async () => {
    const s = await fresh();
    const done = s.sayAsTutor(THREE);
    s.stopSpeaking();
    await done;
    expect(s.getTutorSpeech().status).toBe('idle');
    s.resumeTutorSpeech();
    expect(spoken()).toEqual(['First sentence.']);
  });

  it('a second sayAsTutor replaces the first: the first is not spoken to its end, and nothing queues', async () => {
    const s = await fresh();
    const first = s.sayAsTutor(THREE);
    s.sayAsTutor('Something new. Quite new.');
    await tick();
    await first;
    expect(spoken()).toEqual(['First sentence.', 'Something new.']);
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    await endCurrent();
    await endCurrent();
    await tick();
    expect(spoken()).toEqual(['First sentence.', 'Something new.', 'Quite new.']);
  });

  it('new speech replaces a paused one, which cannot be resumed any more', async () => {
    const s = await fresh();
    void s.sayAsTutor(THREE);
    s.pauseTutorSpeech();
    await tick();
    void s.sayAsTutor('Fresh start.');
    expect(spoken()).toEqual(['First sentence.', 'Fresh start.']);
    expect(s.getTutorSpeech()).toMatchObject({ status: 'playing', total: 1 });
  });

  it('tells subscribers when the state changes', async () => {
    const s = await fresh();
    const seen: string[] = [];
    const off = s.subscribeTutorSpeech(() => seen.push(s.getTutorSpeech().status));
    void s.sayAsTutor(THREE);
    s.pauseTutorSpeech();
    off();
    expect(seen).toContain('playing');
    expect(seen).toContain('paused');
  });
});

describe('single words are untouched', () => {
  it('sayWord shows no bar state and does not touch the tutor speech', async () => {
    const s = await fresh();
    const done = s.sayWord('cat');
    expect(s.getTutorSpeech().status).toBe('idle');
    expect(synth.cancel).not.toHaveBeenCalled();
    await endCurrent();
    await done;
    expect(s.getTutorSpeech().status).toBe('idle');
  });

  it('a word spoken while the tutor plays pauses the tutor, leaving Resume', async () => {
    const s = await fresh();
    void s.sayAsTutor(THREE);
    void s.sayWord('cat');
    await tick();
    expect(s.getTutorSpeech()).toMatchObject({ status: 'paused', index: 0 });
    expect(spoken()).toEqual(['First sentence.', 'cat']);
  });
});

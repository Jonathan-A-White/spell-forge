// mw-bhvxcn.9: the read-aloud turn on the Tutor screen: hold 'Read it', release to send the clip with the target
// text, then the answer's action rendered. A fake recorder (the real one is tested in audio-recorder.test.ts), a
// fake grist client and a fake voice stand in; the tutor's Dexie tables and the real GristInFlight run for real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PrivateKey } from '@bsv/sdk';
import { db } from '../../src/data/db';
import { tutorRepo } from '../../src/data/repositories';
import type { Profile, TutorAnswer, TutorReadingResult } from '../../src/contracts';
import { TutorScreen } from '../../src/features/tutor';
import type { TutorDeps } from '../../src/features/tutor';
import { MicUnavailable } from '../../src/audio';
import type { Recording } from '../../src/audio';
import type { ReadAnswerParams, ReadAnswerResult, SendGristParams } from '../../src/grist';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { paulProfile } from '../fixtures/profiles';

const key = PrivateKey.fromRandom();
const PROBLEM = 'The character has 3 apples and buys 4 more.';
const profile: Profile = { ...paulProfile, settings: { ...DEFAULT_SETTINGS } };

const reading = (over: Partial<TutorAnswer> = {}): TutorAnswer => ({
  action: 'continue',
  focus_words: [],
  prompt_to_child: 'That was clear.',
  layer_diagnosis: 'none',
  ...over,
});

const clip = (durationMs = 2000, mime = 'audio/webm'): Recording => ({
  blob: new Blob([new Uint8Array([9, 8, 7])], { type: mime }),
  mime,
  durationMs,
});

/** A recorder that is told what to give back; `limit` plays the 60 s cap. */
function fakeRecorders() {
  const state = {
    clip: clip(),
    startError: undefined as Error | undefined,
    started: 0,
    onLimit: undefined as ((r: Recording) => void) | undefined,
  };
  const create = (onLimit: (r: Recording) => void) => {
    state.onLimit = onLimit;
    return {
      start: async () => {
        if (state.startError) throw state.startError;
        state.started += 1;
      },
      stop: async () => state.clip,
      cancel: () => undefined,
    };
  };
  return { state, create };
}

function fakeFactory() {
  const factory = {
    sends: [] as SendGristParams[],
    answers: new Map<string, ReadAnswerResult<TutorAnswer>>(),
    sendGrist: undefined as unknown as NonNullable<TutorDeps['sendGrist']>,
    read: undefined as unknown as NonNullable<TutorDeps['read']>,
  };
  factory.sendGrist = vi.fn(async (params: SendGristParams) => {
    factory.sends.push(params);
    return { txid: `direct:${factory.sends.length}`, seq: 1, mill: 'aa' };
  });
  factory.read = async (params: ReadAnswerParams<TutorAnswer>) => factory.answers.get(params.txid) ?? { pending: true, next: 1 };
  return factory;
}

async function setup(over: Partial<TutorDeps> = {}) {
  await db.profiles.put(profile);
  const session = await tutorRepo.createSession({ profileId: profile.id, strictness: 'meaning-gated', problemKind: 'word', targetText: PROBLEM });
  await tutorRepo.addCorrection({ sessionId: session.id, strictness: 'meaning-gated', text: PROBLEM });
  const factory = fakeFactory();
  const recorders = fakeRecorders();
  const say = vi.fn(async () => undefined);
  const deps: TutorDeps = {
    sendGrist: factory.sendGrist,
    read: factory.read,
    getKey: async () => key,
    pollIntervalMs: 20,
    createRecorder: recorders.create,
    say,
    ...over,
  };
  render(<TutorScreen profile={profile} onBack={vi.fn()} deps={deps} />);
  return { session, factory, recorders, say };
}

/** Holds the button and lets go. */
async function readIt(name = 'Read it') {
  const button = await screen.findByRole('button', { name });
  fireEvent.pointerDown(button);
  await waitFor(() => expect(screen.getByRole('button', { name: /Let go/ })).toBeInTheDocument());
  fireEvent.pointerUp(screen.getByRole('button', { name: /Let go/ }));
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('hold to read', () => {
  it("offers a big 'Read it' under the problem once it is shown", async () => {
    await setup();
    expect(await screen.findByRole('button', { name: 'Read it' })).toBeInTheDocument();
    expect(screen.getByText(PROBLEM)).toBeInTheDocument();
  });

  it('holds to record with a red dot and the seconds, and sends the clip as a reading turn on release', async () => {
    const { factory, session } = await setup();
    const button = await screen.findByRole('button', { name: 'Read it' });
    fireEvent.pointerDown(button);
    expect(await screen.findByTestId('recording-dot')).toBeInTheDocument();
    expect(screen.getByText(/^\d+ seconds?$/)).toBeInTheDocument();
    expect(factory.sends).toHaveLength(0);

    fireEvent.pointerUp(screen.getByRole('button', { name: /Let go/ }));
    await waitFor(() => expect(factory.sends).toHaveLength(1));

    const sent = factory.sends[0];
    expect(sent.input).toEqual({ mode: 'reading', strictness: 'meaning-gated', target_text: PROBLEM, session_history: [] });
    expect(sent.files).toHaveLength(1);
    expect(sent.files?.[0].mime).toBe('audio/webm');
    expect(sent.files?.[0].name).toBe('reading-1.webm');
    expect(Array.from(sent.files?.[0].bytes ?? [])).toEqual([9, 8, 7]);

    // waiting: 'Thinking about your reading...' with seconds
    expect(await screen.findByText('Thinking about your reading...')).toBeInTheDocument();
    expect(screen.getByText(/^\d+ seconds?$/)).toBeInTheDocument();

    // kept: the turn holds the audio blob
    const turns = await tutorRepo.listTurns(session.id);
    const turn = turns.find((t) => t.mode === 'reading');
    expect(turn?.attachments).toHaveLength(1);
    expect(turn?.attachments[0].kind).toBe('audio');
    const blob = await tutorRepo.getBlob(turn?.attachments[0].blobId as string);
    expect(blob).toMatchObject({ mime: 'audio/webm', name: 'reading-1.webm' });
  });

  it("says 'Hold while you read' for a tap under half a second, and sends nothing", async () => {
    const { factory, recorders } = await setup();
    recorders.state.clip = clip(200);
    await readIt();
    expect(await screen.findByText('Hold while you read')).toBeInTheDocument();
    expect(factory.sends).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Read it' })).toBeInTheDocument();
  });

  it('names an mp4 clip reading-1.mp4', async () => {
    const { factory, recorders } = await setup();
    recorders.state.clip = clip(2000, 'audio/mp4');
    await readIt();
    await waitFor(() => expect(factory.sends).toHaveLength(1));
    expect(factory.sends[0].files?.[0]).toMatchObject({ mime: 'audio/mp4', name: 'reading-1.mp4' });
  });

  it('says a plain line when the microphone is refused, and sends nothing', async () => {
    const { factory, recorders } = await setup();
    recorders.state.startError = new MicUnavailable('The microphone is turned off for this page.');
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Read it' }));
    expect(await screen.findByText('The microphone is turned off for this page.')).toBeInTheDocument();
    expect(factory.sends).toHaveLength(0);
  });

  it('sends the clip when the 60 s cap stops the recording, and the late release sends nothing more', async () => {
    const { factory, recorders } = await setup();
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Read it' }));
    await screen.findByTestId('recording-dot');
    act(() => recorders.state.onLimit?.(clip(60_000)));
    await waitFor(() => expect(factory.sends).toHaveLength(1));
    const release = screen.queryByRole('button', { name: /Let go/ });
    if (release) fireEvent.pointerUp(release);
    await new Promise((r) => setTimeout(r, 100));
    expect(factory.sends).toHaveLength(1);
  });
});

describe('push to talk (mw-kuy7rx.5)', () => {
  const vibrate = vi.fn();
  beforeEach(() => {
    vibrate.mockClear();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true });
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'vibrate');
  });

  /** A recorder whose start the test opens by hand, logging what happens in order. */
  function gatedRecorder() {
    const order: string[] = [];
    let open: () => void = () => undefined;
    const canceled = vi.fn();
    const create = () => ({
      start: () => {
        order.push('recorder.start');
        return new Promise<void>((resolve) => {
          open = () => {
            order.push('recording');
            resolve();
          };
        });
      },
      stop: async () => clip(),
      cancel: () => {
        canceled();
        order.push('recorder.cancel');
      },
    });
    return { order, create, canceled, open: () => open() };
  }

  const BOX = { left: 100, top: 100, right: 300, bottom: 200, width: 200, height: 100, x: 100, y: 100, toJSON: () => ({}) };
  const slide = (button: HTMLElement, clientX: number, clientY: number) => {
    button.getBoundingClientRect = () => BOX as DOMRect;
    const event = new MouseEvent('pointermove', { bubbles: true, clientX, clientY });
    act(() => {
      button.dispatchEvent(event);
    });
  };

  it('cancels the tutor talking on press, before the recorder starts', async () => {
    const g = gatedRecorder();
    const stopSpeaking = vi.fn(() => g.order.push('stopSpeaking'));
    await setup({ createRecorder: g.create, stopSpeaking });
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Read it' }));
    await waitFor(() => expect(g.order).toContain('recorder.start'));
    expect(stopSpeaking).toHaveBeenCalledTimes(1);
    expect(g.order.indexOf('stopSpeaking')).toBeLessThan(g.order.indexOf('recorder.start'));
  });

  it('buzzes 30 ms only once the recorder is actually recording, and 15 ms on release', async () => {
    const g = gatedRecorder();
    await setup({ createRecorder: g.create });
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Read it' }));
    await waitFor(() => expect(g.order).toContain('recorder.start'));
    expect(vibrate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('recording-dot')).not.toBeInTheDocument();

    await act(async () => g.open());
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenLastCalledWith(30);
    expect(await screen.findByTestId('recording-dot')).toBeInTheDocument();

    fireEvent.pointerUp(screen.getByRole('button', { name: /Let go/ }));
    expect(vibrate).toHaveBeenCalledTimes(2);
    expect(vibrate).toHaveBeenLastCalledWith(15);
  });

  it('drops the attempt when he slides more than 40 px off the button: nothing is sent, the clip is discarded', async () => {
    const g = gatedRecorder();
    const { factory } = await setup({ createRecorder: g.create });
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Read it' }));
    await act(async () => g.open());
    const button = await screen.findByRole('button', { name: 'Let go to send' });

    slide(button, 320, 150); // 20 px off the right edge: still on
    expect(screen.getByRole('button', { name: 'Let go to send' })).toBeInTheDocument();

    slide(button, 350, 150); // 50 px off
    expect(screen.getByRole('button', { name: 'Let go to drop' })).toBeInTheDocument();

    vibrate.mockClear();
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Let go to drop' }));
    expect(await screen.findByText('Dropped. Hold to try again')).toBeInTheDocument();
    expect(g.canceled).toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith([30, 50, 30]);
    await new Promise((r) => setTimeout(r, 100));
    expect(factory.sends).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Read it' })).toBeInTheDocument();
  });

  it('sliding back onto the button keeps the attempt', async () => {
    const g = gatedRecorder();
    const { factory } = await setup({ createRecorder: g.create });
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Read it' }));
    await act(async () => g.open());
    const button = await screen.findByRole('button', { name: 'Let go to send' });
    slide(button, 50, 150);
    expect(screen.getByRole('button', { name: 'Let go to drop' })).toBeInTheDocument();
    slide(button, 150, 150);
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Let go to send' }));
    await waitFor(() => expect(factory.sends).toHaveLength(1));
  });

  it('holds a reply that arrives mid-hold until he lets go', async () => {
    const { factory, say } = await setup();
    await readIt();
    await waitFor(() => expect(factory.sends).toHaveLength(1));
    await screen.findByText('Thinking about your reading...');

    // he presses again, and the reply to the first reading arrives while he holds
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Read it' }));
    await screen.findByTestId('recording-dot');
    factory.answers.set('direct:1', {
      answer: { status: 'answered', answer: reading({ action: 'encourage', prompt_to_child: 'Nearly there.' }) },
      next: 2,
    });
    await screen.findByText('Nearly there.', undefined, { timeout: 3000 });
    expect(say).not.toHaveBeenCalled();

    fireEvent.pointerUp(screen.getByRole('button', { name: /Let go/ }));
    await waitFor(() => expect(say).toHaveBeenCalledWith('Nearly there.'));
  });
});

describe('the answer, by action', () => {
  async function answered(over: Partial<TutorAnswer>, extra: { readingResult?: unknown } = {}) {
    const ctx = await setup();
    await readIt();
    await waitFor(() => expect(ctx.factory.sends).toHaveLength(1));
    ctx.factory.answers.set('direct:1', {
      answer: { status: 'answered', answer: reading(over), ...extra } as never,
      next: 2,
    });
    return ctx;
  }

  it('reread_word: only the missed word, big, with its parts, a one-line tip, Say it again and one Read the word button', async () => {
    const { say } = await answered({
      action: 'reread_word',
      focus_words: [{ word: 'character', chunks: ['char', 'ac', 'ter'] }],
      prompt_to_child: 'Look at this word, one chunk at a time.',
    });
    expect(await screen.findByTestId('reread-word', undefined, { timeout: 3000 })).toHaveTextContent('character');
    // the whole problem and the highlight are gone
    expect(screen.queryByText(PROBLEM)).not.toBeInTheDocument();
    expect(document.querySelectorAll('mark')).toHaveLength(0);
    expect(screen.getByText('char · ac · ter')).toBeInTheDocument();
    const tip = screen.getByText('Look at this word, one chunk at a time.');
    expect(tip.className).toMatch(/line-clamp-1/);
    await waitFor(() => expect(say).toHaveBeenCalledWith('Look at this word, one chunk at a time.'));
    // one primary button, labelled Read the word; no 'Read it'
    expect(screen.getByRole('button', { name: 'Read the word' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Read it' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Say it again' }));
    await waitFor(() => expect(say).toHaveBeenCalledTimes(2));
  });

  it('sends the clip for a word reread with the one word as its target text', async () => {
    const { factory, session } = await answered({
      action: 'reread_word',
      focus_words: [{ word: 'character', chunks: ['char', 'ac', 'ter'] }],
    });
    await screen.findByRole('button', { name: 'Read the word' }, { timeout: 3000 });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Read the word' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Let go/ })).toBeInTheDocument());
    fireEvent.pointerUp(screen.getByRole('button', { name: /Let go/ }));
    await waitFor(() => expect(factory.sends).toHaveLength(2));
    expect(factory.sends[1].input).toMatchObject({ mode: 'reading', target_text: 'character' });
    const turns = await tutorRepo.listTurns(session.id);
    expect(turns.filter((t) => t.mode === 'reading').map((t) => t.request.target_text)).toEqual([PROBLEM, 'character']);
  });

  it('brings the whole problem back with Read it once the word is read clearly, and the next reading is of the whole problem', async () => {
    const { factory, say } = await answered({
      action: 'reread_word',
      focus_words: [{ word: 'character', chunks: ['char', 'ac', 'ter'] }],
    });
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Read the word' }, { timeout: 3000 }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Let go/ })).toBeInTheDocument());
    fireEvent.pointerUp(screen.getByRole('button', { name: /Let go/ }));
    await waitFor(() => expect(factory.sends).toHaveLength(2));
    factory.answers.set('direct:2', { answer: { status: 'answered', answer: reading({ action: 'continue', prompt_to_child: 'Yes, that word.' }) }, next: 3 });

    expect(await screen.findByText(PROBLEM, undefined, { timeout: 3000 })).toBeInTheDocument();
    // mw-eezwdm: the line says what the screen waits for, whatever the model said
    expect(screen.getByText('Now read the whole problem again.')).toBeInTheDocument();
    expect(say).toHaveBeenCalledWith('Now read the whole problem again.');
    expect(screen.getByRole('button', { name: 'Read it' })).toBeInTheDocument();
    expect(screen.queryByTestId('reread-word')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Read the word' })).not.toBeInTheDocument();
    // not "Nice reading" yet: the whole problem has still to be read
    expect(screen.queryByText('Nice reading')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Now the math' })).not.toBeInTheDocument();
    expect(say).not.toHaveBeenCalledWith('Yes, that word.');

    await readIt();
    await waitFor(() => expect(factory.sends).toHaveLength(3));
    expect(factory.sends[2].input).toMatchObject({ mode: 'reading', target_text: PROBLEM });
    factory.answers.set('direct:3', { answer: { status: 'answered', answer: reading({ action: 'continue' }) }, next: 4 });
    expect(await screen.findByText('Nice reading', undefined, { timeout: 3000 })).toBeInTheDocument();
  });

  it("never shows the model's 'solve' line once the word is cleared: it asks him to read the whole problem again", async () => {
    const { factory, say } = await answered({
      action: 'reread_word',
      focus_words: [{ word: 'character', chunks: ['char', 'ac', 'ter'] }],
    });
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Read the word' }, { timeout: 3000 }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Let go/ })).toBeInTheDocument());
    fireEvent.pointerUp(screen.getByRole('button', { name: /Let go/ }));
    await waitFor(() => expect(factory.sends).toHaveLength(2));
    const solve = "Great job! You looked at each sound in that last word. Now let's solve the problem.";
    factory.answers.set('direct:2', { answer: { status: 'answered', answer: reading({ action: 'continue', prompt_to_child: solve }) }, next: 3 });

    expect(await screen.findByText('Now read the whole problem again.', undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText(PROBLEM)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read it' })).toBeInTheDocument();
    expect(screen.queryByText(/solve/i)).not.toBeInTheDocument();
    expect(say).toHaveBeenCalledWith('Now read the whole problem again.');
    expect(say).not.toHaveBeenCalledWith(solve);
  });

  describe('several misreads: one word at a time, then the whole problem again (mw-7wyn4s)', () => {
    const TWO = [
      { word: 'character', chunks: ['char', 'ac', 'ter'] },
      { word: 'apples', chunks: ['ap', 'ples'] },
    ];

    /** Reads once more (the button named `name`), and has the factory answer that send with `answer`. */
    async function readAndAnswer(
      ctx: Awaited<ReturnType<typeof answered>>,
      name: string,
      answer: Partial<TutorAnswer>,
    ) {
      const sends = ctx.factory.sends.length;
      await readIt(name);
      await waitFor(() => expect(ctx.factory.sends).toHaveLength(sends + 1));
      ctx.factory.answers.set(`direct:${sends + 1}`, { answer: { status: 'answered', answer: reading(answer) }, next: sends + 2 });
    }

    it('walks him through each word in turn, then asks for the whole problem again, and only a clear whole reading moves on', async () => {
      const ctx = await answered({ action: 'reread_word', focus_words: TWO, prompt_to_child: 'Look at this word, one chunk at a time.' });
      const { factory, say } = ctx;

      // the first word, alone
      expect(await screen.findByTestId('reread-word', undefined, { timeout: 3000 })).toHaveTextContent('character');
      expect(screen.getByText('char · ac · ter')).toBeInTheDocument();
      expect(screen.queryByText(PROBLEM)).not.toBeInTheDocument();

      // read clearly: the second word, alone, with its own parts and the app's own line
      await readAndAnswer(ctx, 'Read the word', { action: 'continue', prompt_to_child: 'Yes, that word. Now solve it.' });
      await waitFor(() => expect(screen.getByTestId('reread-word')).toHaveTextContent('apples'), { timeout: 3000 });
      expect(screen.getByText('ap · ples')).toBeInTheDocument();
      expect(screen.getByText('Now this word.')).toBeInTheDocument();
      expect(say).toHaveBeenCalledWith('Now this word.');
      expect(screen.queryByText(/solve/i)).not.toBeInTheDocument();
      expect(screen.queryByText(PROBLEM)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Read the word' })).toBeInTheDocument();

      // the second word's clip carries that word
      await readAndAnswer(ctx, 'Read the word', { action: 'continue' });
      expect(factory.sends[2].input).toMatchObject({ mode: 'reading', target_text: 'apples' });

      // both clear: the whole problem, a line to read it again, 'Read it'; not yet 'Now the math'
      expect(await screen.findByText(PROBLEM, undefined, { timeout: 3000 })).toBeInTheDocument();
      expect(screen.getByText('Now read the whole problem again.')).toBeInTheDocument();
      expect(say).toHaveBeenCalledWith('Now read the whole problem again.');
      expect(screen.queryByTestId('reread-word')).not.toBeInTheDocument();
      expect(screen.queryByText('Nice reading')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Now the math' })).not.toBeInTheDocument();

      // a clear whole reading moves on
      await readAndAnswer(ctx, 'Read it', { action: 'continue' });
      expect(factory.sends[3].input).toMatchObject({ mode: 'reading', target_text: PROBLEM });
      expect(await screen.findByText('Nice reading', undefined, { timeout: 3000 })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Now the math' })).toBeInTheDocument();
    });

    it('keeps the word until it is clear, then goes on to the next', async () => {
      const ctx = await answered({ action: 'reread_word', focus_words: TWO });
      await screen.findByTestId('reread-word', undefined, { timeout: 3000 });
      await readAndAnswer(ctx, 'Read the word', { action: 'encourage', prompt_to_child: 'Nearly. Once more.' });
      expect(await screen.findByText('Nearly. Once more.', undefined, { timeout: 3000 })).toBeInTheDocument();
      expect(screen.getByTestId('reread-word')).toHaveTextContent('character');
      await readAndAnswer(ctx, 'Read the word', { action: 'continue' });
      await waitFor(() => expect(screen.getByTestId('reread-word')).toHaveTextContent('apples'), { timeout: 3000 });
    });

    it('starts the loop again when the new whole reading has misreads', async () => {
      const ctx = await answered({ action: 'reread_word', focus_words: TWO });
      await screen.findByTestId('reread-word', undefined, { timeout: 3000 });
      await readAndAnswer(ctx, 'Read the word', { action: 'continue' });
      await waitFor(() => expect(screen.getByTestId('reread-word')).toHaveTextContent('apples'), { timeout: 3000 });
      await readAndAnswer(ctx, 'Read the word', { action: 'continue' });
      await screen.findByText('Now read the whole problem again.', undefined, { timeout: 3000 });

      // the whole problem read again, one word still wrong
      await readAndAnswer(ctx, 'Read it', { action: 'reread_word', focus_words: [TWO[1]], prompt_to_child: 'Look at this one.' });
      await waitFor(() => expect(screen.getByTestId('reread-word')).toHaveTextContent('apples'), { timeout: 3000 });
      expect(screen.getByText('Look at this one.')).toBeInTheDocument();
      expect(screen.queryByText('Nice reading')).not.toBeInTheDocument();

      await readAndAnswer(ctx, 'Read the word', { action: 'continue' });
      expect(await screen.findByText('Now read the whole problem again.', undefined, { timeout: 3000 })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Read it' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Now the math' })).not.toBeInTheDocument();
    });
  });

  it('keeps the word on screen when the next answer to the word reread is encouragement', async () => {
    const { factory } = await answered({
      action: 'reread_word',
      focus_words: [{ word: 'character', chunks: ['char', 'ac', 'ter'] }],
    });
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Read the word' }, { timeout: 3000 }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Let go/ })).toBeInTheDocument());
    fireEvent.pointerUp(screen.getByRole('button', { name: /Let go/ }));
    await waitFor(() => expect(factory.sends).toHaveLength(2));
    factory.answers.set('direct:2', { answer: { status: 'answered', answer: reading({ action: 'encourage', prompt_to_child: 'Nearly. Once more.' }) }, next: 3 });
    expect(await screen.findByText('Nearly. Once more.', undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByTestId('reread-word')).toHaveTextContent('character');
    expect(screen.getByRole('button', { name: 'Read the word' })).toBeInTheDocument();
  });

  it('sound_out is shown like reread_word', async () => {
    await answered({ action: 'sound_out', focus_words: [{ word: 'apples', chunks: ['ap', 'ples'] }], prompt_to_child: 'Start with the first sound.' });
    expect(await screen.findByText('apples', { selector: 'mark' }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('ap · ples')).toBeInTheDocument();
  });

  it('falls back to the syllabifier when the grist gives no chunks', async () => {
    await answered({ action: 'reread_word', focus_words: [{ word: 'character', chunks: [] }] });
    await screen.findByTestId('reread-word', undefined, { timeout: 3000 });
    const shown = screen.getByTestId('focus-chunks').textContent ?? '';
    expect(shown.replace(/\s/g, '').replace(/·/g, '')).toBe('character');
    expect(shown).toContain('·');
  });

  it('reread_sentence: the whole text highlighted and the prompt spoken', async () => {
    const { say } = await answered({
      action: 'reread_sentence',
      focus_words: [{ word: 'apples', chunks: ['ap', 'ples'] }],
      prompt_to_child: 'Read the whole sentence again.',
    });
    const mark = await screen.findByText(PROBLEM, { selector: 'mark' }, { timeout: 3000 });
    expect(mark).toBeInTheDocument();
    await waitFor(() => expect(say).toHaveBeenCalledWith('Read the whole sentence again.'));
    expect(screen.getByRole('button', { name: 'Read it' })).toBeInTheDocument();
  });

  it('encourage: the prompt spoken and Read it offered again', async () => {
    const { say } = await answered({ action: 'encourage', prompt_to_child: 'Good try. Have another go.' });
    expect(await screen.findByText('Good try. Have another go.', undefined, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => expect(say).toHaveBeenCalledWith('Good try. Have another go.'));
    expect(screen.getByRole('button', { name: 'Read it' })).toBeInTheDocument();
    expect(screen.queryByText('Thinking about your reading...')).not.toBeInTheDocument();
  });

  it("continue: 'Nice reading', and 'Now the math' ends the reading loop", async () => {
    await answered({ action: 'continue' });
    expect(await screen.findByText('Nice reading', undefined, { timeout: 3000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Now the math' }));
    expect(screen.queryByRole('button', { name: 'Read it' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Now the math' })).not.toBeInTheDocument();
  });

  it('keeps the reading result of both engines when the answer echoes it', async () => {
    const result = (engine: string): TutorReadingResult['azure'] => ({ engine, words: [], accuracy: 91, seconds: 2 });
    await answered({ action: 'continue' }, { readingResult: { azure: result('azure'), local: result('local'), junk: 1 } });
    await screen.findByText('Nice reading', undefined, { timeout: 3000 });
    const turn = (await db.tutorTurns.toArray()).find((t) => t.mode === 'reading');
    expect(turn?.readingResult).toEqual({ azure: result('azure'), local: result('local') });
  });

  it("keeps the grist's notes when the answer echoes no reading result", async () => {
    await answered({ action: 'continue', notes_for_parent: 'Read every word well.' });
    await screen.findByText('Nice reading', undefined, { timeout: 3000 });
    const turn = (await db.tutorTurns.toArray()).find((t) => t.mode === 'reading');
    expect(turn?.readingResult).toBeUndefined();
    expect(turn?.readingNotes).toBe('Read every word well.');
  });

  it('says why when the factory refuses the reading, and offers Read it again', async () => {
    const { factory } = await setup();
    await readIt();
    await waitFor(() => expect(factory.sends).toHaveLength(1));
    factory.answers.set('direct:1', { answer: { status: 'failed', reason: 'The listening check was not working.' }, next: 2 });
    expect(await screen.findByText('The listening check was not working.', undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read it' })).toBeInTheDocument();
  });
});

describe('the reread loop', () => {
  it('sends the earlier answers as the compact session history, and numbers the clips', async () => {
    const { factory } = await setup();
    await readIt();
    await waitFor(() => expect(factory.sends).toHaveLength(1));
    factory.answers.set('direct:1', {
      answer: { status: 'answered', answer: reading({ action: 'reread_word', prompt_to_child: 'Try that word again.', focus_words: [{ word: 'character', chunks: ['char', 'ac', 'ter'] }] }) },
      next: 2,
    });
    await screen.findByText('Try that word again.', undefined, { timeout: 3000 });

    await readIt('Read the word');
    await waitFor(() => expect(factory.sends).toHaveLength(2));
    expect(factory.sends[1].files?.[0].name).toBe('reading-2.webm');
    expect(factory.sends[1].input).toMatchObject({
      mode: 'reading',
      session_history: [{ mode: 'reading', action: 'reread_word', prompt_to_child: 'Try that word again.' }],
    });
  });

  it('keeps an answer that arrives after he has read again, marks it stale, and does not show it', async () => {
    const { factory, session, say } = await setup();
    await readIt();
    await waitFor(() => expect(factory.sends).toHaveLength(1));

    // he reads again before the first answer comes
    await readIt();
    await waitFor(() => expect(factory.sends).toHaveLength(2));

    factory.answers.set('direct:1', {
      answer: { status: 'answered', answer: reading({ action: 'reread_word', prompt_to_child: 'LATE PROMPT', focus_words: [{ word: 'apples', chunks: ['ap', 'ples'] }] }) },
      next: 2,
    });
    await waitFor(async () => {
      const turns = await tutorRepo.listTurns(session.id);
      expect(turns.find((t) => t.txid === 'direct:1')?.status).toBe('stale');
    });
    const stale = (await tutorRepo.listTurns(session.id)).find((t) => t.txid === 'direct:1');
    expect(stale?.answer?.prompt_to_child).toBe('LATE PROMPT');
    expect(screen.queryByText('LATE PROMPT')).not.toBeInTheDocument();
    expect(document.querySelectorAll('mark')).toHaveLength(0);
    expect(say).not.toHaveBeenCalledWith('LATE PROMPT');
    // the second reading is still being answered
    expect(screen.getByText('Thinking about your reading...')).toBeInTheDocument();
    expect(within(document.body).getByRole('button', { name: 'Read it' })).toBeInTheDocument();
  });
});

describe('pickReadingResult', () => {
  it('keeps each engine that scored, drops one that failed, and says nothing when none did', async () => {
    const { pickReadingResult } = await import('../../src/grist');
    const local = { engine: 'local', words: [], accuracy: 80, seconds: 1.5 };
    expect(pickReadingResult({ local, azure: { error: 'the azure key was refused' } })).toEqual({ local });
    expect(pickReadingResult({ azure: { error: 'x' } })).toBeUndefined();
    expect(pickReadingResult('nope')).toBeUndefined();
    expect(pickReadingResult(undefined)).toBeUndefined();
  });
});

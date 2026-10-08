// mw-bhvxcn.10: the maths turn on the Tutor screen: a typed answer and/or a photo of his work goes as a math turn,
// the diagnosis is shown without the answer, 'done' ends the session well, 'Stop for now' ends it at any point.
// A fake grist client and a fake voice stand in; the tutor's Dexie tables and the real GristInFlight run for real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PrivateKey } from '@bsv/sdk';
import { db } from '../../src/data/db';
import { tutorRepo } from '../../src/data/repositories';
import type { Profile, TutorAnswer } from '../../src/contracts';
import { TutorScreen, sendMath, sessionHistory, TutorUserError } from '../../src/features/tutor';
import type { TutorDeps } from '../../src/features/tutor';
import { TUTOR_TURN_GRIND } from '../../src/grist';
import type { ReadAnswerParams, ReadAnswerResult, SendGristParams } from '../../src/grist';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { paulProfile } from '../fixtures/profiles';
import { EXPECTED_ANSWER, MATH_PROBLEM, mathAnswer } from '../fixtures/tutor-math';

const key = PrivateKey.fromRandom();
const profile: Profile = { ...paulProfile, settings: { ...DEFAULT_SETTINGS } };

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

/** A session whose problem is shown and whose reading is clear; the screen is opened on it. */
async function setup(over: Partial<TutorDeps> = {}, opts: { clickMaths?: boolean } = {}) {
  await db.profiles.put(profile);
  const session = await tutorRepo.createSession({ profileId: profile.id, strictness: 'meaning-gated', problemKind: 'word', targetText: MATH_PROBLEM });
  await tutorRepo.addCorrection({ sessionId: session.id, strictness: 'meaning-gated', text: MATH_PROBLEM });
  const reading = await tutorRepo.addTurn({
    sessionId: session.id,
    mode: 'reading',
    request: { mode: 'reading', strictness: 'meaning-gated', target_text: MATH_PROBLEM, session_history: [] },
  });
  await tutorRepo.markSent(reading.id, { txid: 'seed-reading', seq: 1, mill: 'aa' });
  await tutorRepo.applyAnswer('seed-reading', { status: 'answered', answer: mathAnswer({ action: 'continue', layer_diagnosis: 'none', math_diagnosis: undefined, prompt_to_child: 'That was clear.' }) });

  const factory = fakeFactory();
  const say = vi.fn(async () => undefined);
  const shrink = vi.fn(async (blob: Blob) => ({ bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg', name: 'photo.jpg' }));
  const deps: TutorDeps = { sendGrist: factory.sendGrist, read: factory.read, getKey: async () => key, shrink, pollIntervalMs: 20, say, ...over };
  const onBack = vi.fn();
  render(<TutorScreen profile={profile} onBack={onBack} deps={deps} />);
  if (opts.clickMaths !== false) fireEvent.click(await screen.findByRole('button', { name: 'Now the math' }));
  return { session, factory, say, shrink, onBack };
}

const typeAnswer = async (value: string) => fireEvent.change(await screen.findByLabelText('Your answer'), { target: { value } });
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Send' }));
const pickPhoto = async (name = 'IMG_1.jpg') => {
  const input = (await screen.findByTestId('tutor-work-photo-input')) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([new Uint8Array([4, 5, 6])], name, { type: 'image/jpeg' })] } });
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('sending a maths turn', () => {
  it("opens on 'Your answer' and 'Photo of your work' once the reading is clear", async () => {
    await setup();
    expect(await screen.findByLabelText('Your answer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Photo of your work' })).toBeInTheDocument();
    expect(screen.getByText(MATH_PROBLEM)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Read it' })).not.toBeInTheDocument();
  });

  it('sends the typed answer as a math turn with the target text and the session history', async () => {
    const { factory, session } = await setup();
    await typeAnswer('8');
    send();
    await waitFor(() => expect(factory.sends).toHaveLength(1));
    const sent = factory.sends[0];
    expect(sent.header).toEqual(TUTOR_TURN_GRIND);
    expect(sent.input).toEqual({
      mode: 'math',
      strictness: 'meaning-gated',
      target_text: MATH_PROBLEM,
      child_answer: '8',
      session_history: [{ mode: 'reading', action: 'continue', prompt_to_child: 'That was clear.' }],
    });
    expect(sent.files).toBeUndefined();
    expect(await screen.findByText('Checking...')).toBeInTheDocument();
    const turn = (await tutorRepo.listTurns(session.id)).find((t) => t.mode === 'math');
    expect(turn).toMatchObject({ status: 'waiting', txid: 'direct:1', request: { child_answer: '8' } });
  });

  it('sends the photo of his work as work-1.jpg beside the answer, and keeps it in the session', async () => {
    const { factory, session, shrink } = await setup();
    await typeAnswer('8');
    await pickPhoto();
    expect(await screen.findByText('Photo ready: IMG_1.jpg')).toBeInTheDocument();
    send();
    await waitFor(() => expect(factory.sends).toHaveLength(1));
    expect(shrink).toHaveBeenCalledTimes(1);
    const sent = factory.sends[0];
    expect(sent.input).toMatchObject({ mode: 'math', child_answer: '8', work_photo: true });
    expect(sent.files).toHaveLength(1);
    expect(sent.files?.[0]).toMatchObject({ mime: 'image/jpeg', name: 'work-1.jpg' });
    expect(Array.from(sent.files?.[0].bytes ?? [])).toEqual([4, 5, 6]);

    const turn = (await tutorRepo.listTurns(session.id)).find((t) => t.mode === 'math');
    expect(turn?.attachments).toHaveLength(1);
    expect(turn?.attachments[0].kind).toBe('work');
    expect(await tutorRepo.getBlob(turn?.attachments[0].blobId as string)).toMatchObject({ mime: 'image/jpeg', name: 'work-1.jpg' });
  });

  it('sends a photo alone, with no typed answer', async () => {
    const { factory } = await setup();
    await pickPhoto();
    send();
    await waitFor(() => expect(factory.sends).toHaveLength(1));
    const input = factory.sends[0].input as Record<string, unknown>;
    expect(input.mode).toBe('math');
    expect(input.work_photo).toBe(true);
    expect(input).not.toHaveProperty('child_answer');
  });

  it('numbers the work photos by maths turn: the second is work-2.jpg', async () => {
    const { factory } = await setup();
    await pickPhoto();
    send();
    await waitFor(() => expect(factory.sends).toHaveLength(1));
    factory.answers.set('direct:1', { answer: { status: 'answered', answer: mathAnswer() }, next: 2 });
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }, { timeout: 3000 }));
    await pickPhoto('IMG_2.jpg');
    send();
    await waitFor(() => expect(factory.sends).toHaveLength(2));
    expect(factory.sends[1].files?.[0].name).toBe('work-2.jpg');
    expect(factory.sends[1].input).toMatchObject({
      session_history: [
        { mode: 'reading', action: 'continue' },
        { mode: 'math', action: 'math_probe' },
      ],
    });
  });

  it('has nothing to send until there is an answer or a photo: Send is off and sendMath refuses', async () => {
    const { factory, session } = await setup();
    await screen.findByLabelText('Your answer');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await typeAnswer('   ');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    send();
    expect(factory.sends).toHaveLength(0);

    await expect(sendMath({ session, targetText: MATH_PROBLEM, answer: '  ' }, { getKey: async () => key, sendGrist: factory.sendGrist })).rejects.toBeInstanceOf(TutorUserError);
    expect(factory.sends).toHaveLength(0);
    expect((await tutorRepo.listTurns(session.id)).filter((t) => t.mode === 'math')).toHaveLength(0);
  });

  it('says plainly when the send fails, and keeps what he typed', async () => {
    const factory = fakeFactory();
    const failing = vi.fn(async () => {
      throw new Error('boom');
    });
    await setup({ sendGrist: failing as never });
    await typeAnswer('8');
    send();
    expect(await screen.findByText('Your answer could not be sent. You can try again.')).toBeInTheDocument();
    expect(screen.getByLabelText('Your answer')).toHaveValue('8');
    expect(factory.sends).toHaveLength(0);
  });
});

describe('the answer, by action', () => {
  async function answered(over: Partial<TutorAnswer>) {
    const ctx = await setup();
    await typeAnswer('8');
    send();
    await waitFor(() => expect(ctx.factory.sends).toHaveLength(1));
    ctx.factory.answers.set('direct:1', { answer: { status: 'answered', answer: mathAnswer(over) }, next: 2 });
    return ctx;
  }

  it('math_probe: only the prompt to him is shown and spoken, none of the diagnosis, then Try again', async () => {
    const { say } = await answered({});
    expect(await screen.findByText('Look at what Anna starts with. What happens when she buys more?', undefined, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => expect(say).toHaveBeenCalledWith('Look at what Anna starts with. What happens when she buys more?'));
    expect(screen.queryByLabelText('Your answer')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'What to look at' })).not.toBeInTheDocument();
    expect(screen.queryByText('What to look at')).not.toBeInTheDocument();
    const shown = document.body.textContent ?? '';
    expect(shown).not.toContain('you took the apples away instead of putting them together');
    expect(shown).not.toContain('knowing that buying more means adding');
    expect(shown).not.toContain('counting on from the bigger number');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Your answer')).toHaveValue('');
  });

  it('no-answer guard: the screen never shows the answer to the problem', async () => {
    await answered({});
    await screen.findByRole('button', { name: 'Try again' }, { timeout: 3000 });
    const shown = document.body.textContent ?? '';
    expect(shown).not.toMatch(new RegExp(`(?<![\\d.])${EXPECTED_ANSWER}(?![\\d.])`));
    // not even the method before he has got it
    expect(shown).not.toContain('counting on from the bigger number');
  });

  it('encourage: the prompt spoken and the answer boxes ready for another go', async () => {
    const { say } = await answered({ action: 'encourage', math_diagnosis: undefined, prompt_to_child: 'Good try. Have another go.' });
    expect(await screen.findByText('Good try. Have another go.', undefined, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => expect(say).toHaveBeenCalledWith('Good try. Have another go.'));
    expect(screen.getByLabelText('Your answer')).toBeInTheDocument();
  });

  it('rewrite: the tip spoken, no maths diagnosis shown, and the boxes ready for a new photo', async () => {
    const prompt = 'Your 3s face the other way. Write them again, then take a new photo.';
    const { say } = await answered({ action: 'rewrite', math_diagnosis: undefined, layer_diagnosis: 'none', prompt_to_child: prompt });
    expect(await screen.findByText(prompt, undefined, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => expect(say).toHaveBeenCalledWith(prompt));
    expect(screen.queryByRole('region', { name: 'What to look at' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Photo of your work' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your answer')).toBeInTheDocument();
  });

  it("confirm_answer: \"That's it\" and the prompt to him, not the method or its heading", async () => {
    const { say } = await answered({ action: 'confirm_answer', prompt_to_child: 'You got it by counting on.', layer_diagnosis: 'none' });
    expect(await screen.findByText("That's it", undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('You got it by counting on.')).toBeInTheDocument();
    expect(screen.queryByText('The way you did it')).not.toBeInTheDocument();
    expect(screen.queryByText('counting on from the bigger number')).not.toBeInTheDocument();
    expect(screen.queryByText('What to look at')).not.toBeInTheDocument();
    await waitFor(() => expect(say).toHaveBeenCalledWith('You got it by counting on.'));
    expect(screen.queryByRole('region', { name: 'What to look at' })).not.toBeInTheDocument();
  });

  it('done: the closing line spoken and shown, and the session ends (endedAt set)', async () => {
    const { say, session } = await answered({ action: 'done', math_diagnosis: undefined, layer_diagnosis: 'none', prompt_to_child: 'Lovely work today. See you next time.' });
    // the line moves from the answer to the farewell as the session ends, so look it up afresh each time
    await waitFor(() => expect(screen.getByText('Lovely work today. See you next time.')).toBeInTheDocument(), { timeout: 3000 });
    await waitFor(() => expect(say).toHaveBeenCalledWith('Lovely work today. See you next time.'));
    await waitFor(async () => expect((await tutorRepo.getSession(session.id))?.endedAt).toBeInstanceOf(Date));
    expect((await tutorRepo.getSession(session.id))?.status).toBe('ended');
    expect(screen.queryByLabelText('Your answer')).not.toBeInTheDocument();
    // and he can begin again
    fireEvent.click(screen.getByRole('button', { name: 'Start another' }));
    expect(await screen.findByRole('button', { name: 'Take a photo' })).toBeInTheDocument();
  });

  it('says why when the factory refuses the answer, and keeps the boxes', async () => {
    const ctx = await setup();
    await typeAnswer('8');
    send();
    await waitFor(() => expect(ctx.factory.sends).toHaveLength(1));
    ctx.factory.answers.set('direct:1', { answer: { status: 'failed', reason: 'The maths check was not working.' }, next: 2 });
    expect(await screen.findByText('The maths check was not working.', undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByLabelText('Your answer')).toBeInTheDocument();
  });

  it('keeps an answer that arrives after he stopped, marks it stale, and never shows it', async () => {
    const { factory, session, say } = await setup();
    await typeAnswer('8');
    send();
    await waitFor(() => expect(factory.sends).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Stop for now' }));
    await waitFor(async () => expect((await tutorRepo.getSession(session.id))?.status).toBe('ended'));
    factory.answers.set('direct:1', { answer: { status: 'answered', answer: mathAnswer({ prompt_to_child: 'LATE PROMPT' }) }, next: 2 });
    // the screen is not polling any more for a finished session, so apply it as the grist client would
    await tutorRepo.applyAnswer('direct:1', { status: 'answered', answer: mathAnswer({ prompt_to_child: 'LATE PROMPT' }) });
    const turn = (await tutorRepo.listTurns(session.id)).find((t) => t.txid === 'direct:1');
    expect(turn?.status).toBe('stale');
    expect(screen.queryByText('LATE PROMPT')).not.toBeInTheDocument();
    expect(say).not.toHaveBeenCalledWith('LATE PROMPT');
  });
});

describe('the record keeps what the child does not see', () => {
  it('stores the whole answer, diagnosis and method included, for the parent screen', async () => {
    const { session, factory } = await setup();
    await typeAnswer('8');
    send();
    await waitFor(() => expect(factory.sends).toHaveLength(1));
    const answer = mathAnswer({ notes_for_parent: 'Subtracts when the story says "buys more".', teaching_method: 'counting on' });
    factory.answers.set('direct:1', { answer: { status: 'answered', answer }, next: 2 });
    await screen.findByRole('button', { name: 'Try again' }, { timeout: 3000 });
    const turn = (await tutorRepo.listTurns(session.id)).find((t) => t.mode === 'math');
    expect(turn?.answer).toEqual(answer);
  });
});

describe('Stop for now', () => {
  it('ends the session while the maths is waiting to be answered, and says so', async () => {
    const { session } = await setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop for now' }));
    await waitFor(async () => expect((await tutorRepo.getSession(session.id))?.endedAt).toBeInstanceOf(Date));
    expect((await tutorRepo.getSession(session.id))?.status).toBe('ended');
    expect(await screen.findByText('Stopped for now. Your work is kept.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Your answer')).not.toBeInTheDocument();
  });

  it('is there during the reading too, and ends the session', async () => {
    const { session } = await setup({}, { clickMaths: false });
    await screen.findByRole('button', { name: 'Now the math' });
    fireEvent.click(screen.getByRole('button', { name: 'Stop for now' }));
    await waitFor(async () => expect((await tutorRepo.getSession(session.id))?.status).toBe('ended'));
    expect((await tutorRepo.getSession(session.id))?.endedAt).toBeInstanceOf(Date);
  });

  it('deletes nothing: the session and its turns are still there', async () => {
    const { session } = await setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop for now' }));
    await waitFor(async () => expect((await tutorRepo.getSession(session.id))?.status).toBe('ended'));
    expect((await tutorRepo.listTurns(session.id)).length).toBe(2);
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('is not offered before a session has begun', async () => {
    await db.profiles.put(profile);
    render(<TutorScreen profile={profile} onBack={vi.fn()} deps={{ getKey: async () => key }} />);
    await screen.findByRole('button', { name: 'Take a photo' });
    expect(screen.queryByRole('button', { name: 'Stop for now' })).not.toBeInTheDocument();
  });
});

describe('a reload', () => {
  it('goes straight back to the maths when a maths turn exists', async () => {
    const { session } = await setup();
    await tutorRepo.addTurn({ sessionId: session.id, mode: 'math', request: { mode: 'math', strictness: 'meaning-gated', target_text: MATH_PROBLEM, child_answer: '8', session_history: [] } });
    await db.close();
    await db.open();
    document.body.innerHTML = '';
    render(<TutorScreen profile={profile} onBack={vi.fn()} deps={{ getKey: async () => key, read: async () => ({ pending: true, next: 1 }), pollIntervalMs: 20 }} />);
    expect(await screen.findByText('Checking...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Read it' })).not.toBeInTheDocument();
  });
});

describe('sessionHistory with maths turns', () => {
  it('carries the child answer of a maths turn the child saw answered', () => {
    const turn = { id: 'a', sessionId: 's', index: 2, mode: 'math', sentAt: new Date(), request: { mode: 'math', strictness: 'meaning-gated', child_answer: '8', session_history: [] }, attachments: [], status: 'answered', answer: mathAnswer() } as const;
    expect(sessionHistory([turn as never])).toEqual([{ mode: 'math', action: 'math_probe', prompt_to_child: mathAnswer().prompt_to_child, child_answer: '8' }]);
  });
});

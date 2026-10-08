// mw-bhvxcn.8: the Tutor screen behind sf-tutor. A fake grist client (sendGrist, getKey, read) stands in for the
// factory; the tutor's own Dexie tables, the profile repository and the real GristInFlight run for real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PrivateKey } from '@bsv/sdk';
import { db } from '../../src/data/db';
import { tutorRepo } from '../../src/data/repositories';
import type { Profile, TutorAnswer } from '../../src/contracts';
import { HomeScreen } from '../../src/features/dashboard/home-screen';
import { TutorScreen } from '../../src/features/tutor';
import type { TutorDeps } from '../../src/features/tutor';
import { TUTOR_TURN_GRIND } from '../../src/grist';
import type { ReadAnswerParams, ReadAnswerResult, SendGristParams } from '../../src/grist';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { mergeSetting, validateSettings } from '../../src/accessibility/settings';
import { useTutorFlag, TUTOR_FLAG_STORAGE_KEY } from '../../src/debug/debug-state';
import { paulProfile } from '../fixtures/profiles';

const key = PrivateKey.fromRandom();
const PROBLEM = 'Anna has 3 apples and buys 4 more. How many apples does she have now?';

const answer = (over: Partial<TutorAnswer> = {}): TutorAnswer => ({
  action: 'continue',
  focus_words: [],
  prompt_to_child: 'Here is your problem.',
  layer_diagnosis: 'none',
  target_text: PROBLEM,
  problem_kind: 'word',
  ...over,
});

/** A fake grist client: every send is logged; reads answer a txid only once `factory.answers` holds one for it. */
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
  factory.read = async (params: ReadAnswerParams<TutorAnswer>) =>
    factory.answers.get(params.txid) ?? { pending: true, next: 1 };
  return factory;
}

function deps(factory: ReturnType<typeof fakeFactory>, over: Partial<TutorDeps> = {}): TutorDeps {
  return {
    sendGrist: factory.sendGrist,
    read: factory.read,
    getKey: async () => key,
    shrink: async (blob: Blob) => ({ bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type }),
    pollIntervalMs: 20,
    ...over,
  };
}

const profile: Profile = { ...paulProfile, settings: { ...DEFAULT_SETTINGS, fontSize: 32 } };

async function renderScreen(factory: ReturnType<typeof fakeFactory>, over: Partial<TutorDeps> = {}, p: Profile = profile) {
  over = { say: vi.fn(async () => undefined), ...over };
  await db.profiles.put(p);
  const onProfileChange = vi.fn();
  const view = render(<TutorScreen profile={p} onBack={vi.fn()} onProfileChange={onProfileChange} deps={deps(factory, over)} />);
  return { ...view, onProfileChange };
}

/** The keyboard path: the small keyboard icon opens the box, then Send. */
async function typeAndSend(text: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'Type it instead' }));
  fireEvent.change(await screen.findByLabelText('Type the problem'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

const photoFile = () => new File([new Uint8Array([1, 2, 3, 4])], 'problem.jpg', { type: 'image/jpeg' });

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the sf-tutor flag and the Home tile', () => {
  const home = () =>
    render(
      <HomeScreen
        profile={profile}
        wordLists={[]}
        allWords={[]}
        allStats={[]}
        streakData={null}
        coinBalance={null}
        learningProgress={[]}
        onNavigate={onNavigate}
        onSwitchProfile={vi.fn()}
        hasMultipleProfiles={false}
      />,
    );
  const onNavigate = vi.fn();

  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
    onNavigate.mockClear();
  });

  it('is off by default: Home shows no Tutor tile', () => {
    home();
    expect(screen.queryByText('Tutor')).not.toBeInTheDocument();
  });

  it('with the flag on, Home shows a Tutor tile that opens the tutor view', () => {
    localStorage.setItem(TUTOR_FLAG_STORAGE_KEY, '1');
    home();
    fireEvent.click(screen.getByRole('button', { name: /Tutor/ }));
    expect(onNavigate).toHaveBeenCalledWith('tutor');
  });

  it("the flag's storage key is sf-tutor, and the hook reads it", () => {
    expect(TUTOR_FLAG_STORAGE_KEY).toBe('sf-tutor');
    function Probe() {
      return <span>{useTutorFlag() ? 'on' : 'off'}</span>;
    }
    const { unmount } = render(<Probe />);
    expect(screen.getByText('off')).toBeInTheDocument();
    unmount();
    localStorage.setItem('sf-tutor', '1');
    render(<Probe />);
    expect(screen.getByText('on')).toBeInTheDocument();
  });
});

describe('TutorScreen: the start screen is photo-first (mw-kuy7rx.9)', () => {
  it('shows one big camera button and a small keyboard icon, and no strictness radios', async () => {
    await renderScreen(fakeFactory());
    expect(await screen.findByRole('button', { name: 'Take a photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Type it instead' })).toBeInTheDocument();
    expect(screen.queryByText('How should the tutor help?')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Type the problem')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
  });

  it("sends with the profile's saved strictness (set in Tutor settings)", async () => {
    const factory = fakeFactory();
    const saved: Profile = { ...profile, settings: { ...profile.settings, tutorStrictness: 'precision' } };
    await renderScreen(factory, {}, saved);
    await typeAndSend(PROBLEM);
    await waitFor(() => expect(factory.sends).toHaveLength(1));
    expect((factory.sends[0].input as { strictness: string }).strictness).toBe('precision');
  });

  it('speaks the prompt once on arrival, and again only when asked with the icon', async () => {
    const say = vi.fn(async () => undefined);
    await renderScreen(fakeFactory(), { say });
    await screen.findByRole('button', { name: 'Take a photo' });
    await waitFor(() => expect(say).toHaveBeenCalledWith('Take a photo of your problem'));
    // the screen re-renders (opening the keyboard) without speaking again
    fireEvent.click(screen.getByRole('button', { name: 'Type it instead' }));
    await screen.findByLabelText('Type the problem');
    expect(say).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Say it again' }));
    expect(say).toHaveBeenCalledTimes(2);
    expect(say).toHaveBeenLastCalledWith('Take a photo of your problem');
  });

  it('does not speak the prompt when a session is already under way', async () => {
    const factory = fakeFactory();
    const say = vi.fn(async () => undefined);
    const first = await renderScreen(factory, { say });
    await typeAndSend(PROBLEM);
    await waitFor(() => expect(factory.sends).toHaveLength(1));
    await screen.findByRole('status');
    first.unmount();
    const again = vi.fn(async () => undefined);
    await renderScreen(factory, { say: again });
    await screen.findByRole('status');
    expect(again).not.toHaveBeenCalled();
  });
});

describe('the strictness setting', () => {
  it('survives validateSettings and mergeSetting when valid, and is dropped when not', () => {
    expect(validateSettings({ ...DEFAULT_SETTINGS, tutorStrictness: 'precision' }).tutorStrictness).toBe('precision');
    expect(mergeSetting({ ...DEFAULT_SETTINGS, tutorStrictness: 'precision' }, 'fontSize', 30).tutorStrictness).toBe('precision');
    expect(validateSettings({ ...DEFAULT_SETTINGS, tutorStrictness: 'nonsense' as never })).not.toHaveProperty('tutorStrictness');
    expect(validateSettings(DEFAULT_SETTINGS)).not.toHaveProperty('tutorStrictness');
  });
});

describe('TutorScreen: a typed problem', () => {
  it('sends a problem-in turn to the grist, waits with the seconds counting, then shows the returned problem large', async () => {
    const factory = fakeFactory();
    await renderScreen(factory);
    await typeAndSend(PROBLEM);

    // sent as the tutor-turn grist, mode problem-in, carrying the typed text
    await waitFor(() => expect(factory.sends).toHaveLength(1));
    expect(factory.sends[0].header).toEqual(TUTOR_TURN_GRIND);
    expect(factory.sends[0].input).toMatchObject({ mode: 'problem-in', strictness: 'meaning-gated', target_text: PROBLEM });
    expect(factory.sends[0].files ?? []).toHaveLength(0);

    // while waiting
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/\d+ seconds?/)).toBeInTheDocument();
    expect(screen.queryByText(/reading the problem/i)).not.toBeInTheDocument();
    expect(screen.queryByText(PROBLEM)).not.toBeInTheDocument();

    // the factory answers: the problem shows large, in the child's font and size
    factory.answers.set('direct:1', { answer: { status: 'answered', answer: answer() }, next: 2 });
    const shown = await screen.findByText(PROBLEM, undefined, { timeout: 3000 });
    expect(shown).toHaveStyle({ fontFamily: 'var(--sf-font-family)', letterSpacing: 'var(--sf-letter-spacing)' });
    expect(shown.style.fontSize).toContain('var(--sf-font-size)');
    expect(screen.getByText(/word problem/i)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    // the record: a session and one answered turn
    const sessions = await db.tutorSessions.toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ profileId: profile.id, targetText: PROBLEM, problemKind: 'word', status: 'active' });
    const turns = await tutorRepo.listTurns(sessions[0].id);
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ mode: 'problem-in', status: 'answered' });
  });

  it('counts the seconds while it waits', async () => {
    const factory = fakeFactory();
    await renderScreen(factory);
    await typeAndSend(PROBLEM);
    await screen.findByRole('status');
    expect(await screen.findByText(/^[1-9]\d* seconds?$/, undefined, { timeout: 3500 })).toBeInTheDocument();
  });

  it('will not send an empty problem', async () => {
    const factory = fakeFactory();
    await renderScreen(factory);
    fireEvent.click(await screen.findByRole('button', { name: 'Type it instead' }));
    expect(await screen.findByRole('button', { name: 'Send' })).toBeDisabled();
    expect(factory.sends).toHaveLength(0);
  });

  it('says so when the factory refuses, and lets him try again', async () => {
    const factory = fakeFactory();
    await renderScreen(factory);
    await typeAndSend(PROBLEM);
    await waitFor(() => expect(factory.sends).toHaveLength(1));
    factory.answers.set('direct:1', { answer: { status: 'refused', reason: 'That is not a problem.' }, next: 2 });
    expect(await screen.findByText('That is not a problem.', undefined, { timeout: 3000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Take a photo' })).toBeInTheDocument();
  });

  it('says so when the problem cannot be sent (no key on this device), and sends nothing', async () => {
    const factory = fakeFactory();
    await renderScreen(factory, { getKey: async () => undefined });
    await typeAndSend(PROBLEM);
    expect(await screen.findByText(/no key/i)).toBeInTheDocument();
    expect(factory.sends).toHaveLength(0);
  });
});

describe('TutorScreen: a photo of the problem', () => {
  it('sends itself once the photo is taken, with no further tap, and keeps it as a problem blob', async () => {
    const factory = fakeFactory();
    await renderScreen(factory);
    await screen.findByRole('button', { name: 'Take a photo' });

    fireEvent.change(screen.getByTestId('tutor-photo-input'), { target: { files: [photoFile()] } });

    await waitFor(() => expect(factory.sends).toHaveLength(1));
    expect(factory.sends[0].input).toMatchObject({ mode: 'problem-in' });
    expect(factory.sends[0].files).toHaveLength(1);
    expect(factory.sends[0].files?.[0].mime).toBe('image/jpeg');
    expect(Array.from(factory.sends[0].files?.[0].bytes ?? [])).toEqual([1, 2, 3, 4]);
    // the screen is waiting, with a picture and the seconds, not a Send button
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();

    const [session] = await db.tutorSessions.toArray();
    const [turn] = await tutorRepo.listTurns(session.id);
    expect(turn.attachments).toHaveLength(1);
    expect(turn.attachments[0].kind).toBe('problem');
    expect(await tutorRepo.getBlob(turn.attachments[0].blobId)).toBeDefined();
  });

  it('says when the photo is too big to send, sends nothing, and offers the camera again', async () => {
    const factory = fakeFactory();
    const { GristLimitError } = await import('../../src/grist');
    await renderScreen(factory, {
      shrink: async () => {
        throw new GristLimitError('This photo is too big even when shrunk.');
      },
    });
    fireEvent.change(await screen.findByTestId('tutor-photo-input'), { target: { files: [photoFile()] } });
    expect(await screen.findByText('This photo is too big even when shrunk.')).toBeInTheDocument();
    expect(factory.sends).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Take a photo' })).toBeInTheDocument();
  });
});

describe("TutorScreen: 'That's not it'", () => {
  async function shownProblem(factory: ReturnType<typeof fakeFactory>) {
    const view = await renderScreen(factory);
    await typeAndSend('anna has 3 aples');
    await waitFor(() => expect(factory.sends).toHaveLength(1));
    factory.answers.set('direct:1', { answer: { status: 'answered', answer: answer({ target_text: 'Anna has 3 aples.' }) }, next: 2 });
    await screen.findByText('Anna has 3 aples.', undefined, { timeout: 3000 });
    return view;
  }

  it('lets him retype the problem: a new problem-in turn with his text, and no second grist', async () => {
    const factory = fakeFactory();
    await shownProblem(factory);

    fireEvent.click(screen.getByRole('button', { name: "That's not it" }));
    const box = await screen.findByLabelText('Type the problem');
    expect(box).toHaveValue('Anna has 3 aples.');
    fireEvent.change(box, { target: { value: 'Anna has 3 apples.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use this' }));

    expect(await screen.findByText('Anna has 3 apples.')).toBeInTheDocument();
    expect(factory.sends).toHaveLength(1);

    const [session] = await db.tutorSessions.toArray();
    expect(session.targetText).toBe('Anna has 3 apples.');
    const turns = await tutorRepo.listTurns(session.id);
    expect(turns).toHaveLength(2);
    expect(turns[1]).toMatchObject({ mode: 'problem-in', status: 'answered', request: { mode: 'problem-in', target_text: 'Anna has 3 apples.' } });
    expect(turns[1].txid).toBeUndefined();
  });

  it('cancelling the retype keeps the problem as it was', async () => {
    const factory = fakeFactory();
    await shownProblem(factory);
    fireEvent.click(screen.getByRole('button', { name: "That's not it" }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Anna has 3 aples.')).toBeInTheDocument();
    expect(await db.tutorTurns.count()).toBe(1);
  });
});

describe('TutorScreen: a reload', () => {
  it('shows the problem again from Dexie', async () => {
    const factory = fakeFactory();
    const first = await renderScreen(factory);
    await typeAndSend(PROBLEM);
    await waitFor(() => expect(factory.sends).toHaveLength(1));
    factory.answers.set('direct:1', { answer: { status: 'answered', answer: answer() }, next: 2 });
    await screen.findByText(PROBLEM, undefined, { timeout: 3000 });
    first.unmount();

    await renderScreen(fakeFactory());
    expect(await screen.findByText(PROBLEM)).toBeInTheDocument();
  });

  it('resumes a turn still waiting: the waiting picture again, then the answer when it comes', async () => {
    const factory = fakeFactory();
    const first = await renderScreen(factory);
    await typeAndSend(PROBLEM);
    await screen.findByRole('status');
    first.unmount();

    const again = await renderScreen(factory);
    expect(await screen.findByRole('status')).toBeInTheDocument();
    factory.answers.set('direct:1', { answer: { status: 'answered', answer: answer() }, next: 2 });
    expect(await screen.findByText(PROBLEM, undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(factory.sends).toHaveLength(1);
    again.unmount();
  });

  it('fails a turn left half-sent long ago, instead of waiting for ever', async () => {
    const session = await tutorRepo.createSession({ profileId: profile.id, strictness: 'meaning-gated' });
    await tutorRepo.addTurn({
      sessionId: session.id,
      mode: 'problem-in',
      request: { mode: 'problem-in', strictness: 'meaning-gated', target_text: PROBLEM, session_history: [] },
      sentAt: new Date(Date.now() - 10 * 60_000),
    });
    await renderScreen(fakeFactory());
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('TutorScreen: a photo turned away (mw-kuy7rx.17)', () => {
  const TURNED_AWAY = 'Thanks for the photo! This page is a story to read, not a math problem. Take a new photo.';
  const FIXED_LINE = 'The tutor could not read a problem there.';

  /** A photo problem-in turn (no typed text) put straight into the given state. */
  async function seedPhotoTurn(over: Partial<import('../../src/contracts').TutorTurn>) {
    const session = await tutorRepo.createSession({ profileId: profile.id, strictness: 'meaning-gated' });
    const turn = await tutorRepo.addTurn({
      sessionId: session.id,
      mode: 'problem-in',
      request: { mode: 'problem-in', strictness: 'meaning-gated', session_history: [] },
    });
    await db.tutorTurns.put({ ...turn, ...over });
  }

  const noProblem = (over: Partial<TutorAnswer> = {}) =>
    answer({ action: 'encourage', target_text: undefined, problem_kind: undefined, prompt_to_child: TURNED_AWAY, ...over });

  it('shows the tutor’s own prompt_to_child, with Try again, when an answered photo has no problem in it', async () => {
    const factory = fakeFactory();
    await renderScreen(factory);
    await screen.findByRole('button', { name: 'Take a photo' });
    fireEvent.change(screen.getByTestId('tutor-photo-input'), { target: { files: [photoFile()] } });
    await waitFor(() => expect(factory.sends).toHaveLength(1));
    factory.answers.set('direct:1', { answer: { status: 'answered', answer: noProblem() }, next: 2 });

    expect(await screen.findByRole('alert', undefined, { timeout: 3000 })).toHaveTextContent(TURNED_AWAY);
    expect(screen.queryByText(FIXED_LINE)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('speaks that prompt once as it arrives, and again on Say it again', async () => {
    const factory = fakeFactory();
    const say = vi.fn(async () => undefined);
    await renderScreen(factory, { say });
    await screen.findByRole('button', { name: 'Take a photo' });
    say.mockClear();
    fireEvent.change(screen.getByTestId('tutor-photo-input'), { target: { files: [photoFile()] } });
    await waitFor(() => expect(factory.sends).toHaveLength(1));
    factory.answers.set('direct:1', { answer: { status: 'answered', answer: noProblem() }, next: 2 });

    await screen.findByText(TURNED_AWAY, undefined, { timeout: 3000 });
    await waitFor(() => expect(say).toHaveBeenCalledWith(TURNED_AWAY));
    expect(say).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Say it again' }));
    expect(say).toHaveBeenCalledTimes(2);
  });

  it('does not speak it again when the screen opens on a turn already answered', async () => {
    await seedPhotoTurn({ status: 'answered', answer: noProblem() });
    const say = vi.fn(async () => undefined);
    await renderScreen(fakeFactory(), { say });
    expect(await screen.findByText(TURNED_AWAY)).toBeInTheDocument();
    expect(say).not.toHaveBeenCalled();
  });

  it('keeps the fixed line for an answered turn whose prompt_to_child is empty', async () => {
    await seedPhotoTurn({ status: 'answered', answer: noProblem({ prompt_to_child: '   ' }) });
    await renderScreen(fakeFactory());
    expect(await screen.findByRole('alert')).toHaveTextContent(FIXED_LINE);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('keeps the fixed line for a stale turn, whatever its kept answer said', async () => {
    await seedPhotoTurn({ status: 'stale', answer: noProblem() });
    await renderScreen(fakeFactory());
    expect(await screen.findByRole('alert')).toHaveTextContent(FIXED_LINE);
    expect(screen.queryByText(TURNED_AWAY)).not.toBeInTheDocument();
  });

  it('still shows a failed turn’s failureReason', async () => {
    await seedPhotoTurn({ status: 'failed', failureReason: 'The factory did not answer in time.' });
    await renderScreen(fakeFactory());
    expect(await screen.findByRole('alert')).toHaveTextContent('The factory did not answer in time.');
  });
});

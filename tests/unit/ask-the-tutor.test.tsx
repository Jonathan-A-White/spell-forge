// mw-kuy7rx.13: 'Ask the tutor' on the Grown-ups screen: a question typed (the keyboard's own mic dictates), Ask,
// the wait with the seconds, the answer with its examples, and the last 10 asks kept on the device. The grist
// client is a fake: sendGrist and read are replaced, so nothing touches a network.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { PrivateKey } from '@bsv/sdk';
import { db } from '../../src/data/db';
import { parentAskRepo, tutorRepo } from '../../src/data/repositories';
import { ParentScreen } from '../../src/features/tutor/parent-screen';
import { PARENT_ASK_GRIND, GristOffline } from '../../src/grist';
import type { ReadAnswerParams, ReadAnswerResult, SendGristParams } from '../../src/grist';
import type { ParentAskAnswer, ParentAskRequest } from '../../src/contracts';
import { paulProfile } from '../fixtures/profiles';
import { readRight } from '../fixtures/parent-sessions';

const key = PrivateKey.fromRandom();
const answer: ParentAskAnswer = { answer: 'He is reading well and slips on long words.', examples: ['He misread "chapter" on the first try.'] };

type Read = (params: ReadAnswerParams<ParentAskAnswer>) => Promise<ReadAnswerResult<ParentAskAnswer>>;

function fakeClient(opts: { reply?: () => ReadAnswerResult<ParentAskAnswer>; sendError?: Error } = {}) {
  const sent: SendGristParams[] = [];
  const sendGrist = vi.fn(async (params: SendGristParams) => {
    sent.push(params);
    if (opts.sendError) throw opts.sendError;
    return { txid: `direct:${sent.length}`, seq: 0, mill: 'aa' };
  });
  const read: Read = async () => opts.reply?.() ?? { pending: true, next: 0 };
  return { sent, sendGrist, deps: { sendGrist, read, getKey: async (): Promise<PrivateKey | undefined> => key, pollIntervalMs: 20 } };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.profiles.add({ ...paulProfile });
});

const open = (deps: ReturnType<typeof fakeClient>['deps'] | undefined, profileId = paulProfile.id) =>
  render(<ParentScreen profileId={profileId} onBack={() => undefined} deps={deps} />);
const box = async () => within(await screen.findByRole('region', { name: 'Ask the tutor' }));
async function ask(text: string) {
  const s = await box();
  fireEvent.change(await s.findByLabelText('Your question'), { target: { value: text } });
  fireEvent.click(s.getByRole('button', { name: 'Ask' }));
  return s;
}

describe('Ask the tutor box', () => {
  it('is a section of the Grown-ups screen with a question field and an Ask button, no longer "coming soon"', async () => {
    open(undefined);
    const s = await box();
    expect(s.getByLabelText('Your question')).toBeTruthy();
    expect((s.getByRole('button', { name: 'Ask' }) as HTMLButtonElement).disabled).toBe(true);
    expect(s.queryByText('Coming soon.')).toBeNull();
    expect(await s.findByText('No questions yet.')).toBeTruthy();
    // no in-app speech recognition: the box is a field and Ask, the keyboard's own mic does the dictating
    expect(s.getAllByRole('button').map((b) => b.textContent)).toEqual(['Ask']);
  });

  it('sends the question through the grist client as a parent-ask, with his recent sessions as text', async () => {
    await db.tutorSessions.add({ ...readRight.session, profileId: paulProfile.id });
    await db.tutorTurns.bulkAdd(readRight.turns);
    const client = fakeClient();
    open(client.deps);
    await ask('  How is he doing with reading?  ');

    await vi.waitFor(() => expect(client.sendGrist).toHaveBeenCalledTimes(1));
    const call = client.sent[0];
    expect(call.header).toMatchObject({ ...PARENT_ASK_GRIND });
    expect(call.key).toBe(key);
    const input = call.input as ParentAskRequest;
    expect(input.question).toBe('How is he doing with reading?');
    expect(input.sessions).toHaveLength(1);
    expect(input.sessions[0]).toMatch(/chapter/);

    const [stored] = await parentAskRepo.listForProfile(paulProfile.id);
    expect(stored).toMatchObject({ question: 'How is he doing with reading?', status: 'waiting', txid: 'direct:1', mill: 'aa' });
    expect(((await box()).getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('');
    expect(await tutorRepo.listSessions(paulProfile.id)).toHaveLength(1);
    expect(await db.tutorTurns.count()).toBe(readRight.turns.length);
  });

  it('shows the wait as a spinner and the seconds, counting up, and takes Ask away until it is over', async () => {
    const client = fakeClient();
    open(client.deps);
    const s = await ask('Is he stuck on anything?');
    const waiting = await s.findByRole('status', { name: 'Waiting for the answer' });
    expect(within(waiting).getByText(/^[0-2] seconds?$/)).toBeTruthy();
    expect((s.getByRole('button', { name: 'Ask' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a waiting ask from before a reload with the seconds since he asked', async () => {
    const request: ParentAskRequest = { question: 'Earlier?', sessions: [] };
    const earlier = await parentAskRepo.add({ profileId: paulProfile.id, question: 'Earlier?', request, askedAt: new Date(Date.now() - 12_500) });
    await parentAskRepo.markSent(earlier.id, { txid: 'direct:old', seq: 0, mill: 'aa' });
    open(fakeClient().deps);
    const s = await box();
    expect(await s.findByText('12 seconds')).toBeTruthy();
    // the seconds count up while it waits
    expect(await s.findByText('13 seconds')).toBeTruthy();
  });

  it('renders the answer with its examples and keeps it in the history', async () => {
    const client = fakeClient({ reply: () => ({ answer: { status: 'answered', answer }, next: 1 }) });
    open(client.deps);
    const s = await ask('How is he doing with reading?');

    expect(await s.findByText(answer.answer)).toBeTruthy();
    expect(s.getByText(answer.examples[0])).toBeTruthy();
    expect(s.queryByRole('status', { name: 'Waiting for the answer' })).toBeNull();
    expect(s.getByText('How is he doing with reading?')).toBeTruthy();
    expect((s.getByRole('button', { name: 'Ask' }) as HTMLButtonElement).disabled).toBe(true); // field is empty again
    await vi.waitFor(async () =>
      expect(await parentAskRepo.listForProfile(paulProfile.id)).toMatchObject([{ status: 'answered', answer, question: 'How is he doing with reading?' }]),
    );
  });

  it('lists the earlier questions and answers, newest first, only the last 10, for this profile only', async () => {
    const request: ParentAskRequest = { question: 'q', sessions: [] };
    for (let i = 1; i <= 12; i += 1) {
      const row = await parentAskRepo.add({ profileId: paulProfile.id, question: `Question number ${i}`, request, askedAt: new Date(2025, 9, i) });
      await parentAskRepo.markSent(row.id, { txid: `direct:${i}`, seq: 0, mill: 'aa' });
      await parentAskRepo.applyAnswer(`direct:${i}`, { status: 'answered', answer: { answer: `Answer number ${i}`, examples: [] } });
    }
    await parentAskRepo.add({ profileId: 'someone-else', question: 'Not his question', request });
    open(fakeClient().deps);
    const s = await box();
    await s.findByText('Question number 12');
    const items = s.getAllByRole('listitem');
    expect(items).toHaveLength(10);
    expect(within(items[0]).getByText('Question number 12')).toBeTruthy();
    expect(within(items[0]).getByText('Answer number 12')).toBeTruthy();
    expect(within(items[9]).getByText('Question number 3')).toBeTruthy();
    expect(s.queryByText('Question number 2')).toBeNull();
    expect(s.queryByText('Not his question')).toBeNull();
  });

  it('says why when the question could not be sent, and keeps the failed ask in the history', async () => {
    const client = fakeClient({ sendError: new GristOffline('offline') });
    open(client.deps);
    const s = await ask('Will this fail?');
    expect(await s.findByText(/cannot be reached/i)).toBeTruthy();
    expect(s.getByText('Will this fail?')).toBeTruthy();
    expect(s.queryByRole('status', { name: 'Waiting for the answer' })).toBeNull();
    expect(await parentAskRepo.listForProfile(paulProfile.id)).toMatchObject([{ status: 'failed' }]);
    expect((s.getByRole('button', { name: 'Ask again: Will this fail?' }) as HTMLButtonElement)).toBeTruthy();
  });

  it('shows the reason when the factory refuses, and Ask again puts the question back in the field', async () => {
    const client = fakeClient({ reply: () => ({ answer: { status: 'refused', reason: 'This device is not licensed.' }, next: 1 }) });
    open(client.deps);
    const s = await ask('Can you tell me?');
    expect(await s.findByText('This device is not licensed.')).toBeTruthy();
    fireEvent.click(s.getByRole('button', { name: 'Ask again: Can you tell me?' }));
    expect((s.getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('Can you tell me?');
  });

  it('tells the parent when this device has no key, and stores nothing', async () => {
    const client = fakeClient();
    open({ ...client.deps, getKey: async () => undefined });
    const s = await ask('Hello?');
    expect(await s.findByText(/no key yet/i)).toBeTruthy();
    expect(client.sendGrist).not.toHaveBeenCalled();
    expect(await db.parentAsks.count()).toBe(0);
  });

  it('fails an ask a closed app left half-sent', async () => {
    const request: ParentAskRequest = { question: 'Cut off', sessions: [] };
    await parentAskRepo.add({ profileId: paulProfile.id, question: 'Cut off', request, askedAt: new Date(Date.now() - 60_000) });
    open(fakeClient().deps);
    const s = await box();
    expect(await s.findByText(/did not get sent/i)).toBeTruthy();
  });
});

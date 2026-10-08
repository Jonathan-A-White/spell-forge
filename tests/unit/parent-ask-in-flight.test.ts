// mw-kuy7rx.12: a parent's question is its own store (parentAsks, not tutorTurns) and its own reader. The reads
// are a fake here, except in the last test, which goes through the real readAnswer and a fake Postern.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivateKey } from '@bsv/sdk';
import { db } from '../../src/data/db';
import { parentAskRepo, tutorRepo } from '../../src/data/repositories';
import type { ParentAskAnswer, ParentAskRequest } from '../../src/contracts';
import {
  PARENT_ASK_GRIND,
  PARENT_ASK_DEADLINE_MS,
  ParentAskInFlight,
  TUTOR_POLL_INTERVAL_MS,
  isParentAskAnswer,
  sendGrist,
} from '../../src/grist';
import type { ReadAnswerParams, ReadAnswerResult } from '../../src/grist';
import { answerPayload, makeServer } from '../fixtures/grist/fake-postern';

const key = PrivateKey.fromRandom();
const request: ParentAskRequest = { question: 'How is he doing?', sessions: ['2025-10-07. Problem: "x".'] };
const answer = (text = 'He is doing well.'): ParentAskAnswer => ({ answer: text, examples: ['He read it right on the 2nd try.'] });

async function waitingAsk(txid: string, askedAt?: Date, profileId = 'p1') {
  const ask = await parentAskRepo.add({ profileId, question: request.question, request, askedAt });
  await parentAskRepo.markSent(ask.id, { txid, seq: 0, mill: 'aa' });
  return ask;
}

type Read = (params: ReadAnswerParams<ParentAskAnswer>) => Promise<ReadAnswerResult<ParentAskAnswer>>;
const pending: ReadAnswerResult<ParentAskAnswer> = { pending: true, next: 0 };
const answered = (a: ParentAskAnswer): ReadAnswerResult<ParentAskAnswer> => ({ answer: { status: 'answered', answer: a }, next: 1 });

function fakeRead(ready: Map<string, ReadAnswerResult<ParentAskAnswer>>) {
  const calls: string[] = [];
  const read: Read = async (params) => {
    calls.push(params.txid);
    expect(params.isAnswer).toBe(isParentAskAnswer);
    return ready.get(params.txid) ?? pending;
  };
  return { read, calls };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('parentAskRepo', () => {
  it('keeps an ask in its own table, apart from the tutor turns', async () => {
    const ask = await parentAskRepo.add({ profileId: 'p1', question: request.question, request });
    expect(ask).toMatchObject({ profileId: 'p1', question: request.question, status: 'sending', request });
    expect(await db.parentAsks.count()).toBe(1);
    expect(await db.tutorTurns.count()).toBe(0);
    expect(await parentAskRepo.get(ask.id)).toMatchObject({ id: ask.id });
  });

  it('lists a profile\'s asks newest first, and only the waiting ones as waiting', async () => {
    const older = await parentAskRepo.add({ profileId: 'p1', question: 'older', request, askedAt: new Date('2025-10-01T10:00:00Z') });
    const newer = await parentAskRepo.add({ profileId: 'p1', question: 'newer', request, askedAt: new Date('2025-10-02T10:00:00Z') });
    await parentAskRepo.add({ profileId: 'p2', question: 'other child', request });
    expect((await parentAskRepo.listForProfile('p1')).map((a) => a.id)).toEqual([newer.id, older.id]);

    expect(await parentAskRepo.listWaiting()).toEqual([]);
    await parentAskRepo.markSent(newer.id, { txid: 'direct:n', seq: 3, mill: 'aa' });
    expect(await parentAskRepo.listWaiting()).toMatchObject([{ id: newer.id, txid: 'direct:n', seq: 3, mill: 'aa', status: 'waiting' }]);
  });

  it('applies an answer once, to the ask whose txid it answers, and ignores an unknown txid', async () => {
    const ask = await waitingAsk('direct:a');
    const at = new Date('2025-10-07T12:00:00Z');
    expect(await parentAskRepo.applyAnswer('direct:nobody', { status: 'answered', answer: answer() })).toBeUndefined();
    expect(await parentAskRepo.applyAnswer('direct:a', { status: 'answered', answer: answer() }, at)).toMatchObject({
      status: 'answered',
      answer: answer(),
      answeredAt: at,
    });
    await parentAskRepo.applyAnswer('direct:a', { status: 'failed', reason: 'late' });
    expect(await parentAskRepo.get(ask.id)).toMatchObject({ status: 'answered', answer: answer() });
  });

  it('keeps why an ask was refused or failed, and only fails one that is still out', async () => {
    const refused = await waitingAsk('direct:r');
    await parentAskRepo.applyAnswer('direct:r', { status: 'refused', reason: 'Not licensed.' });
    expect(await parentAskRepo.get(refused.id)).toMatchObject({ status: 'refused', failureReason: 'Not licensed.' });
    await parentAskRepo.markFailed(refused.id, 'later');
    expect((await parentAskRepo.get(refused.id))?.failureReason).toBe('Not licensed.');

    const unsent = await parentAskRepo.add({ profileId: 'p1', question: 'q', request });
    await parentAskRepo.markFailed(unsent.id, 'Could not be sent.');
    expect(await parentAskRepo.get(unsent.id)).toMatchObject({ status: 'failed', failureReason: 'Could not be sent.' });
  });
});

describe('ParentAskInFlight.pass', () => {
  it('resolves a pending ask from a fake answer, leaving the unanswered ones waiting', async () => {
    const one = await waitingAsk('direct:one');
    const two = await waitingAsk('direct:two');
    const { read, calls } = fakeRead(new Map([['direct:two', answered(answer('Two says hello.'))]]));

    await new ParentAskInFlight({ getKey: async () => key, read }).pass();

    expect(calls.sort()).toEqual(['direct:one', 'direct:two']);
    expect(await parentAskRepo.get(two.id)).toMatchObject({ status: 'answered', answer: answer('Two says hello.') });
    expect(await parentAskRepo.get(one.id)).toMatchObject({ status: 'waiting' });
  });

  it('keeps a refusal and its reason', async () => {
    const ask = await waitingAsk('direct:r');
    const { read } = fakeRead(new Map([['direct:r', { answer: { status: 'refused', reason: 'Over the limit.' }, next: 1 } as ReadAnswerResult<ParentAskAnswer>]]));
    await new ParentAskInFlight({ getKey: async () => key, read }).pass();
    expect(await parentAskRepo.get(ask.id)).toMatchObject({ status: 'refused', failureReason: 'Over the limit.' });
  });

  it('never reads a tutor turn, and asks the network nothing when no ask is waiting', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    const turn = await tutorRepo.addTurn({ sessionId: session.id, mode: 'reading', request: { mode: 'reading', strictness: 'meaning-gated', session_history: [] } });
    await tutorRepo.markSent(turn.id, { txid: 'direct:turn', seq: 0, mill: 'aa' });
    const { read, calls } = fakeRead(new Map());
    const getKey = vi.fn(async () => key);
    await new ParentAskInFlight({ getKey, read }).pass();
    expect(calls).toEqual([]);
    expect(getKey).not.toHaveBeenCalled();
    expect((await tutorRepo.getTurn(turn.id))?.status).toBe('waiting');
  });

  it('reads nothing without a key', async () => {
    await waitingAsk('direct:a');
    const { read, calls } = fakeRead(new Map());
    await new ParentAskInFlight({ getKey: async () => undefined, read }).pass();
    expect(calls).toEqual([]);
  });

  it('fails an ask still unanswered at the deadline, even when the factory cannot be reached', async () => {
    const sentAt = new Date('2025-10-07T12:00:00Z');
    const early = await waitingAsk('direct:early', sentAt);
    const late = await waitingAsk('direct:late', sentAt);
    const read: Read = async (params) => {
      if (params.txid === 'direct:late') throw new Error('offline');
      return pending;
    };
    let now = new Date(sentAt.getTime() + PARENT_ASK_DEADLINE_MS - 1);
    const inFlight = new ParentAskInFlight({ getKey: async () => key, read, now: () => now });
    await inFlight.pass();
    expect((await parentAskRepo.get(early.id))?.status).toBe('waiting');

    now = new Date(sentAt.getTime() + PARENT_ASK_DEADLINE_MS);
    await inFlight.pass();
    expect(await parentAskRepo.get(early.id)).toMatchObject({ status: 'failed' });
    expect((await parentAskRepo.get(late.id))?.failureReason).toMatch(/too long/i);
  });

  it('still takes an answer that is there at the deadline', async () => {
    const sentAt = new Date('2025-10-07T12:00:00Z');
    const ask = await waitingAsk('direct:a', sentAt);
    const { read } = fakeRead(new Map([['direct:a', answered(answer())]]));
    const now = new Date(sentAt.getTime() + PARENT_ASK_DEADLINE_MS + 5000);
    await new ParentAskInFlight({ getKey: async () => key, read, now: () => now }).pass();
    expect((await parentAskRepo.get(ask.id))?.status).toBe('answered');
  });
});

describe('ParentAskInFlight.start', () => {
  it('passes on load, every 5 s, and when the browser comes online; stop ends it', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const inFlight = new ParentAskInFlight({ getKey: async () => key, read: fakeRead(new Map()).read });
    const spy = vi.spyOn(inFlight, 'pass').mockResolvedValue(undefined);

    const stop = inFlight.start();
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(TUTOR_POLL_INTERVAL_MS * 2);
    expect(spy).toHaveBeenCalledTimes(3);
    window.dispatchEvent(new Event('online'));
    expect(spy).toHaveBeenCalledTimes(4);

    stop();
    vi.advanceTimersByTime(TUTOR_POLL_INTERVAL_MS * 3);
    window.dispatchEvent(new Event('online'));
    expect(spy).toHaveBeenCalledTimes(4);
  });
});

describe('through the real reader and a fake Postern', () => {
  it('sends an ask, gets the mill\'s answer back, and a bad answer fails the ask instead', async () => {
    const appKey = PrivateKey.fromRandom();
    const millKey = PrivateKey.fromRandom();
    const server = makeServer(millKey);

    const sendOne = async () => {
      const ask = await parentAskRepo.add({ profileId: 'p1', question: request.question, request });
      const sent = await sendGrist({ key: appKey, input: request, header: { ...PARENT_ASK_GRIND }, fetchImpl: server.fetch });
      await parentAskRepo.markSent(ask.id, sent);
      return { ask, txid: sent.txid };
    };
    const good = await sendOne();
    const bad = await sendOne();
    const reply = (txid: string, body: unknown) =>
      server.inject({
        signer: millKey.toPublicKey().toString(),
        payload: answerPayload({ from: millKey, to: appKey, plaintext: { re: txid, status: 'answered', answer: body } }),
      });
    reply(good.txid, answer('Real answer.'));
    reply(bad.txid, { answer: 7 });

    await new ParentAskInFlight({ getKey: async () => appKey, fetchImpl: server.fetch }).pass();

    expect(await parentAskRepo.get(good.ask.id)).toMatchObject({ status: 'answered', answer: answer('Real answer.') });
    expect(await parentAskRepo.get(bad.ask.id)).toMatchObject({ status: 'failed' });
    expect((await parentAskRepo.get(bad.ask.id))?.answer).toBeUndefined();
  });
});

// mw-bhvxcn.6: any number of turns in flight, each answer applied to its own turn as it arrives. The reads
// are a fake here, except in the last test, which goes through the real readAnswer and a fake Postern.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivateKey } from '@bsv/sdk';
import { db } from '../../src/data/db';
import { tutorRepo } from '../../src/data/repositories';
import type { TutorAnswer, TutorMode } from '../../src/contracts';
import {
  GristInFlight,
  TUTOR_POLL_INTERVAL_MS,
  TUTOR_TURN_DEADLINE_MS,
  TUTOR_TURN_GRIND,
  isTutorAnswer,
  sendGrist,
} from '../../src/grist';
import type { ReadAnswerParams, ReadAnswerResult } from '../../src/grist';
import { answerPayload, makeServer } from '../fixtures/grist/fake-postern';

const key = PrivateKey.fromRandom();
const answer = (action: TutorAnswer['action'] = 'continue'): TutorAnswer => ({
  action,
  focus_words: [],
  prompt_to_child: `prompt for ${action}`,
  layer_diagnosis: 'none',
});

async function waitingTurn(sessionId: string, txid: string, mode: TutorMode = 'reading', sentAt?: Date) {
  const turn = await tutorRepo.addTurn({
    sessionId,
    mode,
    request: { mode, strictness: 'meaning-gated', session_history: [] },
    sentAt,
  });
  await tutorRepo.markSent(turn.id, { txid, seq: 0, mill: 'aa' });
  return turn;
}

type Read = (params: ReadAnswerParams<TutorAnswer>) => Promise<ReadAnswerResult<TutorAnswer>>;
const pending: ReadAnswerResult<TutorAnswer> = { pending: true, next: 0 };

/** A reader that answers only the txids in `ready`, from `ready`'s verdicts; every call is logged. */
function fakeRead(ready: Map<string, ReadAnswerResult<TutorAnswer>>) {
  const calls: string[] = [];
  const read: Read = async (params) => {
    calls.push(params.txid);
    return ready.get(params.txid) ?? pending;
  };
  return { read, calls };
}

const answered = (a: TutorAnswer): ReadAnswerResult<TutorAnswer> => ({ answer: { status: 'answered', answer: a }, next: 1 });

beforeEach(async () => {
  await db.delete();
  await db.open();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('GristInFlight.pass', () => {
  it('polls every waiting txid in one pass and leaves the unanswered waiting', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    await waitingTurn(session.id, 'direct:one');
    await waitingTurn(session.id, 'direct:two');
    const sending = await tutorRepo.addTurn({ sessionId: session.id, mode: 'math', request: { mode: 'math', strictness: 'meaning-gated', session_history: [] } });
    const { read, calls } = fakeRead(new Map());

    await new GristInFlight({ getKey: async () => key, read }).pass();

    expect(calls.sort()).toEqual(['direct:one', 'direct:two']);
    expect((await tutorRepo.listWaiting()).map((t) => t.txid).sort()).toEqual(['direct:one', 'direct:two']);
    expect((await tutorRepo.getTurn(sending.id))?.status).toBe('sending');
  });

  it('lands answers that arrive in reverse order on their own turns, and keeps a stale one', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    const old = await waitingTurn(session.id, 'direct:old', 'problem-in');
    const two = await waitingTurn(session.id, 'direct:two');
    const three = await waitingTurn(session.id, 'direct:three', 'math');
    await tutorRepo.moveOn(session.id, old.index);

    const ready = new Map<string, ReadAnswerResult<TutorAnswer>>();
    const { read } = fakeRead(ready);
    const inFlight = new GristInFlight({ getKey: async () => key, read });

    // turn 3's answer comes first: turn 2 is still waiting, untouched
    ready.set('direct:three', answered(answer('math_probe')));
    await inFlight.pass();
    expect(await tutorRepo.getTurn(three.id)).toMatchObject({ status: 'answered', answer: answer('math_probe') });
    expect(await tutorRepo.getTurn(two.id)).toMatchObject({ status: 'waiting' });

    // then turn 2's, and the one the session moved past
    ready.set('direct:two', answered(answer('reread_word')));
    ready.set('direct:old', answered(answer('encourage')));
    await inFlight.pass();
    expect(await tutorRepo.getTurn(two.id)).toMatchObject({ status: 'answered', answer: answer('reread_word') });
    expect(await tutorRepo.getTurn(three.id)).toMatchObject({ status: 'answered', answer: answer('math_probe') });
    expect(await tutorRepo.getTurn(old.id)).toMatchObject({ status: 'stale', answer: answer('encourage') });
    expect(await tutorRepo.listWaiting()).toEqual([]);
  });

  it('routes a refusal to its turn', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    const turn = await waitingTurn(session.id, 'direct:one');
    const refusal: ReadAnswerResult<TutorAnswer> = { answer: { status: 'refused', reason: 'Not today.' }, next: 1 };
    const { read } = fakeRead(new Map([['direct:one', refusal]]));
    await new GristInFlight({ getKey: async () => key, read }).pass();
    expect(await tutorRepo.getTurn(turn.id)).toMatchObject({ status: 'refused', failureReason: 'Not today.' });
  });

  it('a read that throws leaves that turn waiting and does not stop the others', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    const a = await waitingTurn(session.id, 'direct:a');
    const b = await waitingTurn(session.id, 'direct:b');
    const read: Read = async (params) => {
      if (params.txid === 'direct:a') throw new Error('offline');
      return answered(answer());
    };
    await new GristInFlight({ getKey: async () => key, read }).pass();
    expect((await tutorRepo.getTurn(a.id))?.status).toBe('waiting');
    expect((await tutorRepo.getTurn(b.id))?.status).toBe('answered');
  });

  it('does nothing, and asks nothing, with no key', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    await waitingTurn(session.id, 'direct:a');
    const { read, calls } = fakeRead(new Map());
    await new GristInFlight({ getKey: async () => undefined, read }).pass();
    expect(calls).toEqual([]);
  });

  it('two passes at once settle a turn once', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    await waitingTurn(session.id, 'direct:a');
    const { read, calls } = fakeRead(new Map([['direct:a', answered(answer())]]));
    const inFlight = new GristInFlight({ getKey: async () => key, read });
    await Promise.all([inFlight.pass(), inFlight.pass()]);
    expect(calls).toHaveLength(1);
    expect((await tutorRepo.listTurns(session.id))[0].status).toBe('answered');
  });
});

describe('GristInFlight deadline', () => {
  it('has 180 s and polls every 5 s', () => {
    expect(TUTOR_TURN_DEADLINE_MS).toBe(180_000);
    expect(TUTOR_POLL_INTERVAL_MS).toBe(5_000);
  });

  it('fails a turn still unanswered 180 s after it was sent, and not one second sooner', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    const sentAt = new Date('2026-10-07T12:00:00Z');
    const turn = await waitingTurn(session.id, 'direct:a', 'reading', sentAt);
    const { read } = fakeRead(new Map());
    let now = new Date(sentAt.getTime() + TUTOR_TURN_DEADLINE_MS - 1000);
    const inFlight = new GristInFlight({ getKey: async () => key, read, now: () => now });

    await inFlight.pass();
    expect((await tutorRepo.getTurn(turn.id))?.status).toBe('waiting');

    now = new Date(sentAt.getTime() + TUTOR_TURN_DEADLINE_MS);
    await inFlight.pass();
    expect(await tutorRepo.getTurn(turn.id)).toMatchObject({ status: 'failed' });
    expect((await tutorRepo.getTurn(turn.id))?.failureReason).toMatch(/too long/i);
  });

  it('still takes an answer that is there at the deadline', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    const sentAt = new Date('2026-10-07T12:00:00Z');
    const turn = await waitingTurn(session.id, 'direct:a', 'reading', sentAt);
    const { read } = fakeRead(new Map([['direct:a', answered(answer())]]));
    const now = new Date(sentAt.getTime() + TUTOR_TURN_DEADLINE_MS + 5000);
    await new GristInFlight({ getKey: async () => key, read, now: () => now }).pass();
    expect((await tutorRepo.getTurn(turn.id))?.status).toBe('answered');
  });

  it('fails a deadlined turn even when the factory cannot be reached', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    const sentAt = new Date('2026-10-07T12:00:00Z');
    const turn = await waitingTurn(session.id, 'direct:a', 'reading', sentAt);
    const read: Read = async () => {
      throw new Error('offline');
    };
    const now = new Date(sentAt.getTime() + TUTOR_TURN_DEADLINE_MS + 1);
    await new GristInFlight({ getKey: async () => key, read, now: () => now }).pass();
    expect((await tutorRepo.getTurn(turn.id))?.status).toBe('failed');
  });
});

describe('GristInFlight.start', () => {
  it('passes on load, every 5 s, and when the browser comes online; stop ends it', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const inFlight = new GristInFlight({ getKey: async () => key, read: fakeRead(new Map()).read });
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
  it('sends three turns, gets two answers back in reverse order, and each lands on its own turn', async () => {
    const appKey = PrivateKey.fromRandom();
    const millKey = PrivateKey.fromRandom();
    const server = makeServer(millKey);
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });

    const turns = [];
    for (const mode of ['problem-in', 'reading', 'math'] as const) {
      const turn = await tutorRepo.addTurn({ sessionId: session.id, mode, request: { mode, strictness: 'meaning-gated', session_history: [] } });
      const sent = await sendGrist({ key: appKey, files: [], input: { mode }, header: { ...TUTOR_TURN_GRIND }, fetchImpl: server.fetch });
      await tutorRepo.markSent(turn.id, sent);
      turns.push({ turn, txid: sent.txid });
    }

    for (const index of [2, 1]) {
      server.inject({
        signer: millKey.toPublicKey().toString(),
        payload: answerPayload({
          from: millKey,
          to: appKey,
          plaintext: { re: turns[index].txid, status: 'answered', answer: answer(index === 2 ? 'math_probe' : 'reread_word') },
        }),
      });
    }

    await new GristInFlight({ getKey: async () => appKey, fetchImpl: server.fetch }).pass();

    expect(await tutorRepo.getTurn(turns[2].turn.id)).toMatchObject({ status: 'answered', answer: answer('math_probe') });
    expect(await tutorRepo.getTurn(turns[1].turn.id)).toMatchObject({ status: 'answered', answer: answer('reread_word') });
    expect(await tutorRepo.getTurn(turns[0].turn.id)).toMatchObject({ status: 'waiting' });
    expect(isTutorAnswer(answer())).toBe(true);
  });
});

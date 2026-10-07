// mw-bhvxcn.6: TutorSession and TutorTurn rows in Dexie, and the repository that keeps them: a turn is
// found by its txid when its answer comes, and an answer for a session that has moved on is kept, marked stale.
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/data/db';
import { tutorRepo } from '../../src/data/repositories';
import type { TutorAnswer, TutorRequest } from '../../src/contracts';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const request = (over: Partial<TutorRequest> = {}): TutorRequest => ({
  mode: 'reading',
  strictness: 'meaning-gated',
  target_text: 'The character ran home.',
  session_history: [],
  ...over,
});

const answer = (over: Partial<TutorAnswer> = {}): TutorAnswer => ({
  action: 'reread_word',
  focus_words: [{ word: 'character', chunks: ['char', 'ac', 'ter'] }],
  prompt_to_child: 'Let us sound out that long word together.',
  layer_diagnosis: 'reading',
  ...over,
});

async function sentTurn(sessionId: string, txid: string, mode: TutorRequest['mode'] = 'reading') {
  const turn = await tutorRepo.addTurn({ sessionId, mode, request: request({ mode }) });
  await tutorRepo.markSent(turn.id, { txid, seq: 1, mill: 'mill-key' });
  return turn;
}

describe('tutorRepo', () => {
  it('opens at a schema with the tutor stores and the older tables intact', () => {
    expect(db.verno).toBeGreaterThanOrEqual(14);
    expect(db.tables.map((t) => t.name)).toEqual(expect.arrayContaining(['tutorSessions', 'tutorTurns', 'tutorBlobs', 'photoImports']));
  });

  it('creates an active session with the strictness and what is known of the problem', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'precision', problemKind: 'word', targetText: 'Anna has 3 apples.' });
    expect(session).toMatchObject({ profileId: 'p1', strictness: 'precision', problemKind: 'word', targetText: 'Anna has 3 apples.', status: 'active' });
    expect(session.startedAt).toBeInstanceOf(Date);
    expect(session.endedAt).toBeUndefined();
    expect(await tutorRepo.getSession(session.id)).toEqual(session);
  });

  it('numbers turns in the order they are added and lists them by index', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    const a = await tutorRepo.addTurn({ sessionId: session.id, mode: 'problem-in', request: request({ mode: 'problem-in' }) });
    const b = await tutorRepo.addTurn({ sessionId: session.id, mode: 'reading', request: request() });
    const other = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    await tutorRepo.addTurn({ sessionId: other.id, mode: 'reading', request: request() });

    expect([a.index, b.index]).toEqual([1, 2]);
    expect(a.status).toBe('sending');
    expect((await tutorRepo.listTurns(session.id)).map((t) => t.id)).toEqual([a.id, b.id]);
    expect(await tutorRepo.listTurns(other.id)).toHaveLength(1);
  });

  it('keeps blobs by id and links them to a turn as attachments', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    const blob = await tutorRepo.putBlob({ bytes: new Uint8Array([1, 2, 3]).buffer, mime: 'audio/webm', name: 'reading.webm' });
    const turn = await tutorRepo.addTurn({
      sessionId: session.id,
      mode: 'reading',
      request: request(),
      attachments: [{ kind: 'audio', blobId: blob.id }],
    });
    expect((await tutorRepo.getTurn(turn.id))?.attachments).toEqual([{ kind: 'audio', blobId: blob.id }]);
    const stored = await tutorRepo.getBlob(blob.id);
    expect(stored?.mime).toBe('audio/webm');
    expect(stored?.name).toBe('reading.webm');
    expect(Array.from(new Uint8Array(stored!.bytes))).toEqual([1, 2, 3]);
  });

  it('markSent records the txid and waits; markFailed ends a turn that cannot be sent', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    const turn = await sentTurn(session.id, 'direct:aa');
    expect(await tutorRepo.getTurn(turn.id)).toMatchObject({ status: 'waiting', txid: 'direct:aa', seq: 1, mill: 'mill-key' });
    expect((await tutorRepo.listWaiting()).map((t) => t.id)).toEqual([turn.id]);

    await tutorRepo.markFailed(turn.id, 'The factory cannot be reached right now.');
    expect(await tutorRepo.getTurn(turn.id)).toMatchObject({ status: 'failed', failureReason: 'The factory cannot be reached right now.' });
    expect(await tutorRepo.listWaiting()).toEqual([]);
  });

  it('applyAnswer lands an answer on the turn its txid names, with the time it arrived', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    const turn = await sentTurn(session.id, 'direct:aa');
    const at = new Date('2026-10-07T12:00:00Z');

    const applied = await tutorRepo.applyAnswer('direct:aa', { status: 'answered', answer: answer() }, at);
    expect(applied).toMatchObject({ id: turn.id, status: 'answered', answeredAt: at, answer: answer() });
    expect(await tutorRepo.getTurn(turn.id)).toEqual(applied);
  });

  it('applyAnswer records a refusal or failure with its reason and no answer', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    const a = await sentTurn(session.id, 'direct:aa');
    const b = await sentTurn(session.id, 'direct:bb');
    await tutorRepo.applyAnswer('direct:aa', { status: 'refused', reason: 'Too big.' });
    await tutorRepo.applyAnswer('direct:bb', { status: 'failed', reason: 'The grind broke.' });
    expect(await tutorRepo.getTurn(a.id)).toMatchObject({ status: 'refused', failureReason: 'Too big.' });
    expect(await tutorRepo.getTurn(b.id)).toMatchObject({ status: 'failed', failureReason: 'The grind broke.' });
    expect((await tutorRepo.getTurn(a.id))?.answer).toBeUndefined();
  });

  it('applyAnswer never throws on a txid it does not know', async () => {
    await expect(tutorRepo.applyAnswer('direct:nobody', { status: 'answered', answer: answer() })).resolves.toBeUndefined();
    expect(await db.tutorTurns.count()).toBe(0);
  });

  it('applyAnswer keeps the answer but marks the turn stale once the session has ended', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    const turn = await sentTurn(session.id, 'direct:aa');
    await tutorRepo.endSession(session.id);
    expect(await tutorRepo.getSession(session.id)).toMatchObject({ status: 'ended' });
    expect((await tutorRepo.getSession(session.id))?.endedAt).toBeInstanceOf(Date);

    const applied = await tutorRepo.applyAnswer('direct:aa', { status: 'answered', answer: answer() });
    expect(applied).toMatchObject({ id: turn.id, status: 'stale', answer: answer() });
    expect(applied?.answeredAt).toBeInstanceOf(Date);
  });

  it('applyAnswer marks stale a turn the child moved past, and only up to the turn moved past', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    const one = await sentTurn(session.id, 'direct:aa');
    const two = await sentTurn(session.id, 'direct:bb');
    await tutorRepo.moveOn(session.id, one.index);

    expect(await tutorRepo.applyAnswer('direct:aa', { status: 'answered', answer: answer() })).toMatchObject({ status: 'stale' });
    expect(await tutorRepo.applyAnswer('direct:bb', { status: 'answered', answer: answer() })).toMatchObject({ id: two.id, status: 'answered' });
  });

  it('applyAnswer leaves a turn that is already settled as it is', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    await sentTurn(session.id, 'direct:aa');
    const first = await tutorRepo.applyAnswer('direct:aa', { status: 'answered', answer: answer() });
    const again = await tutorRepo.applyAnswer('direct:aa', { status: 'answered', answer: answer({ action: 'done' }) });
    expect(again).toEqual(first);
    expect(again?.answer?.action).toBe('reread_word');
  });
});

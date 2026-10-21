// mw-kuy7rx.25: a long reading (up to ten minutes) gets a deadline and an upload limit that fit its length, not the
// fixed 180 s tutor deadline and the door's 30 s. Other turns keep 180 s.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivateKey } from '@bsv/sdk';
import { db } from '../../src/data/db';
import { tutorRepo } from '../../src/data/repositories';
import type { TutorMode } from '../../src/contracts';
import {
  GristInFlight,
  READING_AUDIO_BYTES_PER_SECOND,
  TUTOR_TURN_DEADLINE_MS,
  readingDeadlineMs,
  sendGrist,
  uploadTimeoutMs,
} from '../../src/grist';
import type { ReadAnswerResult } from '../../src/grist';
import type { TutorAnswer } from '../../src/contracts';
import { MAX_RECORDING_MS, READING_AUDIO_BITS_PER_SECOND } from '../../src/audio';
import { HALF_SENT_MS, failHalfSent, sendReading } from '../../src/features/tutor';
import { factoryFor } from '../fixtures/grist/bsv-kit-fake';

const key = PrivateKey.fromRandom();
const HEADER = { app: 'spellforge', kind: 'tutor-turn', v: '1' };
const pending: ReadAnswerResult<TutorAnswer> = { pending: true, next: 0 };
/** The mill scorer's limit for a clip: 120 s + 0.5 s per audio second, 540 s at most (mw-5r3p30.685). */
const scorerLimitMs = (seconds: number) => Math.min(540, 120 + 0.5 * seconds) * 1000;

beforeEach(async () => {
  await db.delete();
  await db.open();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('readingDeadlineMs', () => {
  it('counts a clip at the bit rate the recorder asks for', () => {
    expect(READING_AUDIO_BYTES_PER_SECOND).toBe(READING_AUDIO_BITS_PER_SECOND / 8);
  });

  it.each([20, 300, 600])('for a %i s clip covers the mill scorer, a model step and the upload', (seconds) => {
    const deadline = readingDeadlineMs(seconds);
    const upload = uploadTimeoutMs(seconds * READING_AUDIO_BYTES_PER_SECOND);
    expect(deadline).toBeGreaterThanOrEqual(scorerLimitMs(seconds) + upload + 30_000);
    expect(deadline).toBeGreaterThanOrEqual(TUTOR_TURN_DEADLINE_MS);
  });

  it('grows with the clip, and a ten-minute clip waits past ten minutes', () => {
    expect(readingDeadlineMs(20)).toBeLessThan(readingDeadlineMs(300));
    expect(readingDeadlineMs(300)).toBeLessThan(readingDeadlineMs(600));
    expect(readingDeadlineMs(MAX_RECORDING_MS / 1000)).toBeGreaterThan(MAX_RECORDING_MS);
  });

  it('is never below 180 s, whatever it is given', () => {
    expect(readingDeadlineMs(0)).toBeGreaterThanOrEqual(180_000);
    expect(readingDeadlineMs(Number.NaN)).toBe(180_000);
    expect(readingDeadlineMs(undefined)).toBe(180_000);
  });
});

describe('uploadTimeoutMs', () => {
  it('keeps the door 30 s for a small file and gives a big one longer', () => {
    expect(uploadTimeoutMs(0)).toBe(30_000);
    expect(uploadTimeoutMs(10_000)).toBeLessThan(31_000);
    expect(uploadTimeoutMs(600 * READING_AUDIO_BYTES_PER_SECOND)).toBeGreaterThan(90_000);
  });
});

async function waitingTurn(mode: TutorMode, sentAt: Date, clipSeconds?: number) {
  const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
  const turn = await tutorRepo.addTurn({
    sessionId: session.id,
    mode,
    request: { mode, strictness: 'meaning-gated', session_history: [] },
    sentAt,
    ...(clipSeconds !== undefined ? { clipSeconds } : {}),
  });
  await tutorRepo.markSent(turn.id, { txid: `direct:${mode}`, seq: 0, mill: 'aa' });
  return turn;
}

describe('GristInFlight and a long reading', () => {
  const sentAt = new Date('2026-10-20T12:00:00Z');
  const read = async () => pending;

  it('keeps waiting for a 600 s reading past 180 s, and fails it only at its own deadline', async () => {
    const turn = await waitingTurn('reading', sentAt, 600);
    let now = new Date(sentAt.getTime() + TUTOR_TURN_DEADLINE_MS + 1000);
    const inFlight = new GristInFlight({ getKey: async () => key, read, now: () => now });

    await inFlight.pass();
    expect((await tutorRepo.getTurn(turn.id))?.status).toBe('waiting');

    now = new Date(sentAt.getTime() + readingDeadlineMs(600) - 1000);
    await inFlight.pass();
    expect((await tutorRepo.getTurn(turn.id))?.status).toBe('waiting');

    now = new Date(sentAt.getTime() + readingDeadlineMs(600));
    await inFlight.pass();
    expect((await tutorRepo.getTurn(turn.id))?.status).toBe('failed');
  });

  it('says a reading took too long to check, in words for a reading', async () => {
    const turn = await waitingTurn('reading', sentAt, 20);
    const now = new Date(sentAt.getTime() + readingDeadlineMs(20));
    await new GristInFlight({ getKey: async () => key, read, now: () => now }).pass();
    expect((await tutorRepo.getTurn(turn.id))?.failureReason).toBe('That reading took too long to check. Try a shorter one.');
  });

  it('says a reading that has no clip length on file took too long to check, and waits no less than 180 s', async () => {
    const turn = await waitingTurn('reading', sentAt);
    const inFlight = new GristInFlight({ getKey: async () => key, read, now: () => new Date(sentAt.getTime() + 179_000) });
    await inFlight.pass();
    expect((await tutorRepo.getTurn(turn.id))?.status).toBe('waiting');
    await new GristInFlight({ getKey: async () => key, read, now: () => new Date(sentAt.getTime() + 180_000) }).pass();
    expect(await tutorRepo.getTurn(turn.id)).toMatchObject({ status: 'failed', failureReason: expect.stringMatching(/reading took too long to check/) });
  });

  it('keeps 180 s and its own words for a maths turn', async () => {
    const turn = await waitingTurn('math', sentAt);
    const now = new Date(sentAt.getTime() + TUTOR_TURN_DEADLINE_MS);
    await new GristInFlight({ getKey: async () => key, read, now: () => now }).pass();
    expect(await tutorRepo.getTurn(turn.id)).toMatchObject({ status: 'failed', failureReason: 'The tutor took too long to answer. You can try again.' });
  });
});

describe('sendGrist with a long clip', () => {
  /** The fake Postern, with the blob upload taking `uploadMs` of (fake) time before it answers; `uploading` settles
   *  once the upload has begun (sealing a 2.4 MB clip takes real time first). */
  function slowUpload(uploadMs: number) {
    const fake = factoryFor(key);
    const real = fake.fetch;
    let begun: () => void = () => undefined;
    const uploading = new Promise<void>((resolve) => {
      begun = resolve;
    });
    const fetchImpl: typeof fetch = async (input, init) => {
      if (String(input).endsWith('/api/blobs')) {
        begun();
        await new Promise((resolve) => setTimeout(resolve, uploadMs));
      }
      return real(input, init);
    };
    return { fetchImpl, uploading };
  }

  const clip600 = () => ({ bytes: new Uint8Array(600 * READING_AUDIO_BYTES_PER_SECOND).fill(7), mime: 'audio/webm', name: 'reading-1.webm' });

  it('does not cut a 600 s clip whose upload takes 60 s (the door default would at 30 s)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const slow = slowUpload(60_000);
    const settled = sendGrist({ key, files: [clip600()], input: { mode: 'reading' }, header: HEADER, fetchImpl: slow.fetchImpl }).then(
      (sent) => sent,
      (error: unknown) => error,
    );
    await slow.uploading;
    await vi.advanceTimersByTimeAsync(61_000);
    const result = await settled;
    expect(result).toMatchObject({ txid: expect.stringMatching(/^direct:/) });
  });

  it('still gives up on an upload that outlasts the limit for its size', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const limit = uploadTimeoutMs(600 * READING_AUDIO_BYTES_PER_SECOND);
    const slow = slowUpload(limit + 5_000);
    const settled = sendGrist({ key, files: [clip600()], input: {}, header: HEADER, fetchImpl: slow.fetchImpl }).then(
      () => undefined,
      (error: unknown) => error,
    );
    await slow.uploading;
    await vi.advanceTimersByTimeAsync(limit + 1_000);
    expect((await settled) as Error).toMatchObject({ name: 'ApiTimeoutError' });
  });
});

describe('sendReading', () => {
  it('keeps the clip length on the turn, so the deadline can follow it', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    const send = vi.fn(async () => ({ txid: 'direct:x', seq: 1, mill: 'aa' }));
    const recording = { blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }), mime: 'audio/webm', durationMs: 599_400 };

    const turn = await sendReading({ session, targetText: 'A long text.', recording }, { getKey: async () => key, sendGrist: send });

    expect((await tutorRepo.getTurn(turn.id))?.clipSeconds).toBe(600);
  });
});

describe('failHalfSent and a long reading', () => {
  it('lets a 600 s reading go on uploading past 30 s, and fails it once its upload limit has passed', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    const sentAt = new Date('2026-10-20T12:00:00Z');
    const request = { mode: 'reading' as const, strictness: 'meaning-gated' as const, session_history: [] };
    const long = await tutorRepo.addTurn({ sessionId: session.id, mode: 'reading', request, sentAt, clipSeconds: 600 });
    const short = await tutorRepo.addTurn({ sessionId: session.id, mode: 'math', request: { ...request, mode: 'math' }, sentAt });

    await failHalfSent(await tutorRepo.listTurns(session.id), new Date(sentAt.getTime() + HALF_SENT_MS));
    expect((await tutorRepo.getTurn(long.id))?.status).toBe('sending');
    expect((await tutorRepo.getTurn(short.id))?.status).toBe('failed');

    await failHalfSent(await tutorRepo.listTurns(session.id), new Date(sentAt.getTime() + uploadTimeoutMs(600 * READING_AUDIO_BYTES_PER_SECOND) + HALF_SENT_MS));
    expect((await tutorRepo.getTurn(long.id))?.status).toBe('failed');
  });
});

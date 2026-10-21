// mw-lzq4rs: a file whose upload outlasts its limit on a working connection is told as 'sending took too long',
// not as 'the tutor cannot be reached' (the same fault as Lampas mw-5r3p30.690). A timeout of the delivery, after the
// files are up, or a factory that is down, still says the tutor cannot be reached.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivateKey } from '@bsv/sdk';
import { door } from 'bsv-kit/bsv';
import { db } from '../../src/data/db';
import { tutorRepo } from '../../src/data/repositories';
import { READING_AUDIO_BYTES_PER_SECOND, UploadTimeoutError, uploadTimeoutMs } from '../../src/grist';
import { sendMath, sendProblem, sendReading } from '../../src/features/tutor';
import { sayWhy } from '../../src/features/tutor/tutor-flow';
import { factoryFor } from '../fixtures/grist/bsv-kit-fake';

const key = PrivateKey.fromRandom();
const SLOW = /took too long.*check (your|the) connection/i;
const NOT_REACHED = /cannot be reached/;

beforeEach(async () => {
  await db.delete();
  await db.open();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A factory whose request to `endsWith` takes `ms` to answer, and a promise that settles once that request has begun. */
function slowAt(endsWith: string, ms: number) {
  const fake = factoryFor(key);
  let begun: () => void = () => undefined;
  const reached = new Promise<void>((resolve) => {
    begun = resolve;
  });
  const fetchImpl: typeof fetch = async (input, init) => {
    if (String(input).endsWith(endsWith)) {
      begun();
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    return fake.fetch(input, init);
  };
  return { fetchImpl, reached };
}

const clipSeconds = 600;
const clipBytes = clipSeconds * READING_AUDIO_BYTES_PER_SECOND;
const photo = async () => ({ bytes: new Uint8Array(200_000).fill(3), mime: 'image/jpeg', name: 'problem.jpg' });

describe('a file whose upload times out', () => {
  it('tells a reading it was slow to send, with the turn failed so Retry is offered', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    const slow = slowAt('/api/blobs', uploadTimeoutMs(clipBytes) + 5_000);
    const recording = { blob: new Blob([new Uint8Array(clipBytes).fill(7)], { type: 'audio/webm' }), mime: 'audio/webm', durationMs: clipSeconds * 1000 };

    const sending = sendReading({ session, targetText: 'A long text.', recording }, { getKey: async () => key, fetchImpl: slow.fetchImpl });
    await slow.reached;
    await vi.advanceTimersByTimeAsync(uploadTimeoutMs(clipBytes) + 1_000);
    const turn = await sending;

    const stored = await tutorRepo.getTurn(turn.id);
    expect(stored?.status).toBe('failed');
    expect(stored?.failureReason).toMatch(SLOW);
    expect(stored?.failureReason).not.toMatch(NOT_REACHED);
  });

  it('tells a photo of a problem it was slow to send', async () => {
    const slow = slowAt('/api/blobs', uploadTimeoutMs(200_000) + 5_000);
    const sending = sendProblem(
      { profileId: 'p1', strictness: 'meaning-gated', source: { kind: 'photo', file: new Blob(['x'], { type: 'image/jpeg' }) } },
      { getKey: async () => key, shrink: photo, fetchImpl: slow.fetchImpl },
    );
    await slow.reached;
    await vi.advanceTimersByTimeAsync(uploadTimeoutMs(200_000) + 1_000);
    const session = await sending;

    const [turn] = await tutorRepo.listTurns(session.id);
    expect(turn.status).toBe('failed');
    expect(turn.failureReason).toMatch(SLOW);
  });

  it("tells a maths turn's photo of work it was slow to send", async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    const slow = slowAt('/api/blobs', uploadTimeoutMs(200_000) + 5_000);
    const sending = sendMath(
      { session, targetText: '2 + 2', photo: new Blob(['x'], { type: 'image/jpeg' }) },
      { getKey: async () => key, shrink: photo, fetchImpl: slow.fetchImpl },
    );
    await slow.reached;
    await vi.advanceTimersByTimeAsync(uploadTimeoutMs(200_000) + 1_000);
    const turn = await sending;

    expect(turn.status).toBe('failed');
    expect(turn.failureReason).toMatch(SLOW);
  });
});

describe('a send that is not the upload being slow still says the tutor cannot be reached', () => {
  it('a delivery that times out after the files are up', async () => {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    const slow = slowAt('/api/messages', uploadTimeoutMs(200_000) + 5_000);
    const sending = sendMath({ session, targetText: '2 + 2', photo: new Blob(['x'], { type: 'image/jpeg' }) }, { getKey: async () => key, shrink: photo, fetchImpl: slow.fetchImpl });
    await slow.reached;
    await vi.advanceTimersByTimeAsync(uploadTimeoutMs(200_000) + 1_000);
    const turn = await sending;

    expect(turn.status).toBe('failed');
    expect(turn.failureReason).toMatch(NOT_REACHED);
  });

  it('a factory that is down, or on standby', () => {
    expect(sayWhy(new door.BackendUnreachableError('no connection'))).toMatch(NOT_REACHED);
    expect(sayWhy(new door.RefusedError('The image upload failed.', 503))).toMatch(NOT_REACHED);
  });
});

describe('sayWhy for an upload that timed out', () => {
  it('says sending took too long, and keeps to the offline words when the device has no connection at all', () => {
    const error = new UploadTimeoutError(new door.ApiTimeoutError(true));
    expect(sayWhy(error)).toMatch(SLOW);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(sayWhy(error)).toMatch(NOT_REACHED);
  });

  it('is only the upload: a bare ApiTimeoutError (the delivery) is still the tutor being unreachable', () => {
    expect(sayWhy(new door.ApiTimeoutError(true))).toMatch(NOT_REACHED);
  });
});

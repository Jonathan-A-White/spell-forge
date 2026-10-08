// mw-026yqg.2: the Tutor turn, the parent ask and the word-list photo reach the factory through bsv-kit and its
// answers come back the same way, against bsv-kit's fake Postern (bsv-kit/testing). Each scenario sends the real
// way, opens what went out with the mill's key, answers as the mill, and reads what lands.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivateKey } from '@bsv/sdk';
import { fakePostern } from 'bsv-kit/testing';
import type { OcrManager } from '../../src/ocr';
import { db } from '../../src/data/db';
import { bsvWalletRepo, parentAskRepo, profileRepo, tutorRepo, wordListRepo, wordRepo } from '../../src/data/repositories';
import {
  GristInFlight,
  PARENT_ASK_GRIND,
  ParentAskInFlight,
  TUTOR_TURN_GRIND,
  WORD_LIST_GRIND,
  isParentAskAnswer,
  isTutorAnswer,
  isWordListAnswer,
  readAnswer,
  sendGrist,
} from '../../src/grist';
import type { TutorAnswer } from '../../src/contracts';
import { sendParentAsk } from '../../src/features/tutor/parent-ask-flow';
import { sendProblem, sendReading } from '../../src/features/tutor/tutor-flow';
import { pollPhotoImports, startPhotoImport } from '../../src/features/word-lists/photo-import';
import type { PhotoImportDeps } from '../../src/features/word-lists/photo-import';
import { delivered, factoryFor, keyBytes, replyAt, uploaded } from '../fixtures/grist/bsv-kit-fake';

const key = PrivateKey.fromRandom();
const getKey = async () => key;
const grind = { app: 'spellforge', kind: 'tutor-turn', v: '1' };
const tutorAnswer: TutorAnswer = { action: 'continue', focus_words: [], prompt_to_child: 'Read it again, slowly.', layer_diagnosis: 'none' };
const TXID = `direct:${'a'.repeat(64)}`;

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('Scenario: a Tutor turn goes out through bsv-kit and its answer lands on the turn', () => {
  it('sends a typed problem as a tutor-turn grist, keeps txid, seq and mill, and applies the mill\'s answer', async () => {
    const fake = factoryFor(key);
    fake.postResult = { txid: TXID, seq: 5 };

    const session = await sendProblem(
      { profileId: 'p1', strictness: 'meaning-gated', source: { kind: 'text', text: ' What is 12 times 4? ' } },
      { getKey, fetchImpl: fake.fetch },
    );

    const [sent] = delivered(fake);
    expect(sent.grist).toEqual(TUTOR_TURN_GRIND);
    expect(sent.input).toMatchObject({ mode: 'problem-in', strictness: 'meaning-gated', target_text: 'What is 12 times 4?' });
    expect(sent.attachments).toEqual([]);
    const [turn] = await tutorRepo.listTurns(session.id);
    expect(turn).toMatchObject({ status: 'waiting', txid: TXID, seq: 5, mill: fake.mill });

    replyAt(fake, 6, { re: TXID, status: 'answered', answer: tutorAnswer, grind });
    await new GristInFlight({ getKey, fetchImpl: fake.fetch }).pass();
    expect(await tutorRepo.getTurn(turn.id)).toMatchObject({ status: 'answered', answer: tutorAnswer });
  });

  it('sends a reading as an audio attachment named reading-1.webm, sealed to the mill, and keeps the scorers\' result', async () => {
    const fake = factoryFor(key);
    fake.postResult = { txid: TXID, seq: 1 };
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated' });
    const clip = new Uint8Array(3000).map((_, i) => (i * 7) % 256);

    const turn = await sendReading(
      { session, targetText: 'The fiend read.', recording: { blob: new Blob([clip], { type: 'audio/webm;codecs=opus' }), mime: 'audio/webm', durationMs: 4000 } },
      { getKey, fetchImpl: fake.fetch },
    );

    const [sent] = delivered(fake);
    expect(sent.grist).toEqual(TUTOR_TURN_GRIND);
    expect(sent.input).toMatchObject({ mode: 'reading', target_text: 'The fiend read.' });
    expect(sent.attachments).toHaveLength(1);
    expect(sent.attachments[0]).toMatchObject({ mime: 'audio/webm', name: 'reading-1.webm' });
    expect(uploaded(fake)[0]).toEqual(clip);
    expect((await tutorRepo.getTurn(turn.id))?.status).toBe('waiting');

    const readingResult = { local: { engine: 'local', words: [], accuracy: 0.9, seconds: 4 } };
    replyAt(fake, 2, { re: TXID, status: 'answered', answer: tutorAnswer, grind, reading_result: readingResult });
    await new GristInFlight({ getKey, fetchImpl: fake.fetch }).pass();
    expect(await tutorRepo.getTurn(turn.id)).toMatchObject({ status: 'answered', readingResult });
  });

  it('fails a turn the factory refuses to take, in words for the child: no licence, or unreachable', async () => {
    const noLicence = factoryFor(key);
    noLicence.failPost = { status: 401, error: 'no licence' };
    const first = await sendProblem({ profileId: 'p1', strictness: 'meaning-gated', source: { kind: 'text', text: 'Spell cat.' } }, { getKey, fetchImpl: noLicence.fetch });
    expect((await tutorRepo.listTurns(first.id))[0]).toMatchObject({ status: 'failed', failureReason: 'This device holds no licence to use the factory.' });

    const down = factoryFor(key);
    down.failPost = { status: 503, error: 'standby' };
    const second = await sendProblem({ profileId: 'p1', strictness: 'meaning-gated', source: { kind: 'text', text: 'Spell cat.' } }, { getKey, fetchImpl: down.fetch });
    expect((await tutorRepo.listTurns(second.id))[0].failureReason).toMatch(/cannot be reached/);
  });
});

describe('Scenario: a parent ask goes out through bsv-kit and its answer lands on the ask', () => {
  it('sends the question as a parent-ask grist and applies the mill\'s answer; a bad answer fails the ask', async () => {
    const fake = factoryFor(key);
    fake.postResult = { txid: TXID, seq: 1 };
    const good = await sendParentAsk({ profileId: 'p1', question: 'How is reading going?' }, { getKey, fetchImpl: fake.fetch });
    const otherTxid = `direct:${'c'.repeat(64)}`;
    fake.postResult = { txid: otherTxid, seq: 2 };
    const bad = await sendParentAsk({ profileId: 'p1', question: 'And maths?' }, { getKey, fetchImpl: fake.fetch });

    const [first] = delivered(fake);
    expect(first.grist).toEqual(PARENT_ASK_GRIND);
    expect(first.input).toMatchObject({ question: 'How is reading going?' });
    expect(good).toMatchObject({ status: 'waiting', txid: TXID, seq: 1, mill: fake.mill });

    replyAt(fake, 3, { re: TXID, status: 'answered', answer: { answer: 'Steady progress.', examples: ['fiend'] }, grind: { app: 'spellforge', kind: 'parent-ask', v: '1' } });
    replyAt(fake, 4, { re: otherTxid, status: 'answered', answer: { answer: 7 }, grind: { app: 'spellforge', kind: 'parent-ask', v: '1' } });
    await new ParentAskInFlight({ getKey, fetchImpl: fake.fetch }).pass();

    expect(await parentAskRepo.get(good.id)).toMatchObject({ status: 'answered', answer: { answer: 'Steady progress.', examples: ['fiend'] } });
    expect(await parentAskRepo.get(bad.id)).toMatchObject({ status: 'failed' });
  });
});

describe('Scenario: a photographed word list goes out through bsv-kit and its words land in the list', () => {
  const T0 = new Date('2026-10-08T10:00:00Z');
  let profileId: string;
  let listId: string;

  const ocr = (): OcrManager => ({
    extractWords: vi.fn(async () => ({ rawText: 'device', words: ['device'], confidence: 0.9, source: 'local' as const })),
    setRemoteEndpoint: vi.fn(),
  });

  beforeEach(async () => {
    profileId = (await profileRepo.create({ name: 'Ada' } as never)).id;
    listId = (
      await wordListRepo.create({ profileId, name: 'Week 1', language: 'en', testDate: null, createdAt: T0, source: 'camera', active: true, archived: false })
    ).id;
    await bsvWalletRepo.save({ id: 'w1', kind: 'wif', network: 'testnet', material: key.toWif([0xef]), address: 'addr', createdAt: T0 });
  });

  it('sends the photo as a word-list grist with its language, then lands the mill\'s words', async () => {
    const fake = factoryFor(key);
    fake.postResult = { txid: TXID, seq: 3 };
    const deps: PhotoImportDeps = {
      ocrManager: ocr(),
      sendGrist: (params) => sendGrist({ ...params, fetchImpl: fake.fetch }),
      readAnswer: (params) => readAnswer({ ...params, fetchImpl: fake.fetch }),
      shrink: async (blob) => ({ bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type }),
      isOnline: () => true,
      now: () => T0,
    };
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'list.jpg', { type: 'image/jpeg' });

    const started = await startPhotoImport({ listId, profileId, file, language: 'en' }, deps);

    const [sent] = delivered(fake);
    expect(sent.grist).toEqual(WORD_LIST_GRIND);
    expect(sent.input).toEqual({ language: 'en' });
    expect(sent.attachments).toHaveLength(1);
    expect(sent.attachments[0].mime).toBe('image/jpeg');
    expect(uploaded(fake)[0]).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(started).toMatchObject({ status: 'reading', txid: TXID, seq: 3, mill: fake.mill });

    replyAt(fake, 4, { re: TXID, status: 'answered', answer: { words: ['Fiend', 'chapter'] }, grind: { app: 'spellforge', kind: 'word-list', v: '1' } });
    await pollPhotoImports(T0, deps);

    expect((await db.photoImports.toArray())[0].status).toBe('factory');
    expect((await wordRepo.getByListId(listId)).map((w) => w.text).sort()).toEqual(['chapter', 'fiend']);
  });
});

describe('readAnswer, the app\'s reading of bsv-kit\'s page', () => {
  const GRIND = { app: 'spellforge', kind: 'word-list', v: '1', commit: 'abc123' };
  function setup() {
    const fake = factoryFor(key);
    const read = (since = 0, txid = TXID) => readAnswer({ key, txid, mill: fake.mill, since, isAnswer: isWordListAnswer, fetchImpl: fake.fetch });
    return { fake, read };
  }

  it('reads the mill\'s answer to the txid, with the grind that made it and the scorers\' reading_result', async () => {
    const { fake, read } = setup();
    fake.reply({ re: TXID, status: 'answered', answer: { words: ['a'] }, grind: GRIND, reading_result: { local: 1 } });
    expect(await read()).toEqual({ answer: { status: 'answered', answer: { words: ['a'] }, grind: GRIND, readingResult: { local: 1 } }, next: 1 });
  });

  it('is pending, with the cursor moved on, while no answer has come; and asks only after `since`', async () => {
    const { fake, read } = setup();
    fake.reply({ re: `direct:${'d'.repeat(64)}`, status: 'answered', answer: { words: [] }, grind: GRIND });
    expect(await read()).toEqual({ pending: true, next: 1 });
    fake.reply({ re: TXID, status: 'answered', answer: { words: ['late'] }, grind: GRIND });
    expect(await read(1)).toMatchObject({ answer: { status: 'answered' }, next: 2 });
    expect(await read(2)).toEqual({ pending: true, next: 2 });
  });

  it('skips an answer sealed by anyone but the mill', async () => {
    const real = factoryFor(key);
    // /api/me names the real mill, but the records are sealed and sent by another key
    const impostor = fakePostern({ base: real.base, appKey: keyBytes(key), millKey: keyBytes(PrivateKey.fromRandom()), mill: real.mill });
    impostor.reply({ re: TXID, status: 'answered', answer: { words: ['forged'] }, grind: GRIND });
    const result = await readAnswer({ key, txid: TXID, mill: real.mill, since: 0, isAnswer: isWordListAnswer, fetchImpl: impostor.fetch });
    expect(result).toMatchObject({ pending: true });
  });

  it('carries the reason of a refused or failed grist, and gives a plain one when there is none', async () => {
    const { fake, read } = setup();
    fake.reply({ re: TXID, status: 'refused', reason: 'You have used all of today\'s reads.', grind: GRIND });
    expect(await read()).toMatchObject({ answer: { status: 'refused', reason: 'You have used all of today\'s reads.' } });
    const second = setup();
    second.fake.reply({ re: TXID, status: 'failed', grind: GRIND });
    const result = await second.read();
    expect(result).toMatchObject({ answer: { status: 'failed' } });
    expect((result as { answer: { reason: string } }).answer.reason.length).toBeGreaterThan(0);
  });

  it('reads an answered grist whose answer fails the app\'s own check, or has none, or has an unknown status, as failed', async () => {
    for (const record of [
      { status: 'answered', answer: { words: [1, 2] } },
      { status: 'answered' },
      { status: 'maybe' },
    ]) {
      const { fake, read } = setup();
      fake.reply({ re: TXID, grind: GRIND, ...record } as never);
      const result = await read();
      expect(result).toMatchObject({ answer: { status: 'failed' }, next: 1 });
      expect((result as { answer: { reason: string } }).answer.reason.length).toBeGreaterThan(0);
    }
  });

  it('passes a backend failure up for the caller to retry on its next pass', async () => {
    const { fake, read } = setup();
    fake.onPoll = () => {
      throw new Error('down');
    };
    await expect(read()).rejects.toThrow();
  });

  it('holds the three answer guards to the same shapes the grinds name', () => {
    expect(isTutorAnswer(tutorAnswer)).toBe(true);
    expect(isParentAskAnswer({ answer: 'x', examples: [] })).toBe(true);
    expect(isWordListAnswer({ words: [] })).toBe(true);
  });
});

// tests/unit/photo-import.test.ts — mw-z361n.4: a photo goes to the factory first; a persisted pending
// import, a 2-minute fallback to the device's Tesseract, and the words landing in the list.
// fake-indexeddb, a fake ocrManager and fake sendGrist/readAnswer; fake timers only for the queue's
// interval, never around crypto.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivateKey } from '@bsv/sdk';
import { db } from '../../src/data/db';
import { bsvWalletRepo, profileRepo, statsRepo, wordListRepo, wordRepo } from '../../src/data/repositories';
import type { OcrManager } from '../../src/ocr';
import type { OcrResult } from '../../src/contracts/types';
import { GristOffline, GristUnlicensed } from '../../src/grist';
import type { GristAnswer, ReadAnswerResult } from '../../src/grist';
import type { WordListAnswer } from '../../src/grist';
import {
  PHOTO_IMPORT_DEADLINE_MS,
  forgetSettledPhotoImports,
  pollPhotoImports,
  startPhotoImport,
  startPhotoImportQueue,
} from '../../src/features/word-lists/photo-import';
import type { PhotoImportDeps } from '../../src/features/word-lists/photo-import';
import { addWordsToList } from '../../src/features/word-lists/add-words';

const T0 = new Date('2026-10-01T10:00:00Z');
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

type Read = ReadAnswerResult<WordListAnswer>;
const answered = (words: string[]): Read => ({ answer: { status: 'answered', answer: { words } } as GristAnswer<WordListAnswer>, next: 1 });
const verdictOf = (status: 'refused' | 'failed'): Read => ({ answer: { status, reason: 'no' }, next: 1 });
const pending: Read = { pending: true, next: 1 };

function ocrOf(words: string[]): OcrManager {
  const result: OcrResult = { rawText: words.join(' '), words, confidence: 0.9, source: 'local' };
  return { extractWords: vi.fn(async () => result), setRemoteEndpoint: vi.fn() };
}

function makeDeps(overrides: Partial<PhotoImportDeps> = {}) {
  const deps = {
    ocrManager: ocrOf(['device', 'words']),
    sendGrist: vi.fn(async () => ({ txid: 'direct:abc', seq: 7, mill: 'mill-key' })),
    readAnswer: vi.fn(async (): Promise<Read> => pending),
    shrink: vi.fn(async (blob: Blob) => ({ bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type })),
    isOnline: () => true,
    now: () => T0,
    ...overrides,
  } as PhotoImportDeps & {
    sendGrist: ReturnType<typeof vi.fn>;
    readAnswer: ReturnType<typeof vi.fn>;
    ocrManager: OcrManager;
  };
  return deps;
}

const photo = () => new File([new Uint8Array([1, 2, 3, 4])], 'list.jpg', { type: 'image/jpeg' });

// Only the interval is faked: fake-indexeddb and crypto need the real timers.
const useIntervalClock = () => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });

let profileId: string;
let listId: string;

async function wordTexts(): Promise<string[]> {
  return (await wordRepo.getByListId(listId)).map((w) => w.text).sort();
}

async function theImport() {
  const rows = await db.photoImports.toArray();
  expect(rows).toHaveLength(1);
  return rows[0];
}

async function giveWallet() {
  await bsvWalletRepo.save({
    id: 'w1',
    kind: 'wif',
    network: 'testnet',
    material: PrivateKey.fromRandom().toWif([0xef]),
    address: 'addr',
    createdAt: T0,
  });
}

async function start(deps: PhotoImportDeps) {
  return startPhotoImport({ listId, profileId, file: photo(), language: 'en' }, deps);
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  const profile = await profileRepo.create({ name: 'Ada', importFilterWords: ['Spelling', 'Words'] } as never);
  profileId = profile.id;
  const list = await wordListRepo.create({
    profileId,
    name: 'Week 1',
    language: 'en',
    testDate: null,
    createdAt: T0,
    source: 'camera',
    active: true,
    archived: false,
  });
  listId = list.id;
  await giveWallet();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sending a photo to the factory', () => {
  it('records the sent photo as a reading import with txid, seq, mill and a two-minute deadline', async () => {
    const deps = makeDeps();
    await start(deps);
    const row = await theImport();
    expect(row).toMatchObject({ listId, profileId, txid: 'direct:abc', seq: 7, mill: 'mill-key', status: 'reading', mime: 'image/jpeg', language: 'en' });
    expect(row.deadline.getTime() - row.sentAt.getTime()).toBe(PHOTO_IMPORT_DEADLINE_MS);
    expect(PHOTO_IMPORT_DEADLINE_MS).toBe(120_000);
    expect(new Uint8Array(row.photo as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(deps.ocrManager.extractWords).not.toHaveBeenCalled();
    expect(await wordTexts()).toEqual([]);
  });
});

describe('answers from the factory', () => {
  it('lands the answered words in the list, filtered, and settles as factory', async () => {
    const deps = makeDeps({ readAnswer: vi.fn(async () => answered(['Cat', ' dog ', 'spelling', 'cat'])) });
    await start(deps);
    await pollPhotoImports(T0, deps);
    expect(await wordTexts()).toEqual(['cat', 'dog']);
    const row = await theImport();
    expect(row.status).toBe('factory');
    expect(row.photo).toBeUndefined();
    expect(deps.readAnswer).toHaveBeenCalledWith(expect.objectContaining({ txid: 'direct:abc', mill: 'mill-key', since: 7 }));
    expect(deps.ocrManager.extractWords).not.toHaveBeenCalled();
  });

  it('does nothing while the factory has not answered and the deadline is not reached', async () => {
    const deps = makeDeps();
    await start(deps);
    await pollPhotoImports(minutes(1), deps);
    expect((await theImport()).status).toBe('reading');
    expect(await wordTexts()).toEqual([]);
  });

  it.each([
    ['refused', verdictOf('refused')],
    ['failed', verdictOf('failed')],
    ['answered with no words', answered([])],
    ['answered with only heading words', answered(['Spelling', 'words'])],
  ])('falls back to the device when the factory %s', async (_name, read) => {
    const deps = makeDeps({ readAnswer: vi.fn(async () => read) });
    await start(deps);
    await pollPhotoImports(T0, deps);
    // 'words' is one of the profile's heading words, so only 'device' survives the filter.
    expect(await wordTexts()).toEqual(['device']);
    expect((await theImport()).status).toBe('device');
    expect(deps.ocrManager.extractWords).toHaveBeenCalledTimes(1);
  });

  it('falls back to the device when nothing answers by two minutes', async () => {
    const deps = makeDeps();
    await start(deps);
    await pollPhotoImports(minutes(2), deps);
    const row = await theImport();
    expect(row.status).toBe('device');
    expect(row.photo).toBeUndefined();
    expect(await wordTexts()).toEqual(['device']);
    expect(deps.readAnswer).not.toHaveBeenCalled();
  });

  it('ignores an answer that arrives after the device has read the photo', async () => {
    const late = vi.fn(async () => answered(['late', 'arrival']));
    const deps = makeDeps({ readAnswer: late });
    await start(deps);
    await pollPhotoImports(minutes(3), deps);
    expect((await theImport()).status).toBe('device');
    await pollPhotoImports(minutes(4), deps);
    expect(late).not.toHaveBeenCalled();
    expect(await wordTexts()).toEqual(['device']);
    expect((await theImport()).status).toBe('device');
  });

  it('ignores an answer that lands while the device read is under way', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const readAnswer = vi.fn(async (): Promise<Read> => {
      await gate;
      return answered(['late']);
    });
    const deps = makeDeps({ readAnswer });
    await start(deps);
    const first = pollPhotoImports(T0, deps);
    // The deadline passes while the first pass still waits on the factory.
    const second = pollPhotoImports(minutes(3), deps);
    release();
    await Promise.all([first, second]);
    expect((await theImport()).status).toMatch(/^(factory|device)$/);
    // Whichever settled the import, the words landed exactly once.
    const texts = await wordTexts();
    expect(texts.length).toBe(new Set(texts).size);
    expect(texts.length).toBe(1);
  });
});

describe('the device reads at once', () => {
  it('when the device is offline, without waiting', async () => {
    const deps = makeDeps({ isOnline: () => false });
    await start(deps);
    expect(deps.sendGrist).not.toHaveBeenCalled();
    expect((await theImport()).status).toBe('device');
    expect(await wordTexts()).toEqual(['device']);
  });

  it('when there is no wallet key, without waiting', async () => {
    await bsvWalletRepo.wipe();
    const deps = makeDeps();
    await start(deps);
    expect(deps.sendGrist).not.toHaveBeenCalled();
    expect((await theImport()).status).toBe('device');
    expect(await wordTexts()).toEqual(['device']);
  });

  it('when sending throws GristOffline, without waiting', async () => {
    const deps = makeDeps({ sendGrist: vi.fn(async () => { throw new GristOffline(); }) });
    await start(deps);
    expect((await theImport()).status).toBe('device');
    expect(await wordTexts()).toEqual(['device']);
  });

  it('when sending throws GristUnlicensed (401 no_licence), without waiting', async () => {
    const deps = makeDeps({ sendGrist: vi.fn(async () => { throw new GristUnlicensed(); }) });
    await start(deps);
    expect((await theImport()).status).toBe('device');
    expect(await wordTexts()).toEqual(['device']);
  });

  it('settles as failed when the device finds no words, and drops the photo', async () => {
    const deps = makeDeps({ isOnline: () => false, ocrManager: ocrOf([]) });
    await start(deps);
    const row = await theImport();
    expect(row.status).toBe('failed');
    expect(row.photo).toBeUndefined();
    expect(await wordTexts()).toEqual([]);
  });

  it('applies the heading filter to the device read too', async () => {
    const deps = makeDeps({ isOnline: () => false, ocrManager: ocrOf(['Spelling', 'Words', 'apple', 'pear']) });
    await start(deps);
    expect(await wordTexts()).toEqual(['apple', 'pear']);
  });

  it('settles as failed when the device read finds only heading words', async () => {
    const deps = makeDeps({ isOnline: () => false, ocrManager: ocrOf(['Spelling', 'Words']) });
    await start(deps);
    expect((await theImport()).status).toBe('failed');
  });
});

describe('the heading filter on the factory answer', () => {
  it('drops the profile heading words from the answered words', async () => {
    const deps = makeDeps({ readAnswer: vi.fn(async () => answered(['Spelling', 'Words', 'apple'])) });
    await start(deps);
    await pollPhotoImports(T0, deps);
    expect(await wordTexts()).toEqual(['apple']);
  });
});

describe('words landing in the list', () => {
  it('does not add a word twice, in the answer or against words already in the list', async () => {
    await addWordsToList({ listId, profileId, words: ['apple'] });
    const deps = makeDeps({ readAnswer: vi.fn(async () => answered(['Apple', 'pear', 'PEAR', ' pear'])) });
    await start(deps);
    await pollPhotoImports(T0, deps);
    expect(await wordTexts()).toEqual(['apple', 'pear']);
    expect((await theImport()).status).toBe('factory');
  });

  it('creates a Word and a WordStats row for each new word', async () => {
    await addWordsToList({ listId, profileId, words: ['apple'] });
    const [word] = await wordRepo.getByListId(listId);
    expect(word).toMatchObject({ text: 'apple', listId, profileId });
    const stats = await statsRepo.getByWordId(word.id);
    expect(stats).toMatchObject({ profileId, currentBucket: 'new', timesAsked: 0 });
  });
});

describe('resuming', () => {
  it('an app restart resumes a reading import and polls it', async () => {
    await start(makeDeps());
    // A new "app": nothing in memory, only the stored import and fresh deps.
    const reopened = makeDeps({ readAnswer: vi.fn(async () => answered(['resumed'])) });
    await pollPhotoImports(minutes(1), reopened);
    expect(await wordTexts()).toEqual(['resumed']);
    expect((await theImport()).status).toBe('factory');
  });

  it('a deadline that passed while the app was away falls back at once on the next pass', async () => {
    await start(makeDeps());
    const reopened = makeDeps();
    await pollPhotoImports(minutes(30), reopened);
    expect((await theImport()).status).toBe('device');
    expect(await wordTexts()).toEqual(['device']);
  });
});

// The passes run over real IndexedDB, so each step waits for its effect rather than for a clock tick.
const calls = (deps: { readAnswer: ReturnType<typeof vi.fn> }, n: number) =>
  vi.waitFor(() => expect(deps.readAnswer).toHaveBeenCalledTimes(n));
const timers = (n: number) => vi.waitFor(() => expect(vi.getTimerCount()).toBe(n));

describe('the queue the app starts', () => {
  it('passes once at start, then every poll interval while an import is reading, and stops when none is', async () => {
    const deps = makeDeps();
    await start(deps);
    useIntervalClock();
    const stop = startPhotoImportQueue(deps);
    await calls(deps, 1);
    await timers(1);
    await vi.advanceTimersByTimeAsync(20_000);
    await calls(deps, 2);
    deps.readAnswer.mockImplementation(async () => answered(['arrived']));
    await vi.advanceTimersByTimeAsync(20_000);
    await vi.waitFor(async () => expect(await wordTexts()).toEqual(['arrived']));
    await timers(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(deps.readAnswer).toHaveBeenCalledTimes(3);
    stop();
  });

  it('passes again on the window online event, and no more once stopped', async () => {
    const deps = makeDeps();
    await start(deps);
    useIntervalClock();
    const stop = startPhotoImportQueue(deps);
    await calls(deps, 1);
    window.dispatchEvent(new Event('online'));
    await calls(deps, 2);
    stop();
    expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(new Event('online'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(deps.readAnswer).toHaveBeenCalledTimes(2);
  });

  it('starts polling when an import begins after the queue has started', async () => {
    const deps = makeDeps();
    useIntervalClock();
    const stop = startPhotoImportQueue(deps);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(vi.getTimerCount()).toBe(0);
    await start(deps);
    await timers(1);
    await vi.advanceTimersByTimeAsync(20_000);
    await calls(deps, 1);
    stop();
  });
});

describe('forgetSettledPhotoImports', () => {
  const row = (id: string, listId: string, status: 'reading' | 'factory' | 'device' | 'failed') => ({
    id,
    listId,
    profileId: 'p',
    mime: 'image/jpeg',
    language: 'en',
    sentAt: T0,
    deadline: minutes(2),
    status,
  });

  it("drops a list's settled imports, and only that list's, leaving one still reading", async () => {
    await db.photoImports.bulkAdd([
      row('a', 'list-a', 'device'),
      row('b', 'list-a', 'failed'),
      row('c', 'list-a', 'reading'),
      row('d', 'list-b', 'device'),
    ]);

    await forgetSettledPhotoImports('list-a');

    expect((await db.photoImports.toArray()).map((r) => r.id).sort()).toEqual(['c', 'd']);
  });
});

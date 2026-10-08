// src/features/word-lists/photo-import.ts — A photo of a word list goes to the factory first (mw-z361n.4).
// The import is stored (photo and all) so it survives the app closing; the factory has two minutes to
// answer, after which the device's Tesseract reads the same photo. Words land straight in the list.
// Resumable: everything a pass needs is in the photoImports table, never in memory.

import { useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import { PrivateKey } from '@bsv/sdk';
import { v4 as uuidv4 } from 'uuid';
import type { PhotoImport, PhotoImportStatus } from '../../contracts/types';
import { db } from '../../data/db';
import { bsvWalletRepo, profileRepo, wordListRepo } from '../../data/repositories';
import { filterImportWords } from '../../ocr';
import type { OcrManager } from '../../ocr';
import { WORD_LIST_GRIND, gristConfig, isWordListAnswer, readAnswer, sendGrist, shrinkPhoto } from '../../grist';
import type { GristPhoto, ReadAnswerParams, ReadAnswerResult, WordListAnswer } from '../../grist';
import { addWordsToList, normalizeWords } from './add-words';

/** How long the factory has before the device reads the photo itself (Q4 B). */
export const PHOTO_IMPORT_DEADLINE_MS = 120_000;

export interface PhotoImportDeps {
  ocrManager: OcrManager;
  /** The seams below default to the real thing; tests replace them. */
  sendGrist?: typeof sendGrist;
  readAnswer?: (params: ReadAnswerParams<WordListAnswer>) => Promise<ReadAnswerResult<WordListAnswer>>;
  shrink?: (blob: Blob) => Promise<GristPhoto>;
  isOnline?: () => boolean;
  now?: () => Date;
}

export interface StartPhotoImportParams {
  listId: string;
  profileId: string;
  file: Blob;
  language: string;
}

// One pass at a time: the interval, the online event and a fresh import must never settle the same
// import twice.
let queued: Promise<unknown> = Promise.resolve();
function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const run = queued.then(job, job);
  queued = run.catch(() => undefined);
  return run;
}

function readBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** Ends an import: the status, and the photo bytes gone. Only an import still reading can be settled. */
async function settle(id: string, status: Exclude<PhotoImportStatus, 'reading'>): Promise<void> {
  await db.transaction('rw', db.photoImports, async () => {
    const row = await db.photoImports.get(id);
    if (!row || row.status !== 'reading') return;
    await db.photoImports.put({ ...row, status, photo: undefined });
  });
}

/** Lands words in the import's list (heading words filtered out); false when there was nothing to land. */
async function landWords(row: PhotoImport, words: string[]): Promise<boolean> {
  const profile = await profileRepo.getById(row.profileId);
  const phrases = profile?.importFilterWords ?? [];
  // Lowercase first: the filter compares against lowercase heading words.
  const clean = normalizeWords(words);
  const kept = phrases.length > 0 ? filterImportWords(clean, phrases) : clean;
  if (kept.length === 0) return false;
  if (!(await wordListRepo.getById(row.listId))) return false;
  await addWordsToList({ listId: row.listId, profileId: row.profileId, words: kept });
  return true;
}

/** The device reads the stored photo; its words land the same way, status 'device' or, finding nothing, 'failed'. */
async function readOnDevice(id: string, deps: PhotoImportDeps): Promise<void> {
  const row = await db.photoImports.get(id);
  if (!row || row.status !== 'reading') return;
  let landed = false;
  try {
    if (row.photo) {
      const result = await deps.ocrManager.extractWords(new Blob([row.photo], { type: row.mime }));
      landed = await landWords(row, result.words);
    }
  } catch {
    landed = false;
  }
  await settle(id, landed ? 'device' : 'failed');
}

async function readFromFactory(row: PhotoImport, deps: PhotoImportDeps, key: PrivateKey): Promise<void> {
  if (!row.txid || !row.mill) return;
  const read = deps.readAnswer ?? readAnswer<WordListAnswer>;
  let result: ReadAnswerResult<WordListAnswer>;
  try {
    result = await read({ key, txid: row.txid, mill: row.mill, since: row.seq ?? 0, isAnswer: isWordListAnswer });
  } catch {
    return; // the factory cannot be reached right now: the next pass, or the deadline, decides
  }
  if ('pending' in result) return;

  // The device may have read it while this waited: an answer that comes late changes nothing.
  const current = await db.photoImports.get(row.id);
  if (!current || current.status !== 'reading') return;

  if (result.answer.status === 'answered' && (await landWords(current, result.answer.answer.words))) {
    await settle(row.id, 'factory');
    return;
  }
  await readOnDevice(row.id, deps);
}

async function walletKey(): Promise<PrivateKey | undefined> {
  const wallet = await bsvWalletRepo.getCurrent();
  if (!wallet) return undefined;
  try {
    return PrivateKey.fromWif(wallet.material);
  } catch {
    return undefined;
  }
}

/**
 * Stores the photo, then sends it to the factory. With no wallet key, no network, or a factory that will
 * not take it, the device reads it at once. Resolves when the import has settled or is waiting.
 */
export async function startPhotoImport(params: StartPhotoImportParams, deps: PhotoImportDeps): Promise<PhotoImport> {
  const now = deps.now ?? (() => new Date());
  const sentAt = now();
  const id = uuidv4();
  // Stored before anything is sent, so an app that closes mid-send still has the photo. With no txid yet
  // the poller leaves it alone until the deadline.
  await db.photoImports.add({
    id,
    listId: params.listId,
    profileId: params.profileId,
    photo: await readBytes(params.file),
    mime: params.file.type,
    language: params.language,
    sentAt,
    deadline: new Date(sentAt.getTime() + PHOTO_IMPORT_DEADLINE_MS),
    status: 'reading',
  });

  const key = await walletKey();
  let sent: { txid: string; seq: number; mill: string } | undefined;
  if (key && (deps.isOnline ?? (() => navigator.onLine))()) {
    try {
      const photo = await (deps.shrink ?? shrinkPhoto)(params.file);
      sent = await (deps.sendGrist ?? sendGrist)({
        key,
        files: [photo],
        input: { language: params.language },
        header: WORD_LIST_GRIND,
      });
    } catch {
      sent = undefined; // offline, unlicensed, over the limits or refused: the device reads it now
    }
  }

  if (sent) {
    const { txid, seq, mill } = sent;
    await exclusive(() =>
      db.transaction('rw', db.photoImports, async () => {
        const row = await db.photoImports.get(id);
        if (row && row.status === 'reading') await db.photoImports.put({ ...row, txid, seq, mill });
      }),
    );
    activeQueue?.refresh();
  } else {
    await exclusive(() => readOnDevice(id, deps));
  }
  return (await db.photoImports.get(id)) as PhotoImport;
}

/**
 * One pass over every import still reading. `now` is the clock: an import past its deadline, and any
 * the factory answered with nothing usable, is read on the device.
 */
export async function pollPhotoImports(now: Date | number, deps: PhotoImportDeps): Promise<void> {
  const at = typeof now === 'number' ? now : now.getTime();
  await exclusive(async () => {
    const reading = await db.photoImports.where('status').equals('reading').toArray();
    const key = reading.some((row) => row.txid) ? await walletKey() : undefined;
    for (const row of reading) {
      if (at >= row.deadline.getTime()) {
        await readOnDevice(row.id, deps);
      } else if (row.txid && key) {
        await readFromFactory(row, deps, key);
      }
    }
  });
}

interface Queue {
  refresh(): void;
}
let activeQueue: Queue | undefined;

/**
 * Starts what the app keeps running: one pass now (an import left from before, a deadline passed while the
 * app was away), one on the window's 'online' event, and one every poll interval while any import is
 * reading. Returns the function that stops it.
 */
export function startPhotoImportQueue(deps: PhotoImportDeps): () => void {
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;

  const refresh = async () => {
    if (stopped) return;
    const waiting = (await db.photoImports.where('status').equals('reading').count()) > 0;
    if (waiting && timer === undefined) timer = setInterval(() => void pass(), gristConfig.pollIntervalMs);
    if (!waiting && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
  const pass = async () => {
    if (stopped) return;
    await pollPhotoImports((deps.now ?? (() => new Date()))(), deps).catch(() => undefined);
    await refresh();
  };
  const onOnline = () => void pass();

  const queue: Queue = { refresh: () => void refresh() };
  activeQueue = queue;
  window.addEventListener('online', onOnline);
  void pass();

  return () => {
    stopped = true;
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    window.removeEventListener('online', onOnline);
    if (activeQueue === queue) activeQueue = undefined;
  };
}

/** The status of the newest import for a list, live: 'reading' | 'factory' | 'device' | 'failed', or null for none. */
export function usePhotoImportStatus(listId: string | null | undefined): PhotoImportStatus | null {
  const [status, setStatus] = useState<PhotoImportStatus | null>(null);

  useEffect(() => {
    if (!listId) return;
    const subscription = liveQuery(async () => {
      const rows = await db.photoImports.where('listId').equals(listId).toArray();
      rows.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
      return rows[0]?.status ?? null;
    }).subscribe({ next: setStatus, error: () => setStatus(null) });
    return () => subscription.unsubscribe();
  }, [listId]);

  return listId ? status : null;
}

/** Calls `onSettled` each time the number of imports still reading drops: words have landed, so lists should reload. */
export function useOnPhotoImportSettled(onSettled: () => void): void {
  const latest = useRef(onSettled);
  useEffect(() => {
    latest.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    let reading: number | undefined;
    const subscription = liveQuery(() => db.photoImports.where('status').equals('reading').count()).subscribe({
      next: (count) => {
        if (reading !== undefined && count < reading) latest.current();
        reading = count;
      },
      error: () => undefined,
    });
    return () => subscription.unsubscribe();
  }, []);
}

/** Drops a list's settled imports, and with them the 'Read on this device' note: called when the list is saved. */
export async function forgetSettledPhotoImports(listId: string): Promise<void> {
  await db.photoImports.where('listId').equals(listId).filter((row) => row.status !== 'reading').delete();
}

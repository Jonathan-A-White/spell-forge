// src/grist/read-answer.ts — Read the mill's answer to a grist from one page of GET /api/messages. Same rules as
// millwright's gristsend.go answerIn: an answer counts only if it is a grist record from the mill to this key,
// signed in by the mill when the backend says who signed, sealed by the mill, and answering this txid.
// How often to page and when to give up are the photo-import queue's business, not this module's.

import type { PrivateKey } from '@bsv/sdk';
import { posternApi } from './postern-api';
import type { PosternRecord } from './postern-api';
import { openText } from './seal';

/** Which grind answered, and the commit of the app's rig it was read at. */
export interface GristGrind {
  app?: string;
  kind?: string;
  v?: string;
  commit?: string;
}

/** The mill's verdict on one grist. `answered` carries an answer already checked; the others say why not. */
export type GristAnswer<T> =
  | { status: 'answered'; answer: T; grind?: GristGrind; readingResult?: unknown }
  | { status: 'refused' | 'failed'; reason: string; grind?: GristGrind };

export interface ReadAnswerParams<T> {
  key: PrivateKey;
  /** The `txid` sendGrist reported (`direct:<sha256>`). */
  txid: string;
  /** The mill's public key, hex, as sendGrist reported it. */
  mill: string;
  /** The cursor from the last page; 0 to read from the start. */
  since: number;
  /** The app's own check of an answer, run again here before anything is kept (protocol §19). */
  isAnswer: (value: unknown) => value is T;
  fetchImpl?: typeof fetch;
}

export type ReadAnswerResult<T> = { answer: GristAnswer<T>; next: number } | { pending: true; next: number };

const NOT_USABLE = 'The factory sent an answer this app could not use. You can try again.';
const NO_REASON = 'The factory gave no reason.';

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** The plaintext of an answer to `txid` that `record` carries, or undefined when it is not one. */
function answerIn(record: PosternRecord, key: PrivateKey, txid: string, me: string, mill: string): Record<string, unknown> | undefined {
  const payload = record.payload;
  if (!payload || payload.class !== 'grist' || typeof payload.ct !== 'string') return undefined;
  if (payload.from?.toLowerCase() !== mill || payload.to?.toLowerCase() !== me) return undefined;
  if (record.signer && record.signer.toLowerCase() !== mill) return undefined;

  const opened = openText(payload.ct, key);
  if (!opened || opened.sender !== mill) return undefined;
  let plaintext: unknown;
  try {
    plaintext = JSON.parse(opened.text);
  } catch {
    return undefined;
  }
  return isObject(plaintext) && plaintext.re === txid ? plaintext : undefined;
}

function verdict<T>(plaintext: Record<string, unknown>, isAnswer: (value: unknown) => value is T): GristAnswer<T> {
  const grind = isObject(plaintext.grind) ? (plaintext.grind as GristGrind) : undefined;
  const withGrind = grind ? { grind } : {};
  const reason = typeof plaintext.reason === 'string' && plaintext.reason ? plaintext.reason : NO_REASON;

  switch (plaintext.status) {
    case 'answered':
      return isAnswer(plaintext.answer)
        ? {
            status: 'answered',
            answer: plaintext.answer,
            ...withGrind,
            // the scorers' results, when the mill echoes them beside the answer
            ...(isObject(plaintext.reading_result) ? { readingResult: plaintext.reading_result } : {}),
          }
        : { status: 'failed', reason: NOT_USABLE, ...withGrind };
    case 'refused':
      return { status: 'refused', reason, ...withGrind };
    case 'failed':
      return { status: 'failed', reason, ...withGrind };
    default:
      return { status: 'failed', reason: NOT_USABLE, ...withGrind };
  }
}

/** Reads one page of messages after `since`: the answer to `txid` if the mill has sent it, else pending. */
export async function readAnswer<T>(params: ReadAnswerParams<T>): Promise<ReadAnswerResult<T>> {
  const { key, txid, since, isAnswer } = params;
  const me = key.toPublicKey().toString().toLowerCase();
  const mill = params.mill.toLowerCase();
  const { records, next } = await posternApi(key, params.fetchImpl).messages(since);

  for (const record of records) {
    const plaintext = answerIn(record, key, txid, me, mill);
    if (plaintext) return { answer: verdict(plaintext, isAnswer), next };
  }
  return { pending: true, next };
}

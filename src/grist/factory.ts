// src/grist/factory.ts — SpellForge's calls to the factory, as thin callers of bsv-kit. The door (bsv-kit/bsv) signs
// every call with the device key; sending and reading are bsv-kit/grist's. What is left here is what is the app's own:
// the device key as the door takes it, the app's reading of an answer (its own check, its own words), and the
// Blob-to-file step for a recording.

import type { PrivateKey } from '@bsv/sdk';
import { door } from 'bsv-kit/bsv';
import { grist } from 'bsv-kit/grist';
import { gristConfig } from './config';

export type GristHeader = grist.GristHeader;
/** A photo or a recording that travels with a grist: its bytes, its mime and, when it has one, its name. */
export type GristFile = grist.GristFile;
export type GristPhoto = grist.Photo;
export type SentGrist = grist.SentGrist;

/** The 32 bytes of the device key, which is what the door and bsv-kit/grist take. */
export const keyBytes = (key: PrivateKey): Uint8Array => Uint8Array.from(key.toArray('be', 32));

/** The factory's door for `key`. `fetchImpl` is the test seam; the door's own default is a safe call of the global fetch. */
export function factoryDoor(key: PrivateKey, fetchImpl?: typeof fetch): InstanceType<typeof door.Door> {
  return new door.Door({ baseUrl: gristConfig.backendUrl, key: keyBytes(key), ...(fetchImpl ? { fetch: fetchImpl } : {}) });
}

export interface SendGristParams {
  key: PrivateKey;
  /** Photos and recordings, in the order the grind should see them. */
  files?: GristFile[];
  /** The app's request, in the app's own schema; the mill hands it to the grind as data. */
  input: unknown;
  header: GristHeader;
  fetchImpl?: typeof fetch;
}

/**
 * Sends one grist: its files are sealed to the mill and uploaded, then the sealed request is delivered. Resolves with
 * the txid, the backend's seq and the mill key, which the app keeps to read the answer later. Throws bsv-kit's
 * GristInputError (nothing was sent) or the door's errors.
 */
export function sendGrist(params: SendGristParams): Promise<SentGrist> {
  const { key, header, input, files, fetchImpl } = params;
  return grist.sendGristRecord({
    door: factoryDoor(key, fetchImpl),
    key: keyBytes(key),
    app: header.app,
    kind: header.kind,
    v: header.v,
    ...(header.model ? { model: header.model } : {}),
    ...(header.effort ? { effort: header.effort } : {}),
    input,
    ...(files?.length ? { attachments: files } : {}),
  });
}

/** A Blob as a file: its bytes, its mime (a codec suffix is dropped by bsv-kit), and the name when one is given. */
export async function gristFileFromBlob(blob: Blob, name?: string): Promise<GristFile> {
  const buffer =
    typeof blob.arrayBuffer === 'function'
      ? await blob.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(blob);
        });
  return { bytes: new Uint8Array(buffer), mime: blob.type.split(';')[0].trim().toLowerCase(), ...(name ? { name } : {}) };
}

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

function verdict<T>(reply: grist.GristAnswer, isAnswer: (value: unknown) => value is T): GristAnswer<T> {
  const withGrind = isObject(reply.grind) ? { grind: reply.grind as GristGrind } : {};
  const reason = typeof reply.reason === 'string' && reply.reason ? reply.reason : NO_REASON;

  switch (reply.status) {
    case 'answered':
      return isAnswer(reply.answer)
        ? {
            status: 'answered',
            answer: reply.answer,
            ...withGrind,
            // the scorers' results, when the mill echoes them beside the answer
            ...(isObject(reply.reading_result) ? { readingResult: reply.reading_result } : {}),
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
  const { answer, next } = await grist.readAnswerPage(txid, {
    door: factoryDoor(key, params.fetchImpl),
    key: keyBytes(key),
    since,
    mill: params.mill.toLowerCase(),
  });
  return answer ? { answer: verdict(answer, isAnswer), next } : { pending: true, next };
}

/**
 * Asks the factory who this key is, once, so its first licence walk happens now and not on the child's first tutor
 * turn (the backend caches the walk). Resolves with nothing useful; callers that must not fail swallow the rejection.
 */
export async function warmLicence(key: PrivateKey, fetchImpl?: typeof fetch): Promise<void> {
  await factoryDoor(key, fetchImpl).me();
}

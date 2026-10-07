// src/grist/send-grist.ts — Send a grist: seal and upload the photos and recordings, then deliver the sealed request to the
// mill as a section 1 record of class 'grist' (docs/protocol.md §19, reference: millwright's gristsend.go).

import { PrivateKey, PublicKey, Utils } from '@bsv/sdk';
import { encodeRecordScript } from '../bsv';
import { GristBackendError, GristLimitError } from './errors';
import { posternApi } from './postern-api';
import { sealBytes, sealText } from './seal';

/** Which grind to run: the app, the kind, the version of the app's request schema (protocol §19). */
export interface GristHeader {
  app: string;
  kind: string;
  v: string;
  model?: string;
  effort?: string;
}

/** A file that travels with a grist: a photo, or a recording. `name` is sent when there is one. */
export interface GristFile {
  bytes: Uint8Array;
  mime: string;
  name?: string;
}

export type GristPhoto = GristFile;

export interface GristAttachment {
  hash: string;
  size: number;
  mime: string;
  name?: string;
}

export interface SendGristParams {
  key: PrivateKey;
  /** Photos and recordings, in the order the grind should see them. */
  files?: GristFile[];
  /** Photos only; the word-list import's older field, sent before `files`. */
  photos?: GristFile[];
  /** The app's request, in the app's own schema; the mill hands it to the grind as data. */
  input: unknown;
  header: GristHeader;
  fetchImpl?: typeof fetch;
}

export interface SentGrist {
  txid: string;
  seq: number;
  mill: string;
}

/** The limits a grist may be sent under (protocol §19; grinds/word-list.json, grinds/tutor-turn.json). */
export const GRIST_MAX_PHOTOS = 4;
export const GRIST_MAX_PHOTO_BYTES = 4_194_304;
export const GRIST_MIMES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];
export const GRIST_MAX_AUDIO_BYTES = 8_388_608;
export const GRIST_AUDIO_MIMES: readonly string[] = ['audio/webm', 'audio/ogg', 'audio/mp4'];

/** A mime type without its parameters ('audio/webm;codecs=opus' -> 'audio/webm'), lowercase. */
export function baseMime(mime: string): string {
  return mime.split(';')[0].trim().toLowerCase();
}

/** A Blob as a GristFile: its bytes, its mime (codec suffix dropped), and the name when one is given. */
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
  return { bytes: new Uint8Array(buffer), mime: baseMime(blob.type), ...(name ? { name } : {}) };
}

function checkFiles(files: GristFile[]): void {
  if (files.length > GRIST_MAX_PHOTOS) {
    throw new GristLimitError(`A grist carries at most ${GRIST_MAX_PHOTOS} files, not ${files.length}.`);
  }
  for (const file of files) {
    const mime = baseMime(file.mime);
    if (GRIST_AUDIO_MIMES.includes(mime)) {
      if (file.bytes.length > GRIST_MAX_AUDIO_BYTES) {
        throw new GristLimitError(`A recording of ${file.bytes.length} bytes is over the ${GRIST_MAX_AUDIO_BYTES} a grist may carry.`);
      }
    } else if (GRIST_MIMES.includes(mime)) {
      if (file.bytes.length > GRIST_MAX_PHOTO_BYTES) {
        throw new GristLimitError(`A photo of ${file.bytes.length} bytes is over the ${GRIST_MAX_PHOTO_BYTES} a grist may carry.`);
      }
    } else {
      throw new GristLimitError(`A file of type ${mime || 'unknown'} cannot be read: use a JPEG, PNG or WebP photo, or a WebM, Ogg or MP4 recording.`);
    }
  }
}

/**
 * Sends one grist. Everything that needs no network is checked first; then the mill's key is asked for, every
 * file is sealed to it and uploaded (a failed upload sends nothing), and the sealed request is delivered.
 */
export async function sendGrist(params: SendGristParams): Promise<SentGrist> {
  const { key, input, header } = params;
  const files = [...(params.photos ?? []), ...(params.files ?? [])];
  checkFiles(files);
  const api = posternApi(key, params.fetchImpl);

  const { mill } = await api.me();
  if (!mill) throw new GristBackendError('The factory names no mill to send a grist to.', 200);
  const millKey = PublicKey.fromString(mill);

  const attachments: GristAttachment[] = [];
  for (const file of files) {
    const { hash, size } = await api.uploadBlob(Uint8Array.from(sealBytes(file.bytes, key, millKey)));
    attachments.push({ hash, size, mime: baseMime(file.mime), ...(file.name ? { name: file.name } : {}) });
  }

  const plaintext = JSON.stringify({ grist: header, input, attachments });
  const envelope = {
    v: 1,
    kind: 'msg',
    class: 'grist',
    to: mill,
    from: key.toPublicKey().toString(),
    ts: Math.floor(Date.now() / 1000),
    ct: sealText(plaintext, key, millKey),
  };
  let scriptHex: string;
  try {
    scriptHex = encodeRecordScript(Utils.toArray(JSON.stringify(envelope), 'utf8')).toHex();
  } catch (cause) {
    throw new GristLimitError(cause instanceof Error ? cause.message : 'The grist is too large to send.');
  }

  const { txid, seq } = await api.deliver(scriptHex);
  return { txid, seq, mill };
}

// src/grist/send-grist.ts — Send a grist: seal and upload the photos, then deliver the sealed request to the
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

export interface GristPhoto {
  bytes: Uint8Array;
  mime: string;
}

export interface GristAttachment {
  hash: string;
  size: number;
  mime: string;
}

export interface SendGristParams {
  key: PrivateKey;
  photos: GristPhoto[];
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

/** The grind's limits (protocol §19; grinds/word-list.json). */
export const GRIST_MAX_PHOTOS = 4;
export const GRIST_MAX_PHOTO_BYTES = 4_194_304;
export const GRIST_MIMES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

function checkPhotos(photos: GristPhoto[]): void {
  if (photos.length > GRIST_MAX_PHOTOS) {
    throw new GristLimitError(`A grist carries at most ${GRIST_MAX_PHOTOS} photos, not ${photos.length}.`);
  }
  for (const photo of photos) {
    if (!GRIST_MIMES.includes(photo.mime)) {
      throw new GristLimitError(`A photo of type ${photo.mime || 'unknown'} cannot be read: use a JPEG, PNG or WebP.`);
    }
    if (photo.bytes.length > GRIST_MAX_PHOTO_BYTES) {
      throw new GristLimitError(`A photo of ${photo.bytes.length} bytes is over the ${GRIST_MAX_PHOTO_BYTES} a grist may carry.`);
    }
  }
}

/**
 * Sends one grist. Everything that needs no network is checked first; then the mill's key is asked for, every
 * photo is sealed to it and uploaded (a failed upload sends nothing), and the sealed request is delivered.
 */
export async function sendGrist(params: SendGristParams): Promise<SentGrist> {
  const { key, photos, input, header } = params;
  checkPhotos(photos);
  const api = posternApi(key, params.fetchImpl);

  const { mill } = await api.me();
  if (!mill) throw new GristBackendError('The factory names no mill to send a grist to.', 200);
  const millKey = PublicKey.fromString(mill);

  const attachments: GristAttachment[] = [];
  for (const photo of photos) {
    const { hash, size } = await api.uploadBlob(Uint8Array.from(sealBytes(photo.bytes, key, millKey)));
    attachments.push({ hash, size, mime: photo.mime });
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

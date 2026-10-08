// src/grist/postern-api.ts — The four Postern calls a grist needs (docs/api.md), each signed for that one
// request with a fresh challenge (the v2 scheme, as Postern's own app signs it in src/services/apiAuth.ts):
// GET /api/me, POST /api/blobs, POST /api/messages and GET /api/messages.

import type { PrivateKey } from '@bsv/sdk';
import { Hash, Utils } from '@bsv/sdk';
import { gristConfig } from './config';
import { GristBackendError, GristNeedsUpdate, GristOffline, GristUnlicensed } from './errors';

/** One record of GET /api/messages, as far as a grist reads it. */
export interface PosternRecord {
  seq: number;
  txid: string;
  /** The key that authenticated the delivery (direct records), or signed the transaction. */
  signer?: string;
  /** The section 1 envelope, when the record had one. */
  payload?: {
    v?: number;
    kind?: string;
    class?: string;
    to?: string;
    from?: string;
    ts?: number;
    ct?: string;
  };
}

export interface PosternMe {
  pubkey: string;
  mill?: string;
  network?: string;
  features?: string[];
  apps?: string[];
}

export interface PosternApi {
  me(): Promise<PosternMe>;
  /** Uploads already-sealed bytes; the backend addresses them by their sha256. */
  uploadBlob(bytes: Uint8Array<ArrayBuffer>): Promise<{ hash: string; size: number }>;
  /** Posts a section 1 record script, as hex, straight to the backend (protocol §9). */
  deliver(scriptHex: string): Promise<{ txid: string; seq: number }>;
  /** Every record after `since` that names this key, and the index head to page from next. */
  messages(since: number): Promise<{ records: PosternRecord[]; next: number }>;
}

type Fetch = typeof fetch;

interface Reply {
  status: number;
  body: unknown;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function words(reply: Reply): string {
  const error = isObject(reply.body) && typeof reply.body.error === 'string' ? reply.body.error : '';
  return error ? `The factory said ${reply.status}: ${error}` : `The factory said ${reply.status}.`;
}

function backendError(reply: Reply): GristBackendError {
  return new GristBackendError(words(reply), reply.status);
}

/** The reason a 401 gives, which is what the app matches on, never the words. */
function refusalReason(reply: Reply): string | undefined {
  return reply.status === 401 && isObject(reply.body) && typeof reply.body.reason === 'string'
    ? reply.body.reason
    : undefined;
}

/** The bytes a request's body hashes as: a string's UTF-8 bytes, a byte array as it is, none for no body. */
function bodyBytes(body: RequestInit['body']): Uint8Array {
  if (body === undefined || body === null) return new Uint8Array(0);
  if (typeof body === 'string') return new TextEncoder().encode(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  throw new Error('This request has a body of a kind that cannot be signed; nothing was sent.');
}

/** Bodies up to this size are hashed in script; a sealed photo (megabytes) by crypto.subtle. */
const SYNC_HASH_LIMIT = 64 * 1024;

/** The lower-case hex SHA-256 of `bytes`. */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (bytes.length <= SYNC_HASH_LIMIT) return Utils.toHex(Hash.sha256(Array.from(bytes)));
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Utils.toHex(Array.from(new Uint8Array(digest)));
}

/**
 * A client for the Postern backend that proves `key` on every call (docs/api.md, Authentication): it asks for a
 * challenge and signs the v2 message for this one request, five lines joined by "\n": "postern-v2", the method, the
 * request target as sent (path and query), the hex sha256 of the body (of nothing, for a GET) and the nonce
 * (one SHA-256 of the UTF-8 bytes, DER), then sends `Authorization: Postern2 <pubkey>:<nonce>:<sig>`.
 * A nonce is single use, so each call, and each retry, asks for its own. The v1 scheme (the nonce alone) is
 * gone: the backend refuses it with 401 reason 'signature-v1' and nothing here sends it.
 */
export function posternApi(key: PrivateKey, fetchImpl: Fetch = globalThis.fetch.bind(globalThis)): PosternApi {
  const pubkey = key.toPublicKey().toString();

  async function send(url: string, init: RequestInit): Promise<Reply> {
    let response: Response;
    try {
      response = await fetchImpl(url, init);
    } catch (cause) {
      throw new GristOffline(cause instanceof Error ? `The factory cannot be reached: ${cause.message}` : undefined);
    }
    if (response.status === 503) throw new GristOffline('The factory is on standby right now.');
    return { status: response.status, body: await readBody(response) };
  }

  async function challenge(): Promise<string> {
    const reply = await send(`${gristConfig.backendUrl}/api/challenge`, { method: 'GET' });
    if (reply.status !== 200) throw backendError(reply);
    if (!isObject(reply.body) || typeof reply.body.nonce !== 'string') {
      throw new GristBackendError('The factory sent a challenge that was not a nonce.', reply.status);
    }
    return reply.body.nonce;
  }

  /** One signed call; a 'nonce' refusal is retried once with a fresh challenge (nothing was acted on). */
  async function call(path: string, init: RequestInit, retried = false): Promise<Reply> {
    const nonce = await challenge();
    const method = (init.method ?? 'GET').toUpperCase();
    const message = `postern-v2\n${method}\n${path}\n${await sha256Hex(bodyBytes(init.body))}\n${nonce}`;
    const signature = key.sign(message).toDER('hex') as string;
    const reply = await send(`${gristConfig.backendUrl}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Postern2 ${pubkey}:${nonce}:${signature}` },
    });
    const reason = refusalReason(reply);
    if (reason === 'nonce' && !retried) return call(path, init, true);
    if (reason === 'signature-v1') throw new GristNeedsUpdate();
    if (reason === 'no_licence') throw new GristUnlicensed();
    if (reply.status < 200 || reply.status > 299) throw backendError(reply);
    return reply;
  }

  const postJson = (path: string, body: unknown) =>
    call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  return {
    async me() {
      const { status, body } = await call('/api/me', { method: 'GET' });
      if (!isObject(body) || typeof body.pubkey !== 'string') {
        throw new GristBackendError('The factory did not say who this device is.', status);
      }
      return body as unknown as PosternMe;
    },

    async uploadBlob(bytes) {
      const { status, body } = await call('/api/blobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: bytes,
      });
      if (!isObject(body) || typeof body.hash !== 'string' || typeof body.size !== 'number') {
        throw new GristBackendError('The factory did not say where it kept the photo.', status);
      }
      return { hash: body.hash, size: body.size };
    },

    async deliver(scriptHex) {
      const { status, body } = await postJson('/api/messages', { scriptHex });
      if (!isObject(body) || typeof body.txid !== 'string' || typeof body.seq !== 'number') {
        throw new GristBackendError('The factory did not say where it filed the grist.', status);
      }
      return { txid: body.txid, seq: body.seq };
    },

    async messages(since) {
      const { status, body } = await call(`/api/messages?since=${encodeURIComponent(String(since))}`, { method: 'GET' });
      if (!isObject(body) || typeof body.next !== 'number') {
        throw new GristBackendError('The factory sent its messages in a shape this app cannot read.', status);
      }
      const records = Array.isArray(body.records) ? (body.records as PosternRecord[]) : [];
      return { records, next: body.next };
    },
  };
}

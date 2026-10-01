// src/grist/postern-api.ts — The four Postern calls a grist needs (docs/api.md), each signed with a fresh
// challenge: GET /api/me, POST /api/blobs, POST /api/messages and GET /api/messages.

import type { PrivateKey } from '@bsv/sdk';
import { gristConfig } from './config';
import { GristBackendError, GristOffline, GristUnlicensed } from './errors';

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

/**
 * A client for the Postern backend that proves `key` on every call (docs/api.md, Authentication): it asks for a
 * challenge, signs the nonce string (one SHA-256, DER) and sends `Authorization: Postern <pubkey>:<nonce>:<sig>`.
 * A nonce is single use, so each call, and each retry, asks for its own.
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
    const signature = key.sign(nonce).toDER('hex') as string;
    const reply = await send(`${gristConfig.backendUrl}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Postern ${pubkey}:${nonce}:${signature}` },
    });
    const reason = refusalReason(reply);
    if (reason === 'nonce' && !retried) return call(path, init, true);
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

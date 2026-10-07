// tests/fixtures/grist/fake-postern.ts — A fetch stub that speaks the Postern backend's shapes (docs/api.md):
// challenge-signed calls, /api/me, /api/blobs, /api/messages. Same fake as tests/unit/grist-client.test.ts's
// (which keeps its own copy), shared here by the tutor-turn tests. No network.

import { expect } from 'vitest';
import { EncryptedMessage, Hash, PrivateKey, PublicKey, Signature, Utils } from '@bsv/sdk';
import { decodeRecordScript } from '../../../src/bsv';
import { gristConfig } from '../../../src/grist';

export interface StoredRecord {
  seq: number;
  txid: string;
  vout: number;
  scriptHex: string;
  height: number;
  firstSeen: string;
  signer?: string;
  payload?: Record<string, unknown>;
}

export interface Server {
  fetch: typeof fetch;
  calls: { method: string; path: string }[];
  blobs: Map<string, Uint8Array>;
  records: StoredRecord[];
  authorizations: string[];
  /** Refuse the next n authorized calls with 401 reason 'nonce'. */
  refuseNonce: number;
  /** Answer every authorized call with this status (and body) instead of serving it. */
  respondWith?: { status: number; body: Record<string, unknown> };
  licensed: boolean;
  /** Serve every record, not only those naming the caller: a client must not trust the backend's filter. */
  showAll: boolean;
  mill: string | undefined;
  /** Add a record as if the mill (or anyone) had sent it. */
  inject(record: { payload: Record<string, unknown>; signer?: string; txid?: string }): void;
}

export const toHex = (bytes: Uint8Array | number[]) => Utils.toHex(Array.from(bytes));
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export function makeServer(millKey: PrivateKey | undefined): Server {
  const issued = new Set<string>();
  const server: Server = {
    fetch: undefined as unknown as typeof fetch,
    calls: [],
    blobs: new Map(),
    records: [],
    authorizations: [],
    refuseNonce: 0,
    licensed: true,
    showAll: false,
    mill: millKey?.toPublicKey().toString(),
    inject({ payload, signer, txid }) {
      const seq = server.records.length + 1;
      server.records.push({
        seq,
        txid: txid ?? `direct:${toHex(Hash.sha256(Utils.toArray(`injected-${seq}`, 'utf8')))}`,
        vout: 0,
        scriptHex: '',
        height: 0,
        firstSeen: new Date().toISOString(),
        signer,
        payload,
      });
    },
  };

  server.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const method = init?.method ?? 'GET';
    server.calls.push({ method, path: url.pathname });
    expect(url.origin).toBe(new URL(gristConfig.backendUrl).origin);

    if (url.pathname === '/api/challenge') {
      const nonce = toHex(Hash.sha256(Utils.toArray(`${Math.random()}-${issued.size}`, 'utf8'))).repeat(2).slice(0, 112);
      issued.add(nonce);
      return json(200, { nonce });
    }

    const headers = (init?.headers ?? {}) as Record<string, string>;
    const authorization = headers.Authorization ?? '';
    server.authorizations.push(authorization);
    const match = /^Postern ([0-9a-f]{66}):([0-9a-f]+):([0-9a-f]+)$/.exec(authorization);
    if (!match) return json(401, { error: 'bad header', reason: 'malformed_authorization' });
    const [, pubkeyHex, nonce, sigHex] = match;
    if (server.refuseNonce > 0) {
      server.refuseNonce -= 1;
      issued.delete(nonce);
      return json(401, { error: 'unknown nonce', reason: 'nonce' });
    }
    if (!issued.delete(nonce)) return json(401, { error: 'unknown nonce', reason: 'nonce' });
    const verified = PublicKey.fromString(pubkeyHex).verify(nonce, Signature.fromDER(sigHex, 'hex'));
    if (!verified) return json(401, { error: 'bad signature', reason: 'signature' });
    if (!server.licensed) return json(401, { error: 'no licence', reason: 'no_licence' });
    if (server.respondWith) return json(server.respondWith.status, server.respondWith.body);

    if (url.pathname === '/api/me' && method === 'GET') {
      return json(200, {
        pubkey: pubkeyHex,
        ...(server.mill ? { mill: server.mill } : {}),
        network: 'testnet',
        features: ['grist'],
        apps: ['spellforge'],
      });
    }
    if (url.pathname === '/api/blobs' && method === 'POST') {
      const body = init?.body as Uint8Array;
      const hash = toHex(Hash.sha256(Array.from(body)));
      server.blobs.set(hash, body);
      return json(201, { hash, size: body.length });
    }
    if (url.pathname === '/api/messages' && method === 'POST') {
      const { scriptHex } = JSON.parse(init?.body as string) as { scriptHex: string };
      const decoded = decodeRecordScript(scriptHex);
      if (!decoded) return json(400, { error: 'not a record' });
      const payload = JSON.parse(Utils.toUTF8(decoded.payloadBytes)) as Record<string, unknown>;
      if (payload.from !== pubkeyHex) return json(403, { error: 'from is not the signer' });
      const txid = `direct:${toHex(Hash.sha256(Utils.toArray(scriptHex, 'hex')))}`;
      const seq = server.records.length + 1;
      server.records.push({
        seq, txid, vout: 0, scriptHex, height: 0, firstSeen: new Date().toISOString(), signer: pubkeyHex, payload,
      });
      return json(201, { txid, seq });
    }
    if (url.pathname === '/api/messages' && method === 'GET') {
      const since = Number(url.searchParams.get('since') ?? '0');
      const visible = server.records.filter(
        (r) => r.seq > since && (server.showAll || r.payload?.to === pubkeyHex || r.payload?.from === pubkeyHex),
      );
      return json(200, { records: visible, next: server.records.length });
    }
    return json(404, { error: 'no such route' });
  }) as typeof fetch;
  return server;
}

export const seal = (plain: string | Uint8Array, from: PrivateKey, to: PublicKey): number[] =>
  EncryptedMessage.encrypt(typeof plain === 'string' ? Utils.toArray(plain, 'utf8') : Array.from(plain), from, to);

export function answerPayload(opts: {
  plaintext: unknown;
  from: PrivateKey;
  to: PrivateKey;
  sealedBy?: PrivateKey;
  claimedFrom?: string;
  claimedTo?: string;
  cls?: string;
}) {
  const ct = Utils.toBase64(
    seal(JSON.stringify(opts.plaintext), opts.sealedBy ?? opts.from, opts.to.toPublicKey()),
  );
  return {
    v: 1,
    kind: 'msg',
    class: opts.cls ?? 'grist',
    to: opts.claimedTo ?? opts.to.toPublicKey().toString(),
    from: opts.claimedFrom ?? opts.from.toPublicKey().toString(),
    ts: 1_790_000_000,
    ct,
  };
}


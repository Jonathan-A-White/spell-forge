// tests/unit/grist-client.test.ts — src/grist/: the in-app Postern grist client, against a fetch
// stub that speaks docs/api.md's shapes, with a real mill key made here. No network.

import { describe, expect, it } from 'vitest';
import { EncryptedMessage, Hash, PrivateKey, PublicKey, Signature, Utils } from '@bsv/sdk';
import { decodeRecordScript } from '../../src/bsv';
import {
  GristBackendError,
  GristLimitError,
  GristNeedsUpdate,
  GristOffline,
  GristUnlicensed,
  gristConfig,
  posternApi,
  readAnswer,
  sendGrist,
  shrinkPhoto,
} from '../../src/grist';

const HEADER = { app: 'spellforge', kind: 'word-list', v: '1' };
const PHOTO_LIMIT = 4_194_304;

interface StoredRecord {
  seq: number;
  txid: string;
  vout: number;
  scriptHex: string;
  height: number;
  firstSeen: string;
  signer?: string;
  payload?: Record<string, unknown>;
}

interface Server {
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

const toHex = (bytes: Uint8Array | number[]) => Utils.toHex(Array.from(bytes));
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function makeServer(millKey: PrivateKey | undefined): Server {
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
    if (/^Postern /.test(authorization)) return json(401, { error: 'v1 is no longer accepted', reason: 'signature-v1' });
    const match = /^Postern2 ([0-9a-f]{66}):([0-9a-f]+):([0-9a-f]+)$/.exec(authorization);
    if (!match) return json(401, { error: 'bad header', reason: 'malformed_authorization' });
    const [, pubkeyHex, nonce, sigHex] = match;
    if (server.refuseNonce > 0) {
      server.refuseNonce -= 1;
      issued.delete(nonce);
      return json(401, { error: 'unknown nonce', reason: 'nonce' });
    }
    if (!issued.delete(nonce)) return json(401, { error: 'unknown nonce', reason: 'nonce' });
    // The v2 message over the request as received: method, raw target, body hash, nonce (docs/api.md).
    const target = String(input).replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, '');
    const sent = init?.body;
    const body = typeof sent === 'string' ? Utils.toArray(sent, 'utf8') : sent ? Array.from(sent as Uint8Array) : [];
    const message = `postern-v2\n${method.toUpperCase()}\n${target}\n${toHex(Hash.sha256(body))}\n${nonce}`;
    const verified = PublicKey.fromString(pubkeyHex).verify(message, Signature.fromDER(sigHex, 'hex'));
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

const seal = (plain: string | Uint8Array, from: PrivateKey, to: PublicKey): number[] =>
  EncryptedMessage.encrypt(typeof plain === 'string' ? Utils.toArray(plain, 'utf8') : Array.from(plain), from, to);

function answerPayload(opts: {
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

const isWords = (value: unknown): value is { words: string[] } =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as { words?: unknown }).words) &&
  (value as { words: unknown[] }).words.every((w) => typeof w === 'string');

const GRIST_TXID = 'direct:' + 'ab'.repeat(32);

describe('gristConfig', () => {
  it('names the backend in one place and polls every 20 seconds', () => {
    expect(gristConfig).toEqual({ backendUrl: 'https://postern.allmymind.org', pollIntervalMs: 20000 });
  });
});

describe('posternApi', () => {
  it('signs a fresh challenge for every call: the Authorization header verifies against its nonce and the request', async () => {
    const key = PrivateKey.fromRandom();
    const server = makeServer(PrivateKey.fromRandom());
    const api = posternApi(key, server.fetch);

    const me = await api.me();
    await api.me();

    expect(me.pubkey).toBe(key.toPublicKey().toString());
    expect(server.authorizations).toHaveLength(2);
    expect(server.authorizations.every((header) => header.startsWith('Postern2 '))).toBe(true);
    const [first, second] = server.authorizations.map((header) => header.split(' ')[1].split(':'));
    expect(first[0]).toBe(key.toPublicKey().toString());
    expect(first[1]).not.toBe(second[1]);
    // The fake server verifies each signature over the v2 message and would have answered 401 otherwise.
    expect(server.calls.filter((c) => c.path === '/api/challenge')).toHaveLength(2);
  });

  // Vectors from Postern's own signer (src/services/apiAuth.ts, apiFetch with the same key and nonce), so a
  // drift from the backend's message shows here rather than as a 401 in the field.
  describe('v2 vectors from Postern\'s signer', () => {
    const KEY = PrivateKey.fromHex(Utils.toHex(Array.from({ length: 32 }, (_, i) => i + 1)));
    const NONCE = 'ab'.repeat(32);
    const PUBKEY = '0284bf7562262bbd6940085748f3be6afa52ae317155181ece31b66351ccffa4b0';
    const GET_HEADER =
      `Postern2 ${PUBKEY}:${NONCE}:304402204fe40ded4c6b7298790e75a0852462f96296f76da4013a2d05e8956f92dd54fa022020b5eb7e9b7ee32ebaedfefb2df03e47562836e1de518bc2fbb7f8cf375ff17b`;
    const POST_HEADER =
      `Postern2 ${PUBKEY}:${NONCE}:3045022100efd82e4cc3d408bc0e185d270a8302ccb58ee436681b72d8ab407c5b40e5f78802202dd56f0e8fdfcf2233165b788c8fa57b35aafd0bc651e89def3e7d9a104373f0`;

    /** A fetch that hands out NONCE and records the Authorization header of the one signed call. */
    function capture() {
      const seen: { header?: string; url?: string; method?: string } = {};
      const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith('/api/challenge')) return json(200, { nonce: NONCE });
        seen.header = (init?.headers as Record<string, string>).Authorization;
        seen.url = String(input);
        seen.method = init?.method;
        return json(200, { pubkey: PUBKEY, next: 1, records: [], txid: 'direct:x', seq: 1 });
      }) as typeof fetch;
      return { seen, fetchImpl };
    }

    it('signs a GET with a query: postern-v2, GET, the raw target, the empty-body hash, the nonce', async () => {
      const { seen, fetchImpl } = capture();
      await posternApi(KEY, fetchImpl).messages(0);
      expect(seen.url).toBe(`${gristConfig.backendUrl}/api/messages?since=0`);
      expect(seen.header).toBe(GET_HEADER);
    });

    it('signs a POST with a body over the sha256 of its bytes', async () => {
      const { seen, fetchImpl } = capture();
      await posternApi(KEY, fetchImpl).deliver('ab');
      expect(seen.method).toBe('POST');
      expect(seen.header).toBe(POST_HEADER);
    });
  });

  it('signs a blob upload over the sha256 of the sealed bytes, and the target as sent', async () => {
    const server = makeServer(PrivateKey.fromRandom());
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 13) % 256);
    const stored = await posternApi(PrivateKey.fromRandom(), server.fetch).uploadBlob(bytes);
    expect(stored.size).toBe(bytes.length);
    expect(server.authorizations[0].startsWith('Postern2 ')).toBe(true);
  });

  it('never sends the v1 header', async () => {
    const server = makeServer(PrivateKey.fromRandom());
    const api = posternApi(PrivateKey.fromRandom(), server.fetch);
    await api.me();
    await api.messages(0);
    await api.deliver('ab').catch(() => undefined);
    expect(server.authorizations.length).toBeGreaterThan(0);
    expect(server.authorizations.some((header) => /^Postern /.test(header))).toBe(false);
  });

  it('retries a nonce refusal once with a fresh challenge', async () => {
    const server = makeServer(PrivateKey.fromRandom());
    server.refuseNonce = 1;

    await expect(posternApi(PrivateKey.fromRandom(), server.fetch).me()).resolves.toBeDefined();
    expect(server.calls.filter((c) => c.path === '/api/challenge')).toHaveLength(2);
    expect(server.calls.filter((c) => c.path === '/api/me')).toHaveLength(2);
  });

  it('gives up after a second nonce refusal with a GristBackendError carrying the status', async () => {
    const server = makeServer(PrivateKey.fromRandom());
    server.refuseNonce = 2;

    const failure = await posternApi(PrivateKey.fromRandom(), server.fetch).me().catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(GristBackendError);
    expect((failure as GristBackendError).status).toBe(401);
    expect(server.calls.filter((c) => c.path === '/api/me')).toHaveLength(2);
  });

  it("reads 401 signature-v1 as GristNeedsUpdate: 'SpellForge needs an update', not 'cannot reach'", async () => {
    const server = makeServer(PrivateKey.fromRandom());
    server.respondWith = { status: 401, body: { error: 'v1 is no longer accepted', reason: 'signature-v1' } };
    const failure = await posternApi(PrivateKey.fromRandom(), server.fetch).me().catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(GristNeedsUpdate);
    expect(failure).not.toBeInstanceOf(GristOffline);
    expect((failure as GristNeedsUpdate).message).toBe('SpellForge needs an update');
    expect(server.calls.filter((c) => c.path === '/api/me')).toHaveLength(1);
  });

  it('retries a nonce refusal of a POST once too, signing the body again', async () => {
    const server = makeServer(PrivateKey.fromRandom());
    server.refuseNonce = 1;
    const api = posternApi(PrivateKey.fromRandom(), server.fetch);
    await expect(api.uploadBlob(new Uint8Array([1, 2, 3]))).resolves.toMatchObject({ size: 3 });
    expect(server.calls.filter((c) => c.path === '/api/blobs')).toHaveLength(2);
  });

  it('reads 401 no_licence as GristUnlicensed', async () => {
    const server = makeServer(PrivateKey.fromRandom());
    server.licensed = false;
    await expect(posternApi(PrivateKey.fromRandom(), server.fetch).me()).rejects.toBeInstanceOf(GristUnlicensed);
  });

  it('reads a fetch TypeError as GristOffline', async () => {
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    await expect(posternApi(PrivateKey.fromRandom(), offline).me()).rejects.toBeInstanceOf(GristOffline);
  });

  it('reads a 503 standby as GristOffline', async () => {
    const server = makeServer(PrivateKey.fromRandom());
    server.respondWith = { status: 503, body: { error: 'standby' } };
    await expect(posternApi(PrivateKey.fromRandom(), server.fetch).me()).rejects.toBeInstanceOf(GristOffline);
  });

  it('reads any other refusal as GristBackendError with its status and words', async () => {
    const server = makeServer(PrivateKey.fromRandom());
    server.respondWith = { status: 500, body: { error: 'the index is on fire' } };
    const failure = await posternApi(PrivateKey.fromRandom(), server.fetch).me().catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(GristBackendError);
    expect((failure as GristBackendError).status).toBe(500);
    expect((failure as GristBackendError).message).toContain('the index is on fire');
  });

  it('defaults to a bound global fetch, never the bare one (browsers throw Illegal invocation)', async () => {
    const original = globalThis.fetch;
    let reached = false;
    globalThis.fetch = function (this: unknown) {
      if (this !== globalThis) return Promise.reject(new TypeError('Illegal invocation'));
      reached = true;
      return Promise.reject(new TypeError('no network in tests'));
    } as typeof fetch;
    try {
      const api = posternApi(PrivateKey.fromRandom());
      await expect(api.me()).rejects.toThrow('no network in tests');
    } finally {
      globalThis.fetch = original;
    }
    expect(reached).toBe(true);
  });
});

describe('sendGrist', () => {
  const photo = (n: number, mime = 'image/jpeg') => ({ bytes: new Uint8Array(n).map((_, i) => (i * 7 + n) % 256), mime });

  it('seals and uploads each photo, then delivers a section 1 grist envelope sealed to the mill', async () => {
    const appKey = PrivateKey.fromRandom();
    const millKey = PrivateKey.fromRandom();
    const server = makeServer(millKey);
    const photos = [photo(1500), photo(900, 'image/png')];
    const input = { schemaVersion: '1', requestType: 'word-list', language: 'en', listName: 'Week 3 <ready> & go' };

    const before = Math.floor(Date.now() / 1000);
    const sent = await sendGrist({ key: appKey, photos, input, header: HEADER, fetchImpl: server.fetch });
    const after = Math.floor(Date.now() / 1000);

    expect(sent.mill).toBe(millKey.toPublicKey().toString());
    expect(sent.txid).toMatch(/^direct:[0-9a-f]{64}$/);
    expect(sent.seq).toBe(1);

    // The uploaded bodies are BRC-78 seals only the mill's key opens.
    expect(server.blobs.size).toBe(2);
    const opened = [...server.blobs.values()].map((body) => Uint8Array.from(EncryptedMessage.decrypt(Array.from(body), millKey)));
    expect(opened).toEqual(photos.map((p) => p.bytes));
    expect(() => EncryptedMessage.decrypt(Array.from([...server.blobs.values()][0]), appKey)).toThrow();

    // The delivered script is OP_FALSE OP_RETURN 'nftgate' 0x01 <envelope>.
    expect(server.records).toHaveLength(1);
    const record = server.records[0];
    expect(record.txid).toBe(sent.txid);
    const decoded = decodeRecordScript(record.scriptHex);
    expect(decoded?.version).toBe(1);
    const envelope = JSON.parse(Utils.toUTF8(decoded!.payloadBytes)) as Record<string, unknown>;
    expect(Object.keys(envelope).sort()).toEqual(['class', 'ct', 'from', 'kind', 'to', 'ts', 'v']);
    expect(envelope).toMatchObject({
      v: 1,
      kind: 'msg',
      class: 'grist',
      to: millKey.toPublicKey().toString(),
      from: appKey.toPublicKey().toString(),
    });
    expect(Number.isInteger(envelope.ts)).toBe(true);
    expect(envelope.ts as number).toBeGreaterThanOrEqual(before);
    expect(envelope.ts as number).toBeLessThanOrEqual(after);

    // ct decrypts, with the mill's key only, to the plaintext of section 19.
    const text = Utils.toUTF8(EncryptedMessage.decrypt(Utils.toArray(envelope.ct as string, 'base64'), millKey));
    expect(JSON.parse(text)).toEqual({
      grist: HEADER,
      input,
      attachments: [...server.blobs.entries()].map(([hash, body], i) => ({
        hash,
        size: body.length,
        mime: photos[i].mime,
      })),
    });
    expect(text).toContain('Week 3 <ready> & go');
  });

  it('carries the optional model and effort of the header through untouched', async () => {
    const millKey = PrivateKey.fromRandom();
    const server = makeServer(millKey);
    const header = { ...HEADER, model: 'sonnet', effort: 'high' };
    await sendGrist({ key: PrivateKey.fromRandom(), photos: [photo(10)], input: {}, header, fetchImpl: server.fetch });
    const envelope = server.records[0].payload as { ct: string };
    const plain = JSON.parse(Utils.toUTF8(EncryptedMessage.decrypt(Utils.toArray(envelope.ct, 'base64'), millKey)));
    expect(plain.grist).toEqual(header);
  });

  it('refuses more than 4 photos, a mime outside jpeg/png/webp and a photo over 4 MiB before any network call', async () => {
    const server = makeServer(PrivateKey.fromRandom());
    const key = PrivateKey.fromRandom();
    const send = (photos: { bytes: Uint8Array; mime: string }[]) =>
      sendGrist({ key, photos, input: {}, header: HEADER, fetchImpl: server.fetch });

    await expect(send(Array.from({ length: 5 }, () => photo(10)))).rejects.toBeInstanceOf(GristLimitError);
    await expect(send([photo(10, 'image/gif')])).rejects.toBeInstanceOf(GristLimitError);
    await expect(send([photo(10, 'application/pdf')])).rejects.toBeInstanceOf(GristLimitError);
    await expect(send([photo(PHOTO_LIMIT + 1)])).rejects.toBeInstanceOf(GristLimitError);
    expect(server.calls).toEqual([]);

    await expect(send([photo(10, 'image/webp'), photo(PHOTO_LIMIT)])).resolves.toBeDefined();
  });

  it('sends nothing when an upload fails', async () => {
    const millKey = PrivateKey.fromRandom();
    const server = makeServer(millKey);
    const real = server.fetch;
    let uploads = 0;
    const flaky = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (new URL(input.toString()).pathname === '/api/blobs' && ++uploads === 2) return json(500, { error: 'disk full' });
      return real(input, init);
    }) as typeof fetch;

    const failure = await sendGrist({
      key: PrivateKey.fromRandom(),
      photos: [photo(10), photo(20)],
      input: {},
      header: HEADER,
      fetchImpl: flaky,
    }).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(GristBackendError);
    expect((failure as GristBackendError).status).toBe(500);
    expect(server.records).toEqual([]);
  });

  it('fails with a GristBackendError when the backend names no mill', async () => {
    const server = makeServer(undefined);
    const failure = await sendGrist({
      key: PrivateKey.fromRandom(),
      photos: [photo(10)],
      input: {},
      header: HEADER,
      fetchImpl: server.fetch,
    }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(GristBackendError);
    expect(server.blobs.size).toBe(0);
    expect(server.records).toEqual([]);
  });

  it('is GristUnlicensed for a key with no licence', async () => {
    const server = makeServer(PrivateKey.fromRandom());
    server.licensed = false;
    await expect(
      sendGrist({ key: PrivateKey.fromRandom(), photos: [photo(10)], input: {}, header: HEADER, fetchImpl: server.fetch }),
    ).rejects.toBeInstanceOf(GristUnlicensed);
  });
});

describe('readAnswer', () => {
  function setup() {
    const appKey = PrivateKey.fromRandom();
    const millKey = PrivateKey.fromRandom();
    const server = makeServer(millKey);
    const mill = millKey.toPublicKey().toString();
    const read = (since = 0, txid = GRIST_TXID) =>
      readAnswer({ key: appKey, txid, mill, since, isAnswer: isWords, fetchImpl: server.fetch });
    const answered = (plaintext: unknown, extra: Partial<Parameters<typeof answerPayload>[0]> = {}) =>
      answerPayload({ plaintext, from: millKey, to: appKey, ...extra });
    return { appKey, millKey, mill, server, read, answered };
  }

  it('reads the mill\'s answer to the txid and validates it', async () => {
    const { server, read, answered } = setup();
    const grind = { app: 'spellforge', kind: 'word-list', v: '1', commit: 'abc123' };
    server.inject({
      payload: answered({ re: GRIST_TXID, status: 'answered', answer: { words: ['cat', 'dog'] }, grind }),
      signer: server.mill,
    });

    const result = await read();
    expect(result).toEqual({
      answer: { status: 'answered', answer: { words: ['cat', 'dog'] }, grind },
      next: 1,
    });
  });

  it('hands on the scorers\' reading_result when the mill echoes one beside the answer (mw-bhvxcn.9)', async () => {
    const { server, read, answered } = setup();
    const readingResult = { local: { engine: 'local', words: [], accuracy: 80, seconds: 1.5 }, azure: { error: 'refused' } };
    server.inject({
      payload: answered({ re: GRIST_TXID, status: 'answered', answer: { words: ['a'] }, reading_result: readingResult }),
      signer: server.mill,
    });
    expect(await read()).toMatchObject({ answer: { status: 'answered', readingResult } });
  });

  it('accepts a record with no signer', async () => {
    const { server, read, answered } = setup();
    server.inject({ payload: answered({ re: GRIST_TXID, status: 'answered', answer: { words: ['a'] } }) });
    expect(await read()).toMatchObject({ answer: { status: 'answered' } });
  });

  it('is pending, with the cursor moved on, when no answer has come', async () => {
    const { server, read } = setup();
    expect(await read(0)).toEqual({ pending: true, next: 0 });
    server.inject({ payload: { v: 1, kind: 'msg', class: 'message', to: 'x', from: 'y', ts: 1, ct: '' } });
    expect(await read(0)).toEqual({ pending: true, next: 1 });
  });

  it('asks only for records after since', async () => {
    const { server, read, answered } = setup();
    server.inject({ payload: answered({ re: GRIST_TXID, status: 'answered', answer: { words: ['a'] } }) });
    expect(await read(1)).toEqual({ pending: true, next: 1 });
  });

  it('skips answers from another key, to another key, with another re, or that do not decrypt', async () => {
    const { appKey, millKey, mill, server, read, answered } = setup();
    const stranger = PrivateKey.fromRandom();
    const good = { re: GRIST_TXID, status: 'answered', answer: { words: ['x'] } };
    server.showAll = true;

    // From another key (sealed by it, claiming to be from it).
    server.inject({ payload: answerPayload({ plaintext: good, from: stranger, to: appKey }), signer: stranger.toPublicKey().toString() });
    // To another key.
    server.inject({ payload: answerPayload({ plaintext: good, from: millKey, to: stranger }), signer: mill });
    // Another re.
    server.inject({ payload: answered({ ...good, re: 'direct:' + 'cd'.repeat(32) }), signer: mill });
    // Claims the mill but is sealed by a stranger: the header's sender is not the mill.
    server.inject({
      payload: answered(good, { sealedBy: stranger, claimedFrom: mill }),
      signer: mill,
    });
    // Does not decrypt: garbage ciphertext.
    server.inject({ payload: { ...answered(good), ct: Utils.toBase64([1, 2, 3, 4]) }, signer: mill });
    // Signed in by a key that is not the mill.
    server.inject({ payload: answered(good), signer: stranger.toPublicKey().toString() });
    // Not class grist.
    server.inject({ payload: answered(good, { cls: 'message' }), signer: mill });
    // Plaintext is JSON but not an answer object.
    server.inject({ payload: answered('just a string'), signer: mill });
    // A record with no payload at all.
    server.records.push({ seq: 9, txid: 'x', vout: 0, scriptHex: '', height: 0, firstSeen: '', signer: mill });

    expect(await read()).toEqual({ pending: true, next: 9 });

    // And the genuine one after them is still found.
    server.records.pop();
    server.inject({ payload: answered(good), signer: mill });
    const found = await read();
    expect('answer' in found && found.answer.status).toBe('answered');
  });

  it('carries the reason of a refused grist', async () => {
    const { server, read, answered } = setup();
    server.inject({
      payload: answered({ re: GRIST_TXID, status: 'refused', reason: 'You have used all of today\'s reads.' }),
    });
    expect(await read()).toEqual({
      answer: { status: 'refused', reason: 'You have used all of today\'s reads.' },
      next: 1,
    });
  });

  it('carries the reason of a failed grist', async () => {
    const { server, read, answered } = setup();
    server.inject({ payload: answered({ re: GRIST_TXID, status: 'failed', reason: 'The reader gave up.' }) });
    expect(await read()).toEqual({ answer: { status: 'failed', reason: 'The reader gave up.' }, next: 1 });
  });

  it('reads an answered grist whose answer fails validation as failed, with a reason', async () => {
    const { server, read, answered } = setup();
    server.inject({ payload: answered({ re: GRIST_TXID, status: 'answered', answer: { words: [1, 2] } }) });
    const result = await read();
    expect(result).toMatchObject({ answer: { status: 'failed' }, next: 1 });
    const answer = (result as { answer: { reason: string } }).answer;
    expect(answer.reason.length).toBeGreaterThan(0);
  });

  it('reads an answered grist with no answer at all as failed', async () => {
    const { server, read, answered } = setup();
    server.inject({ payload: answered({ re: GRIST_TXID, status: 'answered' }) });
    expect(await read()).toMatchObject({ answer: { status: 'failed' } });
  });

  it('reads an unknown status as failed, with a reason', async () => {
    const { server, read, answered } = setup();
    server.inject({ payload: answered({ re: GRIST_TXID, status: 'maybe' }) });
    expect(await read()).toMatchObject({ answer: { status: 'failed' } });
  });

  it('gives a refused or failed answer with no reason a plain one', async () => {
    const { server, read, answered } = setup();
    server.inject({ payload: answered({ re: GRIST_TXID, status: 'refused' }) });
    const result = await read();
    expect((result as { answer: { reason: string } }).answer.reason.length).toBeGreaterThan(0);
  });

  it('reads the answer to a grist this client really sent, end to end', async () => {
    const appKey = PrivateKey.fromRandom();
    const millKey = PrivateKey.fromRandom();
    const server = makeServer(millKey);
    const sent = await sendGrist({
      key: appKey,
      photos: [{ bytes: new Uint8Array([1, 2, 3]), mime: 'image/jpeg' }],
      input: { schemaVersion: '1' },
      header: HEADER,
      fetchImpl: server.fetch,
    });
    const mill = millKey.toPublicKey().toString();

    expect(await readAnswer({ key: appKey, txid: sent.txid, mill, since: 0, isAnswer: isWords, fetchImpl: server.fetch })).toMatchObject({
      pending: true,
    });

    server.inject({
      payload: answerPayload({
        plaintext: { re: sent.txid, status: 'answered', answer: { words: ['one'] } },
        from: millKey,
        to: appKey,
      }),
      signer: mill,
    });
    expect(await readAnswer({ key: appKey, txid: sent.txid, mill, since: 0, isAnswer: isWords, fetchImpl: server.fetch })).toEqual({
      answer: { status: 'answered', answer: { words: ['one'] } },
      next: 2,
    });
  });

  it('passes backend errors up', async () => {
    const { server, read } = setup();
    server.licensed = false;
    await expect(read()).rejects.toBeInstanceOf(GristUnlicensed);
  });
});

describe('shrinkPhoto', () => {
  const blobOf = (size: number, type: string) => new Blob([new Uint8Array(size).fill(7)], { type });
  const encoded = new Uint8Array([9, 9, 9]);

  it('passes a small jpeg, png or webp through unchanged', async () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      let called = false;
      const out = await shrinkPhoto(blobOf(100, type), async () => {
        called = true;
        return encoded;
      });
      expect(called).toBe(false);
      expect(out.mime).toBe(type);
      expect(out.bytes).toEqual(new Uint8Array(100).fill(7));
    }
  });

  it('passes a photo of exactly the limit through unchanged', async () => {
    const out = await shrinkPhoto(blobOf(PHOTO_LIMIT, 'image/png'), async () => encoded);
    expect(out.bytes.length).toBe(PHOTO_LIMIT);
    expect(out.mime).toBe('image/png');
  });

  it('re-encodes a photo over the limit as JPEG under it', async () => {
    const calls: { type: string; maxBytes: number }[] = [];
    const out = await shrinkPhoto(blobOf(PHOTO_LIMIT + 1, 'image/png'), async (blob, maxBytes) => {
      calls.push({ type: blob.type, maxBytes });
      return encoded;
    });
    expect(calls).toEqual([{ type: 'image/png', maxBytes: PHOTO_LIMIT }]);
    expect(out).toEqual({ bytes: encoded, mime: 'image/jpeg' });
  });

  it('re-encodes a photo of another type (HEIC, GIF, no type) as JPEG', async () => {
    for (const type of ['image/heic', 'image/gif', '']) {
      const out = await shrinkPhoto(blobOf(100, type), async () => encoded);
      expect(out).toEqual({ bytes: encoded, mime: 'image/jpeg' });
    }
  });

  it('throws a GristLimitError when the encoder cannot get under the limit', async () => {
    await expect(
      shrinkPhoto(blobOf(PHOTO_LIMIT + 1, 'image/jpeg'), async () => new Uint8Array(PHOTO_LIMIT + 1)),
    ).rejects.toBeInstanceOf(GristLimitError);
  });

  it('passes the encoder\'s own failure up', async () => {
    await expect(
      shrinkPhoto(blobOf(100, 'image/gif'), async () => {
        throw new Error('cannot decode');
      }),
    ).rejects.toThrow('cannot decode');
  });
});

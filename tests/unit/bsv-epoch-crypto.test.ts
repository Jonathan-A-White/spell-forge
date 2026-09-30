// The library's epoch crypto (src/bsv/epoch-crypto.ts, mw-jeswf.2): the browser-safe,
// crypto.subtle implementation of docs/bsv-wire-formats.md. Every positive vector in
// tests/fixtures/bsv/wire-vectors.json is reproduced byte for byte, every negative vector is
// refused with its typed EpochCryptoError (never a raw DOMException), random round trips hold,
// and the library agrees with the Node reference on random inputs. The reference is imported
// here only: browser code never imports src/bsv/node/.

import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/bsv/wire-vectors.json';
import * as reference from '../../src/bsv/node/wire-reference';
import type { NegativeVector, WireVectors } from '../../src/bsv/node/wire-vectors';
import {
  EPOCH_KEY_BYTES,
  EpochCryptoError,
  PAYLOAD_OVERHEAD_BYTES,
  WRAP_BYTES,
  decryptPayload,
  deriveReaderKeyPair,
  deriveWrapKeyPair,
  encodeWritePlaintext,
  encryptPayload,
  epochCommitment,
  generateEpochKey,
  isP256PublicKey,
  payloadAad,
  unwrapEpochKey,
  wrapEpochKey,
  wrapHkdfInfo,
} from '../../src/bsv/epoch-crypto';
import * as barrel from '../../src/bsv';

const vectors = fixture as WireVectors;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytes(hexString: string): Uint8Array {
  const out = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hexString.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function randomBytes(length: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

/** A random valid P-256 scalar: 32 random bytes below n and not zero (retry is ~2^-32). */
function randomScalar(): Uint8Array {
  for (;;) {
    const candidate = randomBytes(32);
    const value = BigInt(`0x${hex(candidate)}`);
    if (value > 0n && value < reference.P256_N) return candidate;
  }
}

const commitmentOf = new Map(vectors.commitment.map((vector) => [vector.epochKey, vector.commitment]));

/** Runs the promise and returns the typed error it rejects with; fails if it is anything else. */
async function refusalOf(action: () => Promise<unknown>): Promise<EpochCryptoError> {
  let caught: unknown;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  expect(caught, 'expected a refusal, got a result').toBeDefined();
  expect(caught).not.toBeInstanceOf(DOMException);
  expect((caught as Error).name).not.toBe('OperationError');
  expect(caught).toBeInstanceOf(EpochCryptoError);
  const error = caught as EpochCryptoError;
  expect(error.name).toBe('EpochCryptoError');
  expect(error.message.length).toBeGreaterThan(10);
  return error;
}

/** Runs a fixture negative vector through the library's public functions. */
function runNegative(vector: NegativeVector): Promise<unknown> {
  switch (vector.operation) {
    case 'derive': {
      const wrapIndex = /^2-nftgate wrap-w\/(\d+)$/.exec(vector.info);
      if (!wrapIndex) throw new Error(`unexpected derive info ${vector.info}`);
      return deriveWrapKeyPair(bytes(vector.seed), Number(wrapIndex[1]));
    }
    case 'wrap':
      return wrapEpochKey(bytes(vector.epochKey), bytes(vector.recipientPublicKey), {
        ephemeralPrivateKey: bytes(vector.ephemeralPrivateKey),
        nonce: bytes(vector.nonce),
      });
    case 'unwrap':
      // The expected commitment is k0's: every negative unwrap is refused before that check.
      return unwrapEpochKey(bytes(vector.wrap), bytes(vector.recipientPrivateKey), bytes(vectors.commitment[0].commitment));
    case 'decryptPayload':
      return decryptPayload({
        payload: bytes(vector.payload),
        epochKey: bytes(vector.epochKey),
        commitment: bytes(vector.commitment),
        recordType: vector.recordType,
      });
  }
}

describe('epoch crypto: every positive vector reproduced byte for byte', () => {
  it.each(vectors.commitment)('commitment $name', async (vector) => {
    expect(hex(await epochCommitment(bytes(vector.epochKey)))).toBe(vector.commitment);
  });

  it.each(vectors.derivation)('derivation $name', async (vector) => {
    const wrapIndex = /^2-nftgate wrap-w\/(\d+)$/.exec(vector.info);
    const reader = /^2-nftgate reader-([0-9a-f]{32})$/.exec(vector.info);
    const pair = wrapIndex
      ? await deriveWrapKeyPair(bytes(vector.seed), Number(wrapIndex[1]))
      : await deriveReaderKeyPair(bytes(vector.seed), reader![1]);
    expect(hex(pair.privateKey)).toBe(vector.privateKey);
    expect(hex(pair.publicKey)).toBe(vector.publicKey);
    expect(isP256PublicKey(pair.publicKey)).toBe(true);
  });

  it.each(vectors.wrap)('wrap $name: built with the injected ephemeral key and nonce, and opened', async (vector) => {
    expect(hex(wrapHkdfInfo(bytes(vector.ephemeralPublicKey), bytes(vector.recipientPublicKey)))).toBe(vector.hkdfInfo);
    const wrap = await wrapEpochKey(bytes(vector.epochKey), bytes(vector.recipientPublicKey), {
      ephemeralPrivateKey: bytes(vector.ephemeralPrivateKey),
      nonce: bytes(vector.nonce),
    });
    expect(hex(wrap)).toBe(vector.wrap);
    expect(wrap.length).toBe(WRAP_BYTES);
    const commitment = bytes(commitmentOf.get(vector.epochKey)!);
    const opened = await unwrapEpochKey(bytes(vector.wrap), bytes(vector.recipientPrivateKey), commitment);
    expect(hex(opened)).toBe(vector.epochKey);
  });

  it.each(vectors.payload)('payload $name: encrypted with the injected nonce, and decrypted', async (vector) => {
    expect(hex(payloadAad(vector.recordType, bytes(vector.commitment)))).toBe(vector.aad);
    const plaintext = encodeWritePlaintext(JSON.parse(vector.plaintext).text, JSON.parse(vector.plaintext).ts);
    expect(hex(plaintext)).toBe(vector.plaintextHex);
    const payload = await encryptPayload(
      { epochKey: bytes(vector.epochKey), recordType: vector.recordType, plaintext },
      { nonce: bytes(vector.nonce) },
    );
    expect(hex(payload)).toBe(vector.payload);
    const opened = await decryptPayload({
      payload: bytes(vector.payload),
      epochKey: bytes(vector.epochKey),
      commitment: bytes(vector.commitment),
      recordType: vector.recordType,
    });
    expect(new TextDecoder().decode(opened)).toBe(vector.plaintext);
  });
});

describe('epoch crypto: every negative vector refused with its typed error', () => {
  it.each(vectors.negative)('negative $name: $refusal', async (vector) => {
    const error = await refusalOf(() => runNegative(vector));
    expect(error.refusal).toBe(vector.refusal);
  });

  it("a secp256k1 recipient is refused as 'malformed: wrap keys are P-256'", async () => {
    const secp = vectors.negative.filter((vector) => vector.operation === 'wrap');
    expect(secp.length).toBe(2);
    for (const vector of secp) {
      const error = await refusalOf(() => runNegative(vector));
      expect(error.message).toContain('malformed: wrap keys are P-256');
    }
  });

  it('a wrap opened to a key whose c(e) is not the expected commitment is refused', async () => {
    const vector = vectors.wrap[0]; // k0 to holder A w/0
    const otherCommitment = bytes(vectors.commitment[1].commitment); // c(k1)
    const error = await refusalOf(() => unwrapEpochKey(bytes(vector.wrap), bytes(vector.recipientPrivateKey), otherCommitment));
    expect(error.refusal).toBe('commitment-mismatch');
  });

  it('refuses malformed inputs with typed errors before reaching crypto.subtle', async () => {
    const wrap = bytes(vectors.wrap[0].wrap);
    const privateKey = bytes(vectors.wrap[0].recipientPrivateKey);
    const commitment = bytes(vectors.commitment[0].commitment);
    const n = bytes(reference.P256_N.toString(16));
    expect((await refusalOf(() => unwrapEpochKey(new Uint8Array(), privateKey, commitment))).refusal).toBe('malformed-length');
    expect((await refusalOf(() => unwrapEpochKey(wrap, n, commitment))).refusal).toBe('invalid-private-key');
    expect((await refusalOf(() => unwrapEpochKey(wrap, new Uint8Array(32), commitment))).refusal).toBe('invalid-private-key');
    expect((await refusalOf(() => unwrapEpochKey(wrap, privateKey, new Uint8Array(31)))).refusal).toBe('invalid-commitment');
    expect((await refusalOf(() => epochCommitment(new Uint8Array(31)))).refusal).toBe('invalid-epoch-key');
    expect((await refusalOf(() => wrapEpochKey(randomBytes(32), randomBytes(65)))).refusal).toBe('not-p256-public-key');
    const recipient = bytes(vectors.wrap[0].recipientPublicKey);
    expect((await refusalOf(() => wrapEpochKey(randomBytes(32), recipient, { nonce: randomBytes(11) }))).refusal).toBe('invalid-nonce');
    expect((await refusalOf(() => wrapEpochKey(randomBytes(31), recipient))).refusal).toBe('invalid-epoch-key');
    const seed = randomBytes(32);
    expect((await refusalOf(() => deriveWrapKeyPair(seed, -1))).refusal).toBe('invalid-wrap-index');
    expect((await refusalOf(() => deriveReaderKeyPair(seed, 'not hex'))).refusal).toBe('invalid-collection-nonce');
    expect(
      (await refusalOf(() => encryptPayload({ epochKey: randomBytes(32), recordType: '', plaintext: new Uint8Array() }))).refusal,
    ).toBe('invalid-record-type');
    expect(
      (await refusalOf(() => decryptPayload({ payload: new Uint8Array(), epochKey: randomBytes(32), commitment, recordType: 'W' })))
        .refusal,
    ).toBe('malformed-length');
  });

  it('a random wrap or payload with one flipped byte is refused, never opened', async () => {
    const pair = await deriveWrapKeyPair(randomBytes(32), 0);
    const epochKey = generateEpochKey();
    const commitment = await epochCommitment(epochKey);
    const wrap = await wrapEpochKey(epochKey, pair.publicKey);
    for (const offset of [1, 40, 66, 70, 78, 100, 110, 125]) {
      const tampered = wrap.slice();
      tampered[offset] ^= 0x01;
      const error = await refusalOf(() => unwrapEpochKey(tampered, pair.privateKey, commitment));
      expect(['authentication-failed', 'not-p256-public-key']).toContain(error.refusal);
    }
    const payload = await encryptPayload({ epochKey, recordType: 'W', plaintext: encodeWritePlaintext('hi', '2026-09-30T00:00:00.000Z') });
    for (const offset of [1, 12, 13, payload.length - 1]) {
      const tampered = payload.slice();
      tampered[offset] ^= 0x80;
      const error = await refusalOf(() => decryptPayload({ payload: tampered, epochKey, commitment, recordType: 'W' }));
      expect(error.refusal).toBe('authentication-failed');
    }
  });
});

describe('epoch crypto: random round trips', () => {
  it('generateEpochKey draws 32 fresh bytes each call', () => {
    const a = generateEpochKey();
    const b = generateEpochKey();
    expect(a.length).toBe(EPOCH_KEY_BYTES);
    expect(hex(a)).not.toBe(hex(b));
  });

  it.each(Array.from({ length: 8 }, (_, i) => i))('round trip %i: wrap/unwrap, encrypt/decrypt, c(e) preserved', async (i) => {
    const holder = await deriveWrapKeyPair(randomBytes(32 + i), i);
    const other = await deriveWrapKeyPair(randomBytes(32), i);
    const epochKey = generateEpochKey();
    const commitment = await epochCommitment(epochKey);

    const wrap = await wrapEpochKey(epochKey, holder.publicKey);
    expect(wrap.length).toBe(WRAP_BYTES);
    const again = await wrapEpochKey(epochKey, holder.publicKey);
    expect(hex(again)).not.toBe(hex(wrap)); // fresh ephemeral key and nonce every call
    const opened = await unwrapEpochKey(wrap, holder.privateKey, commitment);
    expect(hex(opened)).toBe(hex(epochKey));
    expect(hex(await epochCommitment(opened))).toBe(hex(commitment));
    expect((await refusalOf(() => unwrapEpochKey(wrap, other.privateKey, commitment))).refusal).toBe('authentication-failed');

    const text = `note ${i} ✓ ${hex(randomBytes(4))}`;
    const plaintext = encodeWritePlaintext(text, new Date(Date.UTC(2026, 8, 30, i)).toISOString());
    const payload = await encryptPayload({ epochKey: opened, recordType: 'W', plaintext });
    expect(payload.length).toBe(PAYLOAD_OVERHEAD_BYTES + plaintext.length);
    const payloadAgain = await encryptPayload({ epochKey: opened, recordType: 'W', plaintext });
    expect(hex(payloadAgain.subarray(1, 13))).not.toBe(hex(payload.subarray(1, 13))); // fresh nonce
    const decrypted = await decryptPayload({ payload, epochKey, commitment, recordType: 'W' });
    expect(JSON.parse(new TextDecoder().decode(decrypted)).text).toBe(text);
  });

  it('a reader key pair derived from n_C opens a wrap addressed to it', async () => {
    const seed = randomBytes(32);
    const reader = await deriveReaderKeyPair(seed, hex(randomBytes(16)));
    const epochKey = generateEpochKey();
    const wrap = await wrapEpochKey(epochKey, reader.publicKey);
    expect(hex(await unwrapEpochKey(wrap, reader.privateKey, await epochCommitment(epochKey)))).toBe(hex(epochKey));
  });
});

describe('epoch crypto: agrees with the Node reference', () => {
  it.each(Array.from({ length: 24 }, (_, i) => i))('agreement case %i', async (i) => {
    const seed = randomBytes(32 + (i % 3) * 16);
    const context = `seed ${hex(seed)}, index ${i}`;

    // Derivation: wrap key w/i and a reader key.
    const wrapPair = await deriveWrapKeyPair(seed, i);
    const refWrap = reference.deriveWrapKey(seed, i);
    expect(hex(wrapPair.privateKey), context).toBe(hex(refWrap.privateKey));
    expect(hex(wrapPair.publicKey), context).toBe(hex(refWrap.publicKey));
    const collectionNonce = randomBytes(16);
    const readerPair = await deriveReaderKeyPair(seed, hex(collectionNonce));
    expect(hex(readerPair.publicKey), context).toBe(hex(reference.deriveReaderKey(seed, collectionNonce).publicKey));

    // Commitment.
    const epochKey = generateEpochKey();
    const commitment = await epochCommitment(epochKey);
    expect(hex(commitment), context).toBe(hex(reference.epochCommitment(epochKey)));

    // Wrap with injected randomness: the same bytes; each side opens the other's wrap.
    const ephemeralPrivateKey = randomScalar();
    const nonce = randomBytes(12);
    const wrap = await wrapEpochKey(epochKey, wrapPair.publicKey, { ephemeralPrivateKey, nonce });
    const refWrapBytes = reference.wrapEpochKey({ recipientPublicKey: refWrap.publicKey, ephemeralPrivateKey, nonce, epochKey });
    expect(hex(wrap), context).toBe(hex(refWrapBytes));
    const freshWrap = await wrapEpochKey(epochKey, wrapPair.publicKey);
    expect(hex(reference.unwrapEpochKey(freshWrap, refWrap.privateKey)), context).toBe(hex(epochKey));
    expect(hex(await unwrapEpochKey(refWrapBytes, wrapPair.privateKey, commitment)), context).toBe(hex(epochKey));

    // Payload with injected nonce: the same bytes; each side opens the other's payload.
    const text = `case ${i} “${hex(randomBytes(i))}” 🐉`;
    const plaintext = encodeWritePlaintext(text, '2026-09-30T00:00:00.000Z');
    expect(hex(plaintext), context).toBe(hex(reference.encodeWritePlaintext(text, '2026-09-30T00:00:00.000Z')));
    const payloadNonce = randomBytes(12);
    const payload = await encryptPayload({ epochKey, recordType: 'W', plaintext }, { nonce: payloadNonce });
    const refPayload = reference.encryptPayload({ epochKey, commitment, recordType: 'W', nonce: payloadNonce, plaintext });
    expect(hex(payload), context).toBe(hex(refPayload));
    const freshPayload = await encryptPayload({ epochKey, recordType: 'W', plaintext });
    expect(hex(reference.decryptPayload(freshPayload, epochKey, commitment, 'W')), context).toBe(hex(plaintext));
    expect(hex(await decryptPayload({ payload: refPayload, epochKey, commitment, recordType: 'W' })), context).toBe(hex(plaintext));
  });
});

describe('epoch crypto: exported from the library barrel', () => {
  it('src/bsv/index.ts exports the epoch crypto functions and error', () => {
    expect(barrel.generateEpochKey).toBe(generateEpochKey);
    expect(barrel.epochCommitment).toBe(epochCommitment);
    expect(barrel.deriveWrapKeyPair).toBe(deriveWrapKeyPair);
    expect(barrel.deriveReaderKeyPair).toBe(deriveReaderKeyPair);
    expect(barrel.wrapEpochKey).toBe(wrapEpochKey);
    expect(barrel.unwrapEpochKey).toBe(unwrapEpochKey);
    expect(barrel.encryptPayload).toBe(encryptPayload);
    expect(barrel.decryptPayload).toBe(decryptPayload);
    expect(barrel.encodeWritePlaintext).toBe(encodeWritePlaintext);
    expect(barrel.EpochCryptoError).toBe(EpochCryptoError);
  });
});

// Wire formats of docs/bsv-wire-formats.md (spec §8 Q14, mw-jeswf.1): every vector in
// tests/fixtures/bsv/wire-vectors.json is regenerated with the Node reference and compared
// byte for byte, every negative vector must be refused with its stated refusal, and the
// positive vectors are cross-checked through crypto.subtle (ECDH, HKDF, AES-GCM, SHA-256),
// a path that shares no code with the reference. jsdom exposes Node's crypto.subtle, so this
// file runs in the default environment.

import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/bsv/wire-vectors.json';
import {
  P256_N,
  WireFormatError,
  decryptPayload,
  deriveP256Key,
  encryptPayload,
  epochCommitment,
  payloadAad,
  unwrapEpochKey,
  wrapEpochKey,
  wrapHkdfInfo,
} from '../../src/bsv/node/wire-reference';
import {
  buildWireVectors,
  isPublishedCountingSeed,
  runNegativeVector,
  type NegativeVector,
  type WireVectors,
} from '../../src/bsv/node/wire-vectors';

const vectors = fixture as WireVectors;

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytes(hexString: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hexString.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function ascii(text: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Array.from(text, (char) => char.charCodeAt(0)));
}

function refusalOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof WireFormatError) return error.refusal;
    throw error;
  }
  return 'accepted';
}

describe('wire vectors: the fixture is exactly what the reference generates', () => {
  it('buildWireVectors() reproduces tests/fixtures/bsv/wire-vectors.json byte for byte', () => {
    expect(buildWireVectors()).toEqual(vectors);
  });

  it('holds at least the vectors the story asks for', () => {
    expect(vectors.commitment.length).toBeGreaterThanOrEqual(2);
    expect(vectors.derivation.length).toBeGreaterThanOrEqual(3);
    expect(vectors.wrap.length).toBeGreaterThanOrEqual(3);
    expect(vectors.payload.length).toBeGreaterThanOrEqual(2);
    const refusals = new Set(vectors.negative.map((vector) => `${vector.operation}:${vector.refusal}`));
    expect(refusals).toContain('unwrap:authentication-failed'); // tampered tag, wrong recipient key
    expect(refusals).toContain('unwrap:unknown-version');
    expect(refusals).toContain('wrap:not-p256-public-key'); // a secp256k1 recipient
    expect(refusals).toContain('decryptPayload:authentication-failed');
    expect(refusals).toContain('decryptPayload:unknown-version');
  });

  it('uses only published counting-byte seeds, never a harness or wallet key', () => {
    for (const vector of [...vectors.derivation, ...vectors.negative.filter((v) => v.operation === 'derive')]) {
      expect(isPublishedCountingSeed(bytes(vector.seed)), vector.name).toBe(true);
    }
  });
});

describe('wire vectors: each structure recomputed from its inputs', () => {
  it.each(vectors.commitment)('commitment $name: c(e) = SHA-256("nftgate-epoch" ‖ k(e))', (vector) => {
    expect(hex(epochCommitment(bytes(vector.epochKey)))).toBe(vector.commitment);
  });

  it.each(vectors.derivation)('derivation $name: seed + info -> scalar in [1, n-1] and public key', (vector) => {
    const key = deriveP256Key(bytes(vector.seed), vector.info);
    expect(hex(ascii(vector.info))).toBe(vector.infoHex);
    expect(hex(key.okm)).toBe(vector.okm);
    expect(hex(key.privateKey)).toBe(vector.privateKey);
    expect(hex(key.publicKey)).toBe(vector.publicKey);
    const scalar = BigInt(`0x${vector.privateKey}`);
    expect(scalar >= 1n && scalar < P256_N).toBe(true);
    expect(scalar).toBe((BigInt(`0x${vector.okm}`) % (P256_N - 1n)) + 1n);
  });

  it.each(vectors.wrap)('wrap $name: builds the pinned bytes and unwraps to k(e)', (vector) => {
    const wrap = wrapEpochKey({
      recipientPublicKey: bytes(vector.recipientPublicKey),
      ephemeralPrivateKey: bytes(vector.ephemeralPrivateKey),
      nonce: bytes(vector.nonce),
      epochKey: bytes(vector.epochKey),
    });
    expect(hex(wrap)).toBe(vector.wrap);
    expect(wrap.length).toBe(126);
    expect(hex(wrapHkdfInfo(bytes(vector.ephemeralPublicKey), bytes(vector.recipientPublicKey)))).toBe(vector.hkdfInfo);
    expect(hex(unwrapEpochKey(wrap, bytes(vector.recipientPrivateKey)))).toBe(vector.epochKey);
  });

  it.each(vectors.payload)('payload $name: encrypts to the pinned bytes and decrypts back', (vector) => {
    const plaintext = new TextEncoder().encode(vector.plaintext);
    expect(hex(plaintext)).toBe(vector.plaintextHex);
    expect(hex(payloadAad(vector.recordType, bytes(vector.commitment)))).toBe(vector.aad);
    const payload = encryptPayload({
      epochKey: bytes(vector.epochKey),
      commitment: bytes(vector.commitment),
      recordType: vector.recordType,
      nonce: bytes(vector.nonce),
      plaintext,
    });
    expect(hex(payload)).toBe(vector.payload);
    expect(payload.length).toBe(29 + plaintext.length);
    const opened = decryptPayload(payload, bytes(vector.epochKey), bytes(vector.commitment), vector.recordType);
    expect(new TextDecoder().decode(opened)).toBe(vector.plaintext);
  });

  it.each(vectors.negative)('negative $name is refused: $refusal', (vector) => {
    expect(refusalOf(() => runNegativeVector(vector))).toBe(vector.refusal);
  });
});

// ---------------------------------------------------------------------------------------------
// The independent path: crypto.subtle only. Nothing below calls the reference.
// ---------------------------------------------------------------------------------------------

const subtle = globalThis.crypto.subtle;
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n; // P-256 group order
const P256 = { name: 'ECDH', namedCurve: 'P-256' } as const;

/** PKCS#8 for a bare P-256 scalar with no public key: WebCrypto computes the public key itself. */
function pkcs8FromScalar(scalar: Uint8Array): Uint8Array<ArrayBuffer> {
  const prefix = bytes('3041020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420');
  const der = new Uint8Array(prefix.length + 32);
  der.set(prefix);
  der.set(scalar, prefix.length);
  return der;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function base64UrlToHex(text: string): string {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return hex(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

async function subtlePublicKeyHex(scalar: Uint8Array): Promise<string> {
  const privateKey = await subtle.importKey('pkcs8', pkcs8FromScalar(scalar), P256, true, ['deriveBits']);
  const jwk = await subtle.exportKey('jwk', privateKey);
  return `04${base64UrlToHex(jwk.x as string)}${base64UrlToHex(jwk.y as string)}`;
}

async function subtleHkdf(ikm: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bits: number) {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bits));
}

async function subtleWrapKey(privateScalar: Uint8Array, peerPublicKey: Uint8Array<ArrayBuffer>, epk: Uint8Array, rpk: Uint8Array) {
  const privateKey = await subtle.importKey('pkcs8', pkcs8FromScalar(privateScalar), P256, false, ['deriveBits']);
  const publicKey = await subtle.importKey('raw', peerPublicKey, P256, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256));
  const aesKey = await subtleHkdf(shared, ascii('nftgate-wrap'), concat(new Uint8Array([0x01]), epk, rpk), 256);
  return subtle.importKey('raw', aesKey, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

describe('wire vectors: cross-checked through crypto.subtle', () => {
  it.each(vectors.commitment)('commitment $name matches crypto.subtle SHA-256', async (vector) => {
    const digest = await subtle.digest('SHA-256', concat(ascii('nftgate-epoch'), bytes(vector.epochKey)));
    expect(hex(new Uint8Array(digest))).toBe(vector.commitment);
  });

  it.each(vectors.derivation)('derivation $name matches crypto.subtle HKDF and PKCS#8 import', async (vector) => {
    const okm = await subtleHkdf(bytes(vector.seed), ascii('nftgate-p256'), ascii(vector.info), 384);
    expect(hex(okm)).toBe(vector.okm);
    const scalar = (BigInt(`0x${hex(okm)}`) % (N - 1n)) + 1n;
    const scalarBytes = bytes(scalar.toString(16).padStart(64, '0'));
    expect(hex(scalarBytes)).toBe(vector.privateKey);
    expect(await subtlePublicKeyHex(scalarBytes)).toBe(vector.publicKey);
  });

  it.each(vectors.wrap)('wrap $name opens with crypto.subtle ECDH + HKDF + AES-GCM', async (vector) => {
    const wrap = bytes(vector.wrap);
    const epk = wrap.slice(1, 66);
    const nonce = wrap.slice(66, 78);
    const rpk = bytes(await subtlePublicKeyHex(bytes(vector.recipientPrivateKey)));
    const key = await subtleWrapKey(bytes(vector.recipientPrivateKey), epk, epk, rpk);
    const aad = wrap.slice(0, 66);
    const opened = await subtle.decrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad }, key, wrap.slice(78));
    expect(hex(new Uint8Array(opened))).toBe(vector.epochKey);
  });

  it.each(vectors.wrap)('wrap $name is rebuilt byte for byte by crypto.subtle', async (vector) => {
    const epk = bytes(await subtlePublicKeyHex(bytes(vector.ephemeralPrivateKey)));
    expect(hex(epk)).toBe(vector.ephemeralPublicKey);
    const rpk = bytes(vector.recipientPublicKey);
    const key = await subtleWrapKey(bytes(vector.ephemeralPrivateKey), rpk, epk, rpk);
    const header = concat(new Uint8Array([0x01]), epk);
    const sealed = await subtle.encrypt(
      { name: 'AES-GCM', iv: bytes(vector.nonce), additionalData: header },
      key,
      bytes(vector.epochKey),
    );
    expect(hex(concat(header, bytes(vector.nonce), new Uint8Array(sealed)))).toBe(vector.wrap);
  });

  it.each(vectors.payload)('payload $name opens with crypto.subtle AES-GCM under k(e)', async (vector) => {
    const payload = bytes(vector.payload);
    const typeBytes = ascii(vector.recordType);
    const aad = concat(ascii('nftgate-payload'), new Uint8Array([0x01, typeBytes.length]), typeBytes, bytes(vector.commitment));
    expect(hex(aad)).toBe(vector.aad);
    const key = await subtle.importKey('raw', bytes(vector.epochKey), 'AES-GCM', false, ['decrypt']);
    const opened = await subtle.decrypt({ name: 'AES-GCM', iv: payload.slice(1, 13), additionalData: aad }, key, payload.slice(13));
    expect(new TextDecoder().decode(opened)).toBe(vector.plaintext);
  });

  it('refuses the uncompressed secp256k1 recipient key in crypto.subtle too', async () => {
    const secpVectors = vectors.negative.filter(
      (vector): vector is Extract<NegativeVector, { operation: 'wrap' }> =>
        vector.operation === 'wrap' && vector.recipientPublicKey.length === 130,
    );
    expect(secpVectors.length).toBeGreaterThan(0);
    for (const vector of secpVectors) {
      await expect(subtle.importKey('raw', bytes(vector.recipientPublicKey), P256, false, [])).rejects.toThrow();
    }
  });
});

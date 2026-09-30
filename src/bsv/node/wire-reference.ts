// src/bsv/node/wire-reference.ts — Node reference for the wire formats of docs/bsv-wire-formats.md
// (spec §8 Q14, mw-jeswf.1): the epoch commitment c(e), the seed-to-P-256 key derivation, the
// wrap of k(e) to a P-256 key and the W payload encryption under k(e).
//
// node:crypto only. Every random input (ephemeral key, nonce) is an explicit argument, so each
// output is deterministic and scripts/bsv-wire-vectors.ts can pin it as a test vector. This is
// the reference the vectors are generated from, not the browser implementation: that one is to
// use crypto.subtle (see the doc's "Library choice"). Node-only: kept out of src/bsv/index.ts.

import { createCipheriv, createDecipheriv, createECDH, createHash, hkdfSync } from 'node:crypto';

/** P-256 (secp256r1) domain parameters, SEC 2 §2.4.2 / FIPS 186-5. */
export const P256_P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
export const P256_B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
export const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

export const EPOCH_KEY_BYTES = 32;
export const COMMITMENT_BYTES = 32;
export const P256_PUBLIC_KEY_BYTES = 65; // SEC 1 uncompressed: 0x04 ‖ X ‖ Y
export const NONCE_BYTES = 12;
export const TAG_BYTES = 16;
export const MIN_SEED_BYTES = 32;

export const COMMITMENT_LABEL = 'nftgate-epoch';
export const DERIVE_SALT = 'nftgate-p256';
export const DERIVE_OKM_BYTES = 48; // n's 256 bits + 128, reduced mod (n - 1): FIPS 186-5 A.2.1
export const WRAP_SALT = 'nftgate-wrap';
export const WRAP_VERSION = 0x01;
export const WRAP_BYTES = 1 + P256_PUBLIC_KEY_BYTES + NONCE_BYTES + EPOCH_KEY_BYTES + TAG_BYTES; // 126
export const PAYLOAD_AAD_LABEL = 'nftgate-payload';
export const PAYLOAD_VERSION = 0x01;
export const PAYLOAD_OVERHEAD_BYTES = 1 + NONCE_BYTES + TAG_BYTES; // 29

/** Why a structure was refused. Each negative vector names one of these. */
export type WireRefusal =
  | 'seed-too-short'
  | 'invalid-private-key'
  | 'not-p256-public-key'
  | 'invalid-epoch-key'
  | 'invalid-commitment'
  | 'invalid-nonce'
  | 'invalid-record-type'
  | 'malformed-length'
  | 'unknown-version'
  | 'authentication-failed';

export class WireFormatError extends Error {
  readonly refusal: WireRefusal;

  constructor(refusal: WireRefusal, message: string) {
    super(`${refusal}: ${message}`);
    this.name = 'WireFormatError';
    this.refusal = refusal;
  }
}

function asciiBytes(text: string): Uint8Array {
  if (!/^[\x20-\x7e]*$/.test(text)) throw new Error(`Not printable ASCII: ${JSON.stringify(text)}`);
  return new Uint8Array(Buffer.from(text, 'ascii'));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  return new Uint8Array(Buffer.concat(parts));
}

function toBigInt(bytes: Uint8Array): bigint {
  return bytes.length === 0 ? 0n : BigInt(`0x${Buffer.from(bytes).toString('hex')}`);
}

function toBytes32(value: bigint): Uint8Array {
  return new Uint8Array(Buffer.from(value.toString(16).padStart(64, '0'), 'hex'));
}

function requireLength(bytes: Uint8Array, length: number, refusal: WireRefusal, what: string): void {
  if (bytes.length !== length) throw new WireFormatError(refusal, `${what} is ${bytes.length} bytes, not ${length}`);
}

// ---------------------------------------------------------------------------------------------
// (1) Epoch commitment
// ---------------------------------------------------------------------------------------------

/** c(e) = SHA-256(ASCII "nftgate-epoch" ‖ k(e)): no separator, no length prefix (spec §3.4). */
export function epochCommitment(epochKey: Uint8Array): Uint8Array {
  requireLength(epochKey, EPOCH_KEY_BYTES, 'invalid-epoch-key', 'k(e)');
  return new Uint8Array(createHash('sha256').update(asciiBytes(COMMITMENT_LABEL)).update(epochKey).digest());
}

// ---------------------------------------------------------------------------------------------
// (2) Seed-to-P-256 derivation of wrap keys and the issuer reader key
// ---------------------------------------------------------------------------------------------

/** HKDF info for wrap key i: the BRC-43 invoice number "2-nftgate wrap-w/<i>" (§4.2 table). */
export function wrapKeyInfo(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0) throw new Error(`Wrap key index must be a whole number ≥ 0, got ${index}`);
  return `2-nftgate wrap-w/${index}`;
}

/** HKDF info for the issuer reader key: "2-nftgate reader-<n_C hex>", n_C the 16-byte collection nonce. */
export function readerKeyInfo(collectionNonce: Uint8Array): string {
  if (collectionNonce.length !== 16) throw new Error(`n_C must be 16 bytes, got ${collectionNonce.length}`);
  return `2-nftgate reader-${Buffer.from(collectionNonce).toString('hex')}`;
}

/** True when `point` is 65 bytes, 0x04 ‖ X ‖ Y, with X, Y < p and Y² = X³ − 3X + b (mod p). */
export function isP256PublicKey(point: Uint8Array): boolean {
  if (point.length !== P256_PUBLIC_KEY_BYTES || point[0] !== 0x04) return false;
  const x = toBigInt(point.subarray(1, 33));
  const y = toBigInt(point.subarray(33, 65));
  if (x >= P256_P || y >= P256_P) return false;
  const left = (y * y) % P256_P;
  const right = (((x * x * x - 3n * x + P256_B) % P256_P) + P256_P) % P256_P;
  return left === right;
}

function requireP256PublicKey(point: Uint8Array, what: string): void {
  if (!isP256PublicKey(point)) {
    throw new WireFormatError('not-p256-public-key', `${what} is not a 65-byte uncompressed P-256 point`);
  }
}

function requirePrivateScalar(scalar: Uint8Array, what: string): void {
  requireLength(scalar, 32, 'invalid-private-key', what);
  const value = toBigInt(scalar);
  if (value < 1n || value >= P256_N) throw new WireFormatError('invalid-private-key', `${what} is not in [1, n-1]`);
}

/** The 65-byte uncompressed public key of a 32-byte P-256 scalar. */
export function p256PublicKey(privateKey: Uint8Array): Uint8Array {
  requirePrivateScalar(privateKey, 'private key');
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(privateKey);
  return new Uint8Array(ecdh.getPublicKey(null, 'uncompressed'));
}

export interface DerivedP256Key {
  okm: Uint8Array; // the 48 HKDF output bytes
  privateKey: Uint8Array; // 32-byte big-endian scalar d = (OKM mod (n − 1)) + 1
  publicKey: Uint8Array; // 65-byte uncompressed
}

/**
 * OKM = HKDF-SHA256(IKM = seed, salt = "nftgate-p256", info, L = 48);
 * d = (OKM as a big-endian integer mod (n − 1)) + 1, so d is in [1, n − 1] on every input.
 */
export function deriveP256Key(seed: Uint8Array, info: string): DerivedP256Key {
  if (seed.length < MIN_SEED_BYTES) {
    throw new WireFormatError('seed-too-short', `seed is ${seed.length} bytes, fewer than ${MIN_SEED_BYTES}`);
  }
  const okm = new Uint8Array(hkdfSync('sha256', seed, asciiBytes(DERIVE_SALT), asciiBytes(info), DERIVE_OKM_BYTES));
  const privateKey = toBytes32((toBigInt(okm) % (P256_N - 1n)) + 1n);
  return { okm, privateKey, publicKey: p256PublicKey(privateKey) };
}

export function deriveWrapKey(seed: Uint8Array, index: number): DerivedP256Key {
  return deriveP256Key(seed, wrapKeyInfo(index));
}

export function deriveReaderKey(seed: Uint8Array, collectionNonce: Uint8Array): DerivedP256Key {
  return deriveP256Key(seed, readerKeyInfo(collectionNonce));
}

// ---------------------------------------------------------------------------------------------
// (3) The wrap: ephemeral-P-256 ECDH + HKDF-SHA256 + AES-256-GCM
// ---------------------------------------------------------------------------------------------

/** The ECDH shared secret: the 32-byte big-endian x-coordinate of d·Q. */
export function ecdhSharedSecret(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  requirePrivateScalar(privateKey, 'private key');
  requireP256PublicKey(publicKey, 'peer public key');
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(privateKey);
  return new Uint8Array(ecdh.computeSecret(publicKey));
}

/** HKDF info for a wrap: version byte ‖ ephemeral public key ‖ recipient public key (131 bytes). */
export function wrapHkdfInfo(ephemeralPublicKey: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array {
  return concat(new Uint8Array([WRAP_VERSION]), ephemeralPublicKey, recipientPublicKey);
}

/** AES key = HKDF-SHA256(IKM = shared x, salt = "nftgate-wrap", info = wrapHkdfInfo, L = 32). */
export function wrapAesKey(sharedSecret: Uint8Array, ephemeralPublicKey: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array {
  const info = wrapHkdfInfo(ephemeralPublicKey, recipientPublicKey);
  return new Uint8Array(hkdfSync('sha256', sharedSecret, asciiBytes(WRAP_SALT), info, 32));
}

export interface WrapInput {
  recipientPublicKey: Uint8Array;
  ephemeralPrivateKey: Uint8Array; // fresh from a CSPRNG in real use; explicit here for vectors
  nonce: Uint8Array; // 12 bytes, fresh from a CSPRNG in real use
  epochKey: Uint8Array;
}

/** 0x01 ‖ ephemeral public key (65) ‖ nonce (12) ‖ AES-256-GCM(k(e)) (32) ‖ tag (16) = 126 bytes. */
export function wrapEpochKey(input: WrapInput): Uint8Array {
  requireP256PublicKey(input.recipientPublicKey, 'recipient public key');
  requireLength(input.epochKey, EPOCH_KEY_BYTES, 'invalid-epoch-key', 'k(e)');
  requireLength(input.nonce, NONCE_BYTES, 'invalid-nonce', 'nonce');
  const ephemeralPublicKey = p256PublicKey(input.ephemeralPrivateKey);
  const shared = ecdhSharedSecret(input.ephemeralPrivateKey, input.recipientPublicKey);
  const key = wrapAesKey(shared, ephemeralPublicKey, input.recipientPublicKey);
  const header = concat(new Uint8Array([WRAP_VERSION]), ephemeralPublicKey);

  const cipher = createCipheriv('aes-256-gcm', key, input.nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(header);
  const ciphertext = Buffer.concat([cipher.update(input.epochKey), cipher.final()]);
  return concat(header, input.nonce, ciphertext, cipher.getAuthTag());
}

/**
 * Opens a wrap with the recipient's private key and returns k(e). Checks, in this order:
 * empty → malformed-length; byte 0 ≠ 0x01 → unknown-version; length ≠ 126 → malformed-length;
 * ephemeral key not a P-256 point → not-p256-public-key; GCM tag → authentication-failed.
 */
export function unwrapEpochKey(wrap: Uint8Array, recipientPrivateKey: Uint8Array): Uint8Array {
  if (wrap.length === 0) throw new WireFormatError('malformed-length', 'wrap is empty');
  if (wrap[0] !== WRAP_VERSION) throw new WireFormatError('unknown-version', `wrap version 0x${wrap[0].toString(16).padStart(2, '0')}`);
  requireLength(wrap, WRAP_BYTES, 'malformed-length', 'wrap');

  const header = wrap.subarray(0, 66);
  const ephemeralPublicKey = wrap.subarray(1, 66);
  const nonce = wrap.subarray(66, 78);
  const ciphertext = wrap.subarray(78, 110);
  const tag = wrap.subarray(110, 126);
  requireP256PublicKey(ephemeralPublicKey, 'ephemeral public key');

  const recipientPublicKey = p256PublicKey(recipientPrivateKey);
  const shared = ecdhSharedSecret(recipientPrivateKey, ephemeralPublicKey);
  const key = wrapAesKey(shared, ephemeralPublicKey, recipientPublicKey);
  return gcmOpen(key, nonce, header, ciphertext, tag);
}

function gcmOpen(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, ciphertext: Uint8Array, tag: Uint8Array): Uint8Array {
  const decipher = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_BYTES });
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  const plaintext = decipher.update(ciphertext);
  try {
    return new Uint8Array(Buffer.concat([plaintext, decipher.final()]));
  } catch {
    throw new WireFormatError('authentication-failed', 'AES-256-GCM tag does not verify');
  }
}

// ---------------------------------------------------------------------------------------------
// (4) Record payload encryption under k(e) (pinned for W)
// ---------------------------------------------------------------------------------------------

/** AAD = "nftgate-payload" ‖ 0x01 ‖ len(record type) ‖ record type (ASCII) ‖ c(e). 50 bytes for W. */
export function payloadAad(recordType: string, commitment: Uint8Array): Uint8Array {
  if (!/^[\x21-\x7e]{1,8}$/.test(recordType)) {
    throw new WireFormatError('invalid-record-type', `record type ${JSON.stringify(recordType)}`);
  }
  requireLength(commitment, COMMITMENT_BYTES, 'invalid-commitment', 'c(e)');
  const type = asciiBytes(recordType);
  return concat(asciiBytes(PAYLOAD_AAD_LABEL), new Uint8Array([PAYLOAD_VERSION, type.length]), type, commitment);
}

export interface PayloadInput {
  epochKey: Uint8Array;
  commitment: Uint8Array; // c(e) of epochKey, the record's §3.8 field 3
  recordType: string; // 'W'
  nonce: Uint8Array; // 12 bytes, fresh from a CSPRNG in real use
  plaintext: Uint8Array; // for W: UTF-8 JSON {"text":…,"ts":…}
}

/** 0x01 ‖ nonce (12) ‖ AES-256-GCM(k(e), nonce, plaintext, AAD) ‖ tag (16): 29 + plaintext bytes. */
export function encryptPayload(input: PayloadInput): Uint8Array {
  requireLength(input.epochKey, EPOCH_KEY_BYTES, 'invalid-epoch-key', 'k(e)');
  requireLength(input.nonce, NONCE_BYTES, 'invalid-nonce', 'nonce');
  const aad = payloadAad(input.recordType, input.commitment);
  const cipher = createCipheriv('aes-256-gcm', input.epochKey, input.nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(input.plaintext), cipher.final()]);
  return concat(new Uint8Array([PAYLOAD_VERSION]), input.nonce, ciphertext, cipher.getAuthTag());
}

/**
 * Opens a payload. Checks, in this order: empty → malformed-length; byte 0 ≠ 0x01 →
 * unknown-version; shorter than 29 bytes → malformed-length; GCM tag → authentication-failed.
 */
export function decryptPayload(payload: Uint8Array, epochKey: Uint8Array, commitment: Uint8Array, recordType: string): Uint8Array {
  if (payload.length === 0) throw new WireFormatError('malformed-length', 'payload is empty');
  if (payload[0] !== PAYLOAD_VERSION) {
    throw new WireFormatError('unknown-version', `payload version 0x${payload[0].toString(16).padStart(2, '0')}`);
  }
  if (payload.length < PAYLOAD_OVERHEAD_BYTES) {
    throw new WireFormatError('malformed-length', `payload is ${payload.length} bytes, fewer than ${PAYLOAD_OVERHEAD_BYTES}`);
  }
  requireLength(epochKey, EPOCH_KEY_BYTES, 'invalid-epoch-key', 'k(e)');
  const aad = payloadAad(recordType, commitment);
  const nonce = payload.subarray(1, 13);
  const ciphertext = payload.subarray(13, payload.length - TAG_BYTES);
  const tag = payload.subarray(payload.length - TAG_BYTES);
  return gcmOpen(epochKey, nonce, aad, ciphertext, tag);
}

/** The W plaintext: UTF-8 of JSON.stringify({ text, ts }), keys in that order, no whitespace. */
export function encodeWritePlaintext(text: string, ts: string): Uint8Array {
  return new Uint8Array(Buffer.from(JSON.stringify({ text, ts }), 'utf8'));
}

// src/bsv/epoch-crypto.ts — The library's epoch crypto (mw-jeswf.2): the wire formats of
// docs/bsv-wire-formats.md (spec §8 Q14) in the browser, on WebCrypto (crypto.subtle) only.
//
//   k(e)  generateEpochKey()                      32 CSPRNG bytes
//   c(e)  epochCommitment(k)                      SHA-256("nftgate-epoch" ‖ k)
//   keys  deriveWrapKeyPair(seed, i)              HKDF-SHA256 → P-256 key w/<i>
//         deriveReaderKeyPair(seed, n_C hex)      the same scheme, issuer reader key
//   wrap  wrapEpochKey / unwrapEpochKey           ephemeral P-256 ECDH + HKDF + AES-256-GCM
//   W     encryptPayload / decryptPayload         AES-256-GCM under k(e), AAD binds type and c(e)
//
// Browser-safe: no imports, no node: modules, no Buffer. Every failure reaches the caller as an
// EpochCryptoError with a `refusal` code (the same codes the doc and the fixture's negative
// vectors use), never a raw DOMException. The Node reference, src/bsv/node/wire-reference.ts,
// computes the same bytes with node:crypto; tests/unit/bsv-epoch-crypto.test.ts checks both.
//
// Randomness: every production call draws a fresh ephemeral key and nonce. The `options`
// arguments that inject them exist only so the fixed test vectors reproduce.

/** P-256 domain parameters (SEC 2 §2.4.2, FIPS 186-5). */
const P256_P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const P256_B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

export const EPOCH_KEY_BYTES = 32;
export const COMMITMENT_BYTES = 32;
export const P256_PUBLIC_KEY_BYTES = 65; // SEC 1 uncompressed: 0x04 ‖ X ‖ Y
export const P256_PRIVATE_KEY_BYTES = 32;
/** The seed is the holder's 32-byte root private key (R4.2.1); not a BIP-39 seed, not a BRC-42 child key. */
export const SEED_BYTES = 32;
export const WRAP_VERSION = 0x01;
export const WRAP_BYTES = 126; // 0x01 ‖ E (65) ‖ nonce (12) ‖ ciphertext (32) ‖ tag (16)
export const PAYLOAD_VERSION = 0x01;
export const PAYLOAD_OVERHEAD_BYTES = 29; // 0x01 ‖ nonce (12) ‖ … ‖ tag (16)

const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const COMMITMENT_LABEL = 'nftgate-epoch';
const DERIVE_SALT = 'nftgate-p256';
const DERIVE_OKM_BITS = 384; // 48 bytes, reduced mod (n − 1) then + 1 (FIPS 186-5 A.2.1)
const WRAP_SALT = 'nftgate-wrap';
const PAYLOAD_AAD_LABEL = 'nftgate-payload';
/** DER PKCS#8 of a P-256 private key with no public key; the 32-byte scalar follows. */
const PKCS8_P256_PREFIX = '3041020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420';
const ECDH_P256 = { name: 'ECDH', namedCurve: 'P-256' } as const;

/** Why an operation was refused. The first ten are the doc's and the fixture's refusals. */
export type EpochCryptoRefusal =
  | 'seed-too-short'
  | 'seed-wrong-length'
  | 'invalid-private-key'
  | 'not-p256-public-key'
  | 'invalid-epoch-key'
  | 'invalid-commitment'
  | 'invalid-nonce'
  | 'invalid-record-type'
  | 'malformed-length'
  | 'unknown-version'
  | 'authentication-failed'
  | 'invalid-wrap-index'
  | 'invalid-collection-nonce'
  | 'commitment-mismatch'
  | 'crypto-unavailable';

export class EpochCryptoError extends Error {
  readonly refusal: EpochCryptoRefusal;

  constructor(refusal: EpochCryptoRefusal, message: string) {
    super(message);
    this.name = 'EpochCryptoError';
    this.refusal = refusal;
  }
}

/** A P-256 key pair as bytes: the 32-byte big-endian scalar and the 65-byte uncompressed point. */
export interface P256KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

/** Test-only: fixes a wrap's ephemeral private key and nonce. Production calls omit it. */
export interface WrapEpochKeyOptions {
  ephemeralPrivateKey?: Uint8Array;
  nonce?: Uint8Array;
}

/** Test-only: fixes a payload's nonce. Production calls omit it. */
export interface EncryptPayloadOptions {
  nonce?: Uint8Array;
}

export interface EncryptPayloadParams {
  epochKey: Uint8Array;
  recordType: string; // §3.8 field 2, e.g. 'W'
  plaintext: Uint8Array; // for W: encodeWritePlaintext(text, ts)
}

export interface DecryptPayloadParams {
  payload: Uint8Array;
  epochKey: Uint8Array;
  commitment: Uint8Array; // the record's declared c(e), §3.8 field 3
  recordType: string;
}

// ---------------------------------------------------------------------------------------------
// Bytes
// ---------------------------------------------------------------------------------------------

/** A private copy on a plain ArrayBuffer, as crypto.subtle's BufferSource wants. */
function copy(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
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

function ascii(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

function fromHex(hexString: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hexString.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function toBytes32(value: bigint): Uint8Array<ArrayBuffer> {
  return fromHex(value.toString(16).padStart(64, '0'));
}

function base64UrlToBytes32(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(32);
  out.set(Uint8Array.from(binary, (char) => char.charCodeAt(0)), 32 - binary.length);
  return out;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function byteHex(byte: number): string {
  return `0x${byte.toString(16).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

function requireLength(bytes: Uint8Array, length: number, refusal: EpochCryptoRefusal, what: string): void {
  if (!(bytes instanceof Uint8Array) || bytes.length !== length) {
    const got = bytes instanceof Uint8Array ? `${bytes.length} bytes` : 'not a byte array';
    throw new EpochCryptoError(refusal, `${what} must be ${length} bytes, got ${got}`);
  }
}

function requirePrivateScalar(scalar: Uint8Array, what: string): void {
  requireLength(scalar, P256_PRIVATE_KEY_BYTES, 'invalid-private-key', what);
  const value = toBigInt(scalar);
  if (value < 1n || value >= P256_N) {
    throw new EpochCryptoError('invalid-private-key', `${what} is not a P-256 private key (not in [1, n − 1])`);
  }
}

/** True when `point` is 65 bytes, 0x04 ‖ X ‖ Y, with X, Y < p and Y² = X³ − 3X + b (mod p). */
export function isP256PublicKey(point: Uint8Array): boolean {
  if (!(point instanceof Uint8Array) || point.length !== P256_PUBLIC_KEY_BYTES || point[0] !== 0x04) return false;
  const x = toBigInt(point.subarray(1, 33));
  const y = toBigInt(point.subarray(33, 65));
  if (x >= P256_P || y >= P256_P) return false;
  const left = (y * y) % P256_P;
  const right = (((x * x * x - 3n * x + P256_B) % P256_P) + P256_P) % P256_P;
  return left === right;
}

function requireP256PublicKey(point: Uint8Array, what: string): void {
  if (isP256PublicKey(point)) return;
  const shape =
    point instanceof Uint8Array && point.length === 33 && (point[0] === 0x02 || point[0] === 0x03)
      ? 'a 33-byte compressed key, as secp256k1 owner keys are carried'
      : point instanceof Uint8Array && point.length === P256_PUBLIC_KEY_BYTES && point[0] === 0x04
        ? 'an uncompressed point that is not on P-256 (a secp256k1 key?)'
        : `${point instanceof Uint8Array ? point.length : 0} bytes, not a 65-byte uncompressed P-256 point`;
  throw new EpochCryptoError('not-p256-public-key', `malformed: wrap keys are P-256; ${what} is ${shape}`);
}

function requireRecordType(recordType: string): void {
  if (typeof recordType !== 'string' || !/^[\x21-\x7e]{1,8}$/.test(recordType)) {
    throw new EpochCryptoError('invalid-record-type', `record type ${JSON.stringify(recordType)} is not 1-8 printable ASCII characters`);
  }
}

// ---------------------------------------------------------------------------------------------
// crypto.subtle, with every failure turned into an EpochCryptoError
// ---------------------------------------------------------------------------------------------

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) {
    throw new EpochCryptoError(
      'crypto-unavailable',
      'WebCrypto (crypto.subtle) is not available here: the page must be served over https or from localhost',
    );
  }
  return api;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  if (!globalThis.crypto?.getRandomValues) {
    throw new EpochCryptoError('crypto-unavailable', 'crypto.getRandomValues is not available here');
  }
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/** Runs one crypto.subtle step; a rejection becomes an EpochCryptoError with `refusal`. */
async function step<T>(refusal: EpochCryptoRefusal, what: string, run: (api: SubtleCrypto) => Promise<T>): Promise<T> {
  const api = subtle();
  try {
    return await run(api);
  } catch (error) {
    if (error instanceof EpochCryptoError) throw error;
    throw new EpochCryptoError(refusal, `${what} (${describeError(error)})`);
  }
}

async function sha256(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await step('crypto-unavailable', 'SHA-256 failed', (api) => api.digest('SHA-256', data)));
}

async function hkdf(ikm: Uint8Array, salt: string, info: Uint8Array, bits: number): Promise<Uint8Array> {
  return step('crypto-unavailable', 'HKDF-SHA256 failed', async (api) => {
    const key = await api.importKey('raw', copy(ikm), 'HKDF', false, ['deriveBits']);
    const params = { name: 'HKDF', hash: 'SHA-256', salt: ascii(salt), info: copy(info) };
    return new Uint8Array(await api.deriveBits(params, key, bits));
  });
}

/** Imports a P-256 scalar (PKCS#8 without its public key) and reads its public point back. */
async function importScalar(scalar: Uint8Array): Promise<{ privateKey: CryptoKey; publicKey: Uint8Array }> {
  return step('crypto-unavailable', 'this browser could not import a P-256 private key', async (api) => {
    const privateKey = await api.importKey('pkcs8', concat(fromHex(PKCS8_P256_PREFIX), scalar), ECDH_P256, true, ['deriveBits']);
    const jwk = await api.exportKey('jwk', privateKey);
    if (!jwk.x || !jwk.y) throw new Error('the exported key has no public point');
    return { privateKey, publicKey: concat(new Uint8Array([0x04]), base64UrlToBytes32(jwk.x), base64UrlToBytes32(jwk.y)) };
  });
}

/** The ECDH shared secret: the 32-byte x-coordinate of d·Q (deriveBits 256). */
async function ecdh(privateKey: CryptoKey, peerPublicKey: Uint8Array, what: string): Promise<Uint8Array> {
  const publicKey = await step('not-p256-public-key', `malformed: wrap keys are P-256; ${what} was refused`, (api) =>
    api.importKey('raw', copy(peerPublicKey), ECDH_P256, true, []),
  );
  return step('crypto-unavailable', 'P-256 key agreement failed', async (api) =>
    new Uint8Array(await api.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256)),
  );
}

async function aesKey(raw: Uint8Array, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  return step('crypto-unavailable', 'AES-256-GCM key import failed', (api) => api.importKey('raw', copy(raw), 'AES-GCM', false, [usage]));
}

async function gcmSeal(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await aesKey(key, 'encrypt');
  const params = { name: 'AES-GCM', iv: copy(nonce), additionalData: copy(aad), tagLength: TAG_BYTES * 8 };
  return step('crypto-unavailable', 'AES-256-GCM encryption failed', async (api) =>
    new Uint8Array(await api.encrypt(params, cryptoKey, copy(plaintext))),
  );
}

/** Opens ciphertext ‖ tag; a tag that does not verify is 'authentication-failed'. */
async function gcmOpen(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, sealed: Uint8Array, what: string): Promise<Uint8Array> {
  const cryptoKey = await aesKey(key, 'decrypt');
  const params = { name: 'AES-GCM', iv: copy(nonce), additionalData: copy(aad), tagLength: TAG_BYTES * 8 };
  try {
    return new Uint8Array(await subtle().decrypt(params, cryptoKey, copy(sealed)));
  } catch (error) {
    if (error instanceof EpochCryptoError) throw error;
    throw new EpochCryptoError('authentication-failed', `${what}: the AES-256-GCM tag does not verify (wrong key, or the bytes were changed)`);
  }
}

// ---------------------------------------------------------------------------------------------
// (1) Epoch key and commitment
// ---------------------------------------------------------------------------------------------

/** A fresh epoch key k(e): 32 bytes from crypto.getRandomValues (R4.2.8). */
export function generateEpochKey(): Uint8Array {
  return randomBytes(EPOCH_KEY_BYTES);
}

/** c(e) = SHA-256(ASCII "nftgate-epoch" ‖ k(e)), 45 bytes hashed (spec §3.4). */
export async function epochCommitment(epochKey: Uint8Array): Promise<Uint8Array> {
  requireLength(epochKey, EPOCH_KEY_BYTES, 'invalid-epoch-key', 'k(e)');
  return sha256(concat(ascii(COMMITMENT_LABEL), epochKey));
}

// ---------------------------------------------------------------------------------------------
// (2) Seed-to-P-256 derivation
// ---------------------------------------------------------------------------------------------

/**
 * OKM = HKDF-SHA256(IKM = seed, salt = "nftgate-p256", info, L = 48);
 * d = (OKM mod (n − 1)) + 1; Q = d·G, read back from crypto.subtle.
 */
async function deriveP256KeyPair(seed: Uint8Array, info: string): Promise<P256KeyPair> {
  if (!(seed instanceof Uint8Array) || seed.length < SEED_BYTES) {
    const got = seed instanceof Uint8Array ? seed.length : 0;
    throw new EpochCryptoError('seed-too-short', `the seed is ${got} bytes; exactly ${SEED_BYTES} are needed`);
  }
  if (seed.length !== SEED_BYTES) {
    throw new EpochCryptoError(
      'seed-wrong-length',
      `the seed is ${seed.length} bytes; exactly ${SEED_BYTES} are needed (the holder root private key, not a BIP-39 seed)`,
    );
  }
  const okm = await hkdf(seed, DERIVE_SALT, ascii(info), DERIVE_OKM_BITS);
  const privateKey = toBytes32((toBigInt(okm) % (P256_N - 1n)) + 1n);
  const { publicKey } = await importScalar(privateKey);
  return { privateKey, publicKey };
}

/** Wrap key w/<index>: HKDF info is the BRC-43 invoice number "2-nftgate wrap-w/<index>". */
export async function deriveWrapKeyPair(seed: Uint8Array, index: number): Promise<P256KeyPair> {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new EpochCryptoError('invalid-wrap-index', `the wrap key index must be a whole number ≥ 0, got ${index}`);
  }
  return deriveP256KeyPair(seed, `2-nftgate wrap-w/${index}`);
}

/** The issuer reader key for collection nonce n_C (16 bytes as 32 hex characters). */
export async function deriveReaderKeyPair(seed: Uint8Array, collectionNonceHex: string): Promise<P256KeyPair> {
  if (typeof collectionNonceHex !== 'string' || !/^[0-9a-fA-F]{32}$/.test(collectionNonceHex)) {
    throw new EpochCryptoError('invalid-collection-nonce', `n_C must be 16 bytes as 32 hex characters, got ${JSON.stringify(collectionNonceHex)}`);
  }
  return deriveP256KeyPair(seed, `2-nftgate reader-${collectionNonceHex.toLowerCase()}`);
}

// ---------------------------------------------------------------------------------------------
// (3) The wrap of k(e) to a P-256 key
// ---------------------------------------------------------------------------------------------

/** HKDF info for a wrap: 0x01 ‖ ephemeral public key E ‖ recipient public key R (131 bytes). */
export function wrapHkdfInfo(ephemeralPublicKey: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array {
  return concat(new Uint8Array([WRAP_VERSION]), ephemeralPublicKey, recipientPublicKey);
}

async function wrapAesKey(shared: Uint8Array, ephemeralPublicKey: Uint8Array, recipientPublicKey: Uint8Array): Promise<Uint8Array> {
  return hkdf(shared, WRAP_SALT, wrapHkdfInfo(ephemeralPublicKey, recipientPublicKey), 256);
}

/** A fresh ephemeral P-256 key pair, or the injected test scalar's. */
async function ephemeralKeyPair(injected: Uint8Array | undefined): Promise<{ privateKey: CryptoKey; publicKey: Uint8Array }> {
  if (injected !== undefined) {
    requirePrivateScalar(injected, 'the ephemeral private key');
    return importScalar(injected);
  }
  return step('crypto-unavailable', 'could not generate an ephemeral P-256 key', async (api) => {
    const pair = await api.generateKey(ECDH_P256, false, ['deriveBits']);
    return { privateKey: pair.privateKey, publicKey: new Uint8Array(await api.exportKey('raw', pair.publicKey)) };
  });
}

/**
 * Wraps k(e) to a recipient's P-256 wrap public key:
 * 0x01 ‖ E (65) ‖ nonce (12) ‖ AES-256-GCM(K, nonce, AAD = 0x01 ‖ E, k(e)) (32) ‖ tag (16).
 * A recipient that is not a 65-byte uncompressed P-256 point (a secp256k1 key) is refused.
 */
export async function wrapEpochKey(
  epochKey: Uint8Array,
  recipientPublicKey: Uint8Array,
  options: WrapEpochKeyOptions = {},
): Promise<Uint8Array> {
  requireP256PublicKey(recipientPublicKey, 'the recipient key');
  requireLength(epochKey, EPOCH_KEY_BYTES, 'invalid-epoch-key', 'k(e)');
  const nonce = options.nonce ?? randomBytes(NONCE_BYTES);
  requireLength(nonce, NONCE_BYTES, 'invalid-nonce', 'the nonce');

  const ephemeral = await ephemeralKeyPair(options.ephemeralPrivateKey);
  const shared = await ecdh(ephemeral.privateKey, recipientPublicKey, 'the recipient key');
  const key = await wrapAesKey(shared, ephemeral.publicKey, recipientPublicKey);
  const header = concat(new Uint8Array([WRAP_VERSION]), ephemeral.publicKey);
  return concat(header, nonce, await gcmSeal(key, nonce, header, epochKey));
}

/**
 * Opens a wrap with the recipient's 32-byte P-256 private key and returns k(e), after checking
 * that SHA-256("nftgate-epoch" ‖ k(e)) equals the commitment the record declares.
 * Refusals, in order: empty → malformed-length; byte 0 ≠ 0x01 → unknown-version; length ≠ 126 →
 * malformed-length; E not a P-256 point → not-p256-public-key; the tag (wrong key, tampered
 * bytes) → authentication-failed; the opened key's c(e) → commitment-mismatch.
 */
export async function unwrapEpochKey(
  wrap: Uint8Array,
  recipientPrivateKey: Uint8Array,
  expectedCommitment: Uint8Array,
): Promise<Uint8Array> {
  requirePrivateScalar(recipientPrivateKey, 'the recipient private key');
  requireLength(expectedCommitment, COMMITMENT_BYTES, 'invalid-commitment', 'the expected c(e)');
  if (!(wrap instanceof Uint8Array) || wrap.length === 0) throw new EpochCryptoError('malformed-length', 'the wrap is empty');
  if (wrap[0] !== WRAP_VERSION) {
    throw new EpochCryptoError('unknown-version', `unknown wrap version ${byteHex(wrap[0])}; this library reads ${byteHex(WRAP_VERSION)}`);
  }
  requireLength(wrap, WRAP_BYTES, 'malformed-length', 'a wrap');

  const header = wrap.subarray(0, 66);
  const ephemeralPublicKey = wrap.subarray(1, 66);
  const nonce = wrap.subarray(66, 78);
  requireP256PublicKey(ephemeralPublicKey, "the wrap's ephemeral key");

  const recipient = await importScalar(recipientPrivateKey);
  const shared = await ecdh(recipient.privateKey, ephemeralPublicKey, "the wrap's ephemeral key");
  const key = await wrapAesKey(shared, ephemeralPublicKey, recipient.publicKey);
  const epochKey = await gcmOpen(key, nonce, header, wrap.subarray(78), 'this wrap cannot be opened with this key');
  if (!equalBytes(await epochCommitment(epochKey), expectedCommitment)) {
    throw new EpochCryptoError('commitment-mismatch', 'the wrapped key does not match the epoch commitment the record declares');
  }
  return epochKey;
}

// ---------------------------------------------------------------------------------------------
// (4) Record payload encryption under k(e) (pinned for W)
// ---------------------------------------------------------------------------------------------

/** AAD = "nftgate-payload" ‖ 0x01 ‖ len(type) ‖ type ‖ c(e): 50 bytes for W. */
export function payloadAad(recordType: string, commitment: Uint8Array): Uint8Array {
  requireRecordType(recordType);
  requireLength(commitment, COMMITMENT_BYTES, 'invalid-commitment', 'c(e)');
  const type = ascii(recordType);
  return concat(ascii(PAYLOAD_AAD_LABEL), new Uint8Array([PAYLOAD_VERSION, type.length]), type, commitment);
}

/**
 * Encrypts a record payload under k(e), bound to the record type and to c(e) (computed here from
 * k(e)): 0x01 ‖ nonce (12) ‖ ciphertext ‖ tag (16), 29 + plaintext bytes.
 */
export async function encryptPayload(params: EncryptPayloadParams, options: EncryptPayloadOptions = {}): Promise<Uint8Array> {
  requireLength(params.epochKey, EPOCH_KEY_BYTES, 'invalid-epoch-key', 'k(e)');
  requireRecordType(params.recordType);
  const nonce = options.nonce ?? randomBytes(NONCE_BYTES);
  requireLength(nonce, NONCE_BYTES, 'invalid-nonce', 'the nonce');
  const aad = payloadAad(params.recordType, await epochCommitment(params.epochKey));
  return concat(new Uint8Array([PAYLOAD_VERSION]), nonce, await gcmSeal(params.epochKey, nonce, aad, params.plaintext));
}

/**
 * Opens a record payload. Refusals, in order: empty → malformed-length; byte 0 ≠ 0x01 →
 * unknown-version; shorter than 29 bytes → malformed-length; the tag (wrong k(e), another c(e)
 * or record type, tampered bytes) → authentication-failed.
 */
export async function decryptPayload(params: DecryptPayloadParams): Promise<Uint8Array> {
  const { payload } = params;
  if (!(payload instanceof Uint8Array) || payload.length === 0) throw new EpochCryptoError('malformed-length', 'the payload is empty');
  if (payload[0] !== PAYLOAD_VERSION) {
    throw new EpochCryptoError('unknown-version', `unknown payload version ${byteHex(payload[0])}; this library reads ${byteHex(PAYLOAD_VERSION)}`);
  }
  if (payload.length < PAYLOAD_OVERHEAD_BYTES) {
    throw new EpochCryptoError('malformed-length', `the payload is ${payload.length} bytes, fewer than ${PAYLOAD_OVERHEAD_BYTES}`);
  }
  requireLength(params.epochKey, EPOCH_KEY_BYTES, 'invalid-epoch-key', 'k(e)');
  const aad = payloadAad(params.recordType, params.commitment);
  return gcmOpen(params.epochKey, payload.subarray(1, 13), aad, payload.subarray(13), 'this payload cannot be read with this epoch key');
}

/** The W plaintext: UTF-8 of JSON.stringify({ text, ts }), keys in that order, no whitespace. */
export function encodeWritePlaintext(text: string, ts: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ text, ts }));
}

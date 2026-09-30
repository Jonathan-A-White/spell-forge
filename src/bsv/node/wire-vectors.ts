// src/bsv/node/wire-vectors.ts — The test vectors of docs/bsv-wire-formats.md (mw-jeswf.1):
// fixed published inputs run through the Node reference (wire-reference.ts). Written to
// tests/fixtures/bsv/wire-vectors.json by `npm run bsv:vectors`; the unit test regenerates
// them and compares byte for byte.
//
// Every input is a published counting pattern (bytes s, s+1, s+2, ...) or a public constant
// (the secp256k1 generator), never a harness or wallet key. Node-only.

import {
  WireFormatError,
  decryptPayload,
  deriveP256Key,
  deriveReaderKey,
  deriveWrapKey,
  ecdhSharedSecret,
  encodeWritePlaintext,
  encryptPayload,
  epochCommitment,
  p256PublicKey,
  payloadAad,
  readerKeyInfo,
  unwrapEpochKey,
  wrapAesKey,
  wrapEpochKey,
  wrapHkdfInfo,
  wrapKeyInfo,
  type DerivedP256Key,
  type WireRefusal,
} from './wire-reference';

export interface CommitmentVector {
  name: string;
  epochKey: string;
  commitment: string;
}

export interface DerivationVector {
  name: string;
  seed: string;
  info: string; // ASCII
  infoHex: string;
  okm: string;
  privateKey: string;
  publicKey: string;
}

export interface WrapVector {
  name: string;
  recipient: string; // the derivation vector whose key receives the wrap
  recipientPrivateKey: string;
  recipientPublicKey: string;
  ephemeralPrivateKey: string;
  ephemeralPublicKey: string;
  nonce: string;
  epochKey: string;
  sharedSecret: string;
  hkdfInfo: string;
  aesKey: string;
  wrap: string;
}

export interface PayloadVector {
  name: string;
  epochKey: string;
  commitment: string;
  recordType: string;
  nonce: string;
  plaintext: string; // UTF-8 text
  plaintextHex: string;
  aad: string;
  payload: string;
}

export type NegativeVector =
  | { name: string; operation: 'derive'; seed: string; info: string; refusal: WireRefusal }
  | {
      name: string;
      operation: 'wrap';
      recipientPublicKey: string;
      ephemeralPrivateKey: string;
      nonce: string;
      epochKey: string;
      refusal: WireRefusal;
    }
  | { name: string; operation: 'unwrap'; wrap: string; recipientPrivateKey: string; refusal: WireRefusal }
  | {
      name: string;
      operation: 'decryptPayload';
      payload: string;
      epochKey: string;
      commitment: string;
      recordType: string;
      refusal: WireRefusal;
    };

export interface WireVectors {
  about: string;
  commitment: CommitmentVector[];
  derivation: DerivationVector[];
  wrap: WrapVector[];
  payload: PayloadVector[];
  negative: NegativeVector[];
}

/** Bytes start, start+1, ... (mod 256): the published pattern every seed, key and nonce here uses. */
export function countingBytes(start: number, length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, i) => (start + i) & 0xff);
}

/** True when `seed` is a counting pattern: what the fixture's seeds must be (no wallet keys). */
export function isPublishedCountingSeed(seed: Uint8Array): boolean {
  return seed.length > 0 && seed.every((byte, i) => byte === ((seed[0] + i) & 0xff));
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function fromHex(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, 'hex'));
}

/** The secp256k1 generator G (SEC 2 §2.4.1): a public secp256k1 point, the wrong curve for a wrap. */
const SECP256K1_G_UNCOMPRESSED =
  '0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798' +
  '483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8';
const SECP256K1_G_COMPRESSED = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

const SEED_A = countingBytes(0x01, 32); // 01 02 … 20
const SEED_B = countingBytes(0x21, 32); // 21 22 … 40
const SEED_ISSUER = countingBytes(0x41, 32); // 41 42 … 60
const SEED_LONG = countingBytes(0x61, 64); // 61 62 … a0: a 64-byte seed (e.g. a BIP-39 seed)
const COLLECTION_NONCE = countingBytes(0x00, 16); // n_C = 00 01 … 0f

const EPOCH_KEY_0 = countingBytes(0x80, 32);
const EPOCH_KEY_1 = countingBytes(0xa0, 32);

function derivationVector(name: string, seed: Uint8Array, info: string, key: DerivedP256Key): DerivationVector {
  return {
    name,
    seed: hex(seed),
    info,
    infoHex: hex(new Uint8Array(Buffer.from(info, 'ascii'))),
    okm: hex(key.okm),
    privateKey: hex(key.privateKey),
    publicKey: hex(key.publicKey),
  };
}

function wrapVector(
  name: string,
  recipient: DerivationVector,
  ephemeralPrivateKey: Uint8Array,
  nonce: Uint8Array,
  epochKey: Uint8Array,
): WrapVector {
  const recipientPublicKey = fromHex(recipient.publicKey);
  const ephemeralPublicKey = p256PublicKey(ephemeralPrivateKey);
  const sharedSecret = ecdhSharedSecret(ephemeralPrivateKey, recipientPublicKey);
  const wrap = wrapEpochKey({ recipientPublicKey, ephemeralPrivateKey, nonce, epochKey });
  // Every positive vector must open with its recipient's key; a vector that did not would be a bug here.
  if (hex(unwrapEpochKey(wrap, fromHex(recipient.privateKey))) !== hex(epochKey)) throw new Error(`${name} does not open`);
  return {
    name,
    recipient: recipient.name,
    recipientPrivateKey: recipient.privateKey,
    recipientPublicKey: recipient.publicKey,
    ephemeralPrivateKey: hex(ephemeralPrivateKey),
    ephemeralPublicKey: hex(ephemeralPublicKey),
    nonce: hex(nonce),
    epochKey: hex(epochKey),
    sharedSecret: hex(sharedSecret),
    hkdfInfo: hex(wrapHkdfInfo(ephemeralPublicKey, recipientPublicKey)),
    aesKey: hex(wrapAesKey(sharedSecret, ephemeralPublicKey, recipientPublicKey)),
    wrap: hex(wrap),
  };
}

function payloadVector(name: string, epochKey: Uint8Array, nonce: Uint8Array, text: string, ts: string): PayloadVector {
  const commitment = epochCommitment(epochKey);
  const plaintext = encodeWritePlaintext(text, ts);
  return {
    name,
    epochKey: hex(epochKey),
    commitment: hex(commitment),
    recordType: 'W',
    nonce: hex(nonce),
    plaintext: Buffer.from(plaintext).toString('utf8'),
    plaintextHex: hex(plaintext),
    aad: hex(payloadAad('W', commitment)),
    payload: hex(encryptPayload({ epochKey, commitment, recordType: 'W', nonce, plaintext })),
  };
}

/** Flips the low bit of byte `index` (negative from the end) of a hex string. */
function flipByte(text: string, index: number): string {
  const bytes = fromHex(text);
  const at = index < 0 ? bytes.length + index : index;
  bytes[at] ^= 0x01;
  return hex(bytes);
}

function setByte(text: string, index: number, value: number): string {
  const bytes = fromHex(text);
  bytes[index] = value;
  return hex(bytes);
}

/** Asserts a negative vector really is refused as stated, so the fixture never pins a wrong refusal. */
function refused(vector: NegativeVector, action: () => unknown): NegativeVector {
  try {
    action();
  } catch (error) {
    if (error instanceof WireFormatError && error.refusal === vector.refusal) return vector;
    throw new Error(`${vector.name}: expected ${vector.refusal}, got ${String(error)}`);
  }
  throw new Error(`${vector.name}: expected ${vector.refusal}, but it was accepted`);
}

export function buildWireVectors(): WireVectors {
  const commitment: CommitmentVector[] = [
    { name: 'k0', epochKey: hex(EPOCH_KEY_0), commitment: hex(epochCommitment(EPOCH_KEY_0)) },
    { name: 'k1', epochKey: hex(EPOCH_KEY_1), commitment: hex(epochCommitment(EPOCH_KEY_1)) },
  ];

  const holderA0 = derivationVector('holder A w/0', SEED_A, wrapKeyInfo(0), deriveWrapKey(SEED_A, 0));
  const holderA1 = derivationVector('holder A w/1', SEED_A, wrapKeyInfo(1), deriveWrapKey(SEED_A, 1));
  const holderB0 = derivationVector('holder B w/0', SEED_B, wrapKeyInfo(0), deriveWrapKey(SEED_B, 0));
  const reader = derivationVector(
    'issuer reader n_C=000102…0f',
    SEED_ISSUER,
    readerKeyInfo(COLLECTION_NONCE),
    deriveReaderKey(SEED_ISSUER, COLLECTION_NONCE),
  );
  const longSeed = derivationVector('64-byte seed w/7', SEED_LONG, wrapKeyInfo(7), deriveP256Key(SEED_LONG, wrapKeyInfo(7)));
  const derivation = [holderA0, holderA1, holderB0, reader, longSeed];

  const wrap = [
    wrapVector('k0 to holder A w/0', holderA0, countingBytes(0x11, 32), countingBytes(0xc0, 12), EPOCH_KEY_0),
    wrapVector('k1 to holder B w/0', holderB0, countingBytes(0x31, 32), countingBytes(0xd0, 12), EPOCH_KEY_1),
    wrapVector('k0 to the issuer reader key', reader, countingBytes(0x51, 32), countingBytes(0xe0, 12), EPOCH_KEY_0),
  ];

  const payload = [
    payloadVector('W under k0', EPOCH_KEY_0, countingBytes(0xf0, 12), 'hello', '2026-09-30T00:00:00.000Z'),
    payloadVector('W under k1, non-ASCII text', EPOCH_KEY_1, countingBytes(0x70, 12), 'Spell “forge” ✓ 🐉', '2026-09-30T12:34:56.789Z'),
  ];

  const [wrapA, wrapB] = wrap;
  const [payload0] = payload;
  const negativeInputs: NegativeVector[] = [
    { name: 'seed of 31 bytes', operation: 'derive', seed: hex(countingBytes(0x01, 31)), info: wrapKeyInfo(0), refusal: 'seed-too-short' },
    {
      name: 'wrap to a secp256k1 key (uncompressed G)',
      operation: 'wrap',
      recipientPublicKey: SECP256K1_G_UNCOMPRESSED,
      ephemeralPrivateKey: wrapA.ephemeralPrivateKey,
      nonce: wrapA.nonce,
      epochKey: wrapA.epochKey,
      refusal: 'not-p256-public-key',
    },
    {
      name: 'wrap to a secp256k1 key (33-byte compressed G, as owner keys are carried)',
      operation: 'wrap',
      recipientPublicKey: SECP256K1_G_COMPRESSED,
      ephemeralPrivateKey: wrapA.ephemeralPrivateKey,
      nonce: wrapA.nonce,
      epochKey: wrapA.epochKey,
      refusal: 'not-p256-public-key',
    },
    { name: 'wrap with tampered tag', operation: 'unwrap', wrap: flipByte(wrapA.wrap, -1), recipientPrivateKey: wrapA.recipientPrivateKey, refusal: 'authentication-failed' },
    { name: 'wrap with tampered ciphertext', operation: 'unwrap', wrap: flipByte(wrapA.wrap, 78), recipientPrivateKey: wrapA.recipientPrivateKey, refusal: 'authentication-failed' },
    { name: 'wrap opened with the wrong recipient key', operation: 'unwrap', wrap: wrapA.wrap, recipientPrivateKey: wrapB.recipientPrivateKey, refusal: 'authentication-failed' },
    { name: 'wrap with unknown version byte 0x02', operation: 'unwrap', wrap: setByte(wrapA.wrap, 0, 0x02), recipientPrivateKey: wrapA.recipientPrivateKey, refusal: 'unknown-version' },
    {
      name: 'wrap whose ephemeral key is a secp256k1 point',
      operation: 'unwrap',
      wrap: `01${SECP256K1_G_UNCOMPRESSED}${wrapA.wrap.slice(132)}`,
      recipientPrivateKey: wrapA.recipientPrivateKey,
      refusal: 'not-p256-public-key',
    },
    { name: 'wrap truncated to 125 bytes', operation: 'unwrap', wrap: wrapA.wrap.slice(0, -2), recipientPrivateKey: wrapA.recipientPrivateKey, refusal: 'malformed-length' },
    { name: 'payload with tampered tag', operation: 'decryptPayload', payload: flipByte(payload0.payload, -1), epochKey: payload0.epochKey, commitment: payload0.commitment, recordType: 'W', refusal: 'authentication-failed' },
    { name: 'payload opened under another epoch commitment', operation: 'decryptPayload', payload: payload0.payload, epochKey: payload0.epochKey, commitment: commitment[1].commitment, recordType: 'W', refusal: 'authentication-failed' },
    { name: 'payload opened as another record type', operation: 'decryptPayload', payload: payload0.payload, epochKey: payload0.epochKey, commitment: payload0.commitment, recordType: 'TR', refusal: 'authentication-failed' },
    { name: 'payload opened under the wrong epoch key', operation: 'decryptPayload', payload: payload0.payload, epochKey: hex(EPOCH_KEY_1), commitment: payload0.commitment, recordType: 'W', refusal: 'authentication-failed' },
    { name: 'payload with unknown version byte 0x02', operation: 'decryptPayload', payload: setByte(payload0.payload, 0, 0x02), epochKey: payload0.epochKey, commitment: payload0.commitment, recordType: 'W', refusal: 'unknown-version' },
    { name: 'payload of 28 bytes', operation: 'decryptPayload', payload: payload0.payload.slice(0, 56), epochKey: payload0.epochKey, commitment: payload0.commitment, recordType: 'W', refusal: 'malformed-length' },
  ];
  const negative = negativeInputs.map((vector) => refused(vector, () => runNegativeVector(vector)));

  return {
    about: 'Test vectors for docs/bsv-wire-formats.md (spec §8 Q14). Generated by `npm run bsv:vectors`; do not edit by hand.',
    commitment,
    derivation,
    wrap,
    payload,
    negative,
  };
}

/** Runs a negative vector's operation through the reference; it must throw its refusal. */
export function runNegativeVector(vector: NegativeVector): unknown {
  switch (vector.operation) {
    case 'derive':
      return deriveP256Key(fromHex(vector.seed), vector.info);
    case 'wrap':
      return wrapEpochKey({
        recipientPublicKey: fromHex(vector.recipientPublicKey),
        ephemeralPrivateKey: fromHex(vector.ephemeralPrivateKey),
        nonce: fromHex(vector.nonce),
        epochKey: fromHex(vector.epochKey),
      });
    case 'unwrap':
      return unwrapEpochKey(fromHex(vector.wrap), fromHex(vector.recipientPrivateKey));
    case 'decryptPayload':
      return decryptPayload(fromHex(vector.payload), fromHex(vector.epochKey), fromHex(vector.commitment), vector.recordType);
  }
}

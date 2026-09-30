// src/bsv/gated-records.ts — Gated records (mw-jeswf.3): the License's M record carries c(0)
// in §3.8 field 3 and, in its payload, the holder's P-256 wrap public key and a wrap of k(0)
// to it; a W carries c(0) and its payload encrypted under k(0); a TR carries c(0) and no wrap
// (a stand-in until rotation). The bytes are docs/bsv-wire-formats.md's, built by
// epoch-crypto.ts. The contract-locked builders (license-contract.ts) call the writers here;
// readGatedWrite is the reader, and never throws for a party that cannot read.
//
// M payload (field 5), UTF-8 JSON, keys in this order, the binary fields as lowercase hex:
//   { "collection": <collection id>, "holder": <holder address>,
//     "wrapKey": <65-byte uncompressed P-256 wrap public key>, "wrap": <126-byte wrap of k(0)> }
// A pre-gating M (before this story) is { collection, holder } in a 4- or 5-push layout.

import { LockingScript, PrivateKey, Transaction, Utils } from '@bsv/sdk';
import type { ChainProvider } from './chain-provider';
import type { Outpoint } from './license-token';
import { encodeTypedRecordScript, findTypedRecordsInTransaction, type DecodedTypedRecordScript } from './record';
import {
  EpochCryptoError,
  decryptPayload,
  deriveWrapKeyPair,
  encodeWritePlaintext,
  encryptPayload,
  epochCommitment,
  generateEpochKey,
  isP256PublicKey,
  unwrapEpochKey,
  wrapEpochKey,
  type P256KeyPair,
} from './epoch-crypto';

/** The License's Data output is output 2 of every transaction that carries one (rule (f)). */
const DATA_OUTPUT_INDEX = 2;

/**
 * A License token whose M record carries no wrap of k(0): minted before gated reading, so no
 * one holds a key to write (or carry a commitment) under.
 */
export class PreGatingTokenError extends Error {
  constructor() {
    super(
      'This License was minted before gated reading: its mint record carries no wrap of an epoch key, ' +
        'so it cannot write encrypted records or carry a commitment. Mint a new License.',
    );
    this.name = 'PreGatingTokenError';
  }
}

/** The writer's wrap private key does not open the wrap in its token's M record. */
export class WrapKeyRefusedError extends Error {
  readonly refusal: string;

  constructor(refusal: string, detail: string) {
    super(`This wrap key cannot open the token's epoch key (${refusal}): ${detail}`);
    this.name = 'WrapKeyRefusedError';
    this.refusal = refusal;
  }
}

/**
 * The stand-in wrap key pair of a holder until seed-based keys exist (§4.2, R4.2.14): the seed
 * is the holder WIF's 32-byte private key, and the key is w/0.
 */
export async function deriveStandInWrapKeyPair(holderWif: string): Promise<P256KeyPair> {
  const seed = Uint8Array.from(PrivateKey.fromWif(holderWif).toArray('be', 32));
  try {
    return await deriveWrapKeyPair(seed, 0);
  } finally {
    seed.fill(0);
  }
}

function jsonBytes(value: object): number[] {
  return Utils.toArray(JSON.stringify(value), 'utf8');
}

function hex(bytes: Uint8Array): string {
  return Utils.toHex(Array.from(bytes));
}

function bytesFromHex(value: unknown): Uint8Array | null {
  if (typeof value !== 'string' || !/^([0-9a-f]{2})*$/.test(value)) return null;
  return Uint8Array.from(Utils.toArray(value, 'hex'));
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

export interface GatedMintRecordParams {
  collectionId: string;
  holderAddress: string;
  /** The holder's 65-byte uncompressed P-256 wrap public key; anything else is refused as malformed. */
  holderWrapPublicKey: Uint8Array;
}

/**
 * The gated M Data output: a fresh k(0) (crypto.getRandomValues, R4.2.8), c(0) in field 3,
 * and { collection, holder, wrapKey, wrap } as the payload. k(0) leaves only inside the wrap:
 * it is neither returned nor kept, and its bytes are zeroed here (R4.2.8).
 * A holder key that is not P-256 (a secp256k1 key) is refused: EpochCryptoError 'not-p256-public-key'.
 */
export async function gatedMintRecordScript(params: GatedMintRecordParams): Promise<LockingScript> {
  const { collectionId, holderAddress, holderWrapPublicKey } = params;
  const epochKey = generateEpochKey();
  try {
    const wrap = await wrapEpochKey(epochKey, holderWrapPublicKey);
    const commitment = await epochCommitment(epochKey);
    const payload = { collection: collectionId, holder: holderAddress, wrapKey: hex(holderWrapPublicKey), wrap: hex(wrap) };
    return encodeTypedRecordScript('M', commitment, jsonBytes(payload));
  } finally {
    epochKey.fill(0);
  }
}

/** A token's M record, decoded. commitment, wrapKey and wrap are null on a pre-gating M. */
export interface TokenMintRecord {
  collection: string;
  holder: string;
  commitment: Uint8Array | null;
  wrapKey: Uint8Array | null;
  wrap: Uint8Array | null;
}

/** The M record of a mint transaction (its Data output at output 2), or null if it has none. */
export function decodeMintRecord(txHex: string): TokenMintRecord | null {
  const record = findTypedRecordsInTransaction(txHex).find((found) => found.vout === DATA_OUTPUT_INDEX && found.recordType === 'M');
  if (!record) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(Utils.toUTF8(record.payloadBytes)) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof parsed.collection !== 'string' || typeof parsed.holder !== 'string') return null;
  return {
    collection: parsed.collection,
    holder: parsed.holder,
    commitment: record.commitment ? Uint8Array.from(record.commitment) : null,
    wrapKey: bytesFromHex(parsed.wrapKey),
    wrap: bytesFromHex(parsed.wrap),
  };
}

/** Fetches the token's origin transaction and decodes its M record; throws if there is none. */
export async function fetchMintRecord(origin: Outpoint, provider: ChainProvider): Promise<TokenMintRecord> {
  return mintRecordOf(origin, await provider.getTransactionHex(origin.txid));
}

function mintRecordOf(origin: Outpoint, txHex: string): TokenMintRecord {
  const mint = decodeMintRecord(txHex);
  if (!mint) throw new Error(`The token's origin ${origin.txid}:${origin.vout} carries no M record at output ${DATA_OUTPUT_INDEX}`);
  return mint;
}

/** A wrap a reader knows of: the key it is declared to, the wrap, and the commitment its record declares. */
export interface KnownWrap {
  publicKey: Uint8Array;
  wrap: Uint8Array;
  commitment: Uint8Array;
}

/** The wraps an M record carries: one on a gated M, none on a pre-gating one. */
export function mintRecordWraps(mint: TokenMintRecord): KnownWrap[] {
  if (!mint.commitment || !mint.wrapKey || !mint.wrap) return [];
  return [{ publicKey: mint.wrapKey, wrap: mint.wrap, commitment: mint.commitment }];
}

/** The wraps the token's M record carries, fetched from its origin through the provider. */
export async function fetchTokenWraps(origin: Outpoint, provider: ChainProvider): Promise<KnownWrap[]> {
  return mintRecordWraps(await fetchMintRecord(origin, provider));
}

/**
 * The token's M record, from the transaction the builder already holds when the token has not
 * moved since its mint (token.current is the origin's transaction), else fetched.
 */
export async function tokenMintRecord(
  origin: Outpoint,
  current: { txid: string; transaction: Transaction },
  provider: ChainProvider,
): Promise<TokenMintRecord> {
  if (origin.txid === current.txid) return mintRecordOf(origin, current.transaction.toHex());
  return fetchMintRecord(origin, provider);
}

/** c(0) of a gated M, for a record that carries it without a key (TR); a pre-gating M is refused. */
export function mintCommitment(mint: TokenMintRecord): Uint8Array {
  if (!mint.commitment || !mint.wrap) throw new PreGatingTokenError();
  return mint.commitment;
}

/**
 * The gated W Data output: unwraps k(0) from the M record with the writer's wrap private key
 * (unwrapEpochKey checks c(k) against the M record's c(0)), and encrypts { text, ts } under it
 * with c(0) in field 3. A pre-gating M is refused with PreGatingTokenError; a key that cannot
 * open the wrap with WrapKeyRefusedError. k(0) is zeroed once used.
 */
export async function gatedWriteRecordScript(
  mint: TokenMintRecord,
  wrapPrivateKey: Uint8Array,
  payload: { text: string; ts: string },
): Promise<LockingScript> {
  const commitment = mintCommitment(mint);
  let epochKey: Uint8Array;
  try {
    epochKey = await unwrapEpochKey(mint.wrap as Uint8Array, wrapPrivateKey, commitment);
  } catch (error) {
    if (error instanceof EpochCryptoError) throw new WrapKeyRefusedError(error.refusal, refusalDetail(error));
    throw error;
  }
  try {
    const ciphertext = await encryptPayload({ epochKey, recordType: 'W', plaintext: encodeWritePlaintext(payload.text, payload.ts) });
    return encodeTypedRecordScript('W', commitment, Array.from(ciphertext)); // throws over the 10 KB cap, on the ciphertext
  } finally {
    epochKey.fill(0);
  }
}

function refusalDetail(error: EpochCryptoError): string {
  switch (error.refusal) {
    case 'authentication-failed':
      return 'the wrap in its mint record is addressed to another wrap key';
    case 'commitment-mismatch':
      return "the key in the wrap does not match the mint record's commitment c(0)";
    default:
      return error.message;
  }
}

/** Why a W could not be read; each is its own reason after 'cannot read: '. */
export type GatedReadRefusal = 'no-wrap-opens' | 'tag-failed' | 'commitment-mismatch' | 'not-a-write' | 'unreadable';

export type GatedReadResult =
  | { readable: true; text: string; ts: string; encrypted: boolean }
  | { readable: false; reason: GatedReadRefusal; message: string };

const CANNOT_READ: Record<GatedReadRefusal, string> = {
  'no-wrap-opens': 'cannot read: no wrap opens with this key',
  'tag-failed': "cannot read: the payload's tag does not verify under the opened key (changed bytes, or another key)",
  'commitment-mismatch': "cannot read: the opened key does not match the record's epoch commitment",
  'not-a-write': 'cannot read: this is not a W record',
  unreadable: 'cannot read: the payload is not { text, ts }',
};

function cannotRead(reason: GatedReadRefusal): GatedReadResult {
  return { readable: false, reason, message: CANNOT_READ[reason] };
}

function parseWritePlaintext(bytes: number[] | Uint8Array, encrypted: boolean): GatedReadResult {
  try {
    const parsed = JSON.parse(Utils.toUTF8(Array.from(bytes))) as Record<string, unknown>;
    if (typeof parsed.text === 'string' && typeof parsed.ts === 'string') {
      return { readable: true, text: parsed.text, ts: parsed.ts, encrypted };
    }
  } catch {
    // not JSON: unreadable below
  }
  return cannotRead('unreadable');
}

export interface ReadGatedWriteParams {
  /** The transaction's W record (decodeTypedRecordScript / findTypedRecordsInTransaction). */
  record: DecodedTypedRecordScript;
  /** The wraps the reader knows: the token's M record's (fetchTokenWraps, mintRecordWraps), or passed in. */
  wraps: KnownWrap[];
  /** The reader's 32-byte P-256 wrap private key. */
  wrapPrivateKey: Uint8Array;
}

/**
 * Reads a W record. A legacy W (no commitment: plaintext JSON) reads as plaintext. A gated W
 * is opened with the first known wrap that opens under this key, whose c(k) matches the
 * record's field 3, and whose key verifies the payload's tag. Otherwise a result whose message
 * starts 'cannot read': no wrap opens with this key, the tag, or a commitment mismatch. A wrap
 * declared to a key that is not P-256 (a secp256k1 key) counts as missing (R4.2.14). Never
 * throws for a party that cannot read.
 */
export async function readGatedWrite(params: ReadGatedWriteParams): Promise<GatedReadResult> {
  const { record, wraps, wrapPrivateKey } = params;
  if (record.recordType !== 'W') return cannotRead('not-a-write');
  if (record.commitment === null) return parseWritePlaintext(record.payloadBytes, false);

  const commitment = Uint8Array.from(record.commitment);
  const payload = Uint8Array.from(record.payloadBytes);
  let failure: GatedReadRefusal = 'no-wrap-opens';
  for (const known of wraps) {
    if (!isP256PublicKey(known.publicKey)) continue;
    let epochKey: Uint8Array;
    try {
      epochKey = await unwrapEpochKey(known.wrap, wrapPrivateKey, known.commitment);
    } catch (error) {
      if (error instanceof EpochCryptoError && error.refusal === 'commitment-mismatch' && failure === 'no-wrap-opens') {
        failure = 'commitment-mismatch';
      }
      continue;
    }
    try {
      if (!equalBytes(known.commitment, commitment)) {
        if (failure === 'no-wrap-opens') failure = 'commitment-mismatch';
        continue;
      }
      let plaintext: Uint8Array;
      try {
        plaintext = await decryptPayload({ payload, epochKey, commitment, recordType: 'W' });
      } catch {
        failure = 'tag-failed';
        continue;
      }
      return parseWritePlaintext(plaintext, true);
    } finally {
      epochKey.fill(0);
    }
  }
  return cannotRead(failure);
}


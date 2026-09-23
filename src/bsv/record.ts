// src/bsv/record.ts — OP_RETURN record encoding for the 'nftgate' protocol (phase 1, plaintext).
//
// Script layout: OP_FALSE OP_RETURN <push 'nftgate'> <push version> <push payload>.
// The version is written as an explicit one-byte DATA push (bytes `01 01` for version 1),
// never through a "minimal push" number helper, which would emit OP_1 (0x51) for the
// value 1 instead of a length-prefixed push. Phase 2 versions (0x02+) must keep using
// this same explicit-push approach so the prefix bytes stay stable for tag-scanning code.

import { LockingScript, OP, Script, Transaction, Utils } from '@bsv/sdk';

export const PROTOCOL_ID: number[] = Utils.toArray('nftgate', 'utf8');
export const RECORD_VERSION_PLAINTEXT = 0x01;

const MAX_PAYLOAD_BYTES = 10 * 1024;

export interface RecordPayloadV1 {
  text: string;
  ts: string; // ISO timestamp, supplied by the caller — never read from the clock here
}

/** Encodes the version-1 plaintext payload (UTF-8 JSON) as bytes. */
export function encodeRecordPayloadV1(payload: RecordPayloadV1): number[] {
  return Utils.toArray(JSON.stringify(payload), 'utf8');
}

/**
 * Builds the record locking script: OP_FALSE OP_RETURN <'nftgate'> <version> <payload>,
 * three separate pushes. Throws if payloadBytes exceeds the sane size cap.
 */
export function encodeRecordScript(payloadBytes: number[]): LockingScript {
  if (payloadBytes.length > MAX_PAYLOAD_BYTES) {
    throw new Error(`Record payload is ${payloadBytes.length} bytes, over the ${MAX_PAYLOAD_BYTES}-byte cap`);
  }

  return new LockingScript()
    .writeOpCode(OP.OP_FALSE)
    .writeOpCode(OP.OP_RETURN)
    .writeBin(PROTOCOL_ID)
    .writeBin([RECORD_VERSION_PLAINTEXT])
    .writeBin(payloadBytes);
}

export interface DecodedRecordScript {
  version: number;
  payloadBytes: number[];
}

/**
 * Parses a standard pushdata sequence (literal-length, OP_PUSHDATA1/2/4) into its pushes.
 * Needed because the SDK's script parser treats everything after OP_RETURN as one opaque
 * data blob rather than continuing to split it into pushdata chunks (see Script.js's
 * parseChunks/serializeChunksToBytes, which special-case OP_RETURN this way) — so a script
 * read back from chain hex must be re-parsed by hand to recover the individual pushes.
 */
function parsePushDataSequence(bytes: number[]): number[][] | null {
  const pushes: number[][] = [];
  let i = 0;

  while (i < bytes.length) {
    const op = bytes[i];
    i += 1;

    let len: number;
    if (op < OP.OP_PUSHDATA1) {
      len = op;
    } else if (op === OP.OP_PUSHDATA1) {
      if (i + 1 > bytes.length) return null;
      len = bytes[i];
      i += 1;
    } else if (op === OP.OP_PUSHDATA2) {
      if (i + 2 > bytes.length) return null;
      len = bytes[i] | (bytes[i + 1] << 8);
      i += 2;
    } else if (op === OP.OP_PUSHDATA4) {
      if (i + 4 > bytes.length) return null;
      len = (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) >>> 0;
      i += 4;
    } else {
      return null; // not a push opcode
    }

    if (i + len > bytes.length) return null;
    pushes.push(bytes.slice(i, i + len));
    i += len;
  }

  return pushes;
}

/**
 * The pushes after OP_FALSE OP_RETURN, or null if the script does not start with those two
 * opcodes or any later chunk is not a push.
 */
function recordPushes(script: string | LockingScript): number[][] | null {
  const parsed = typeof script === 'string' ? Script.fromHex(script) : script;
  const chunks = parsed.chunks;
  if (chunks.length < 2) return null;
  if (chunks[0].op !== OP.OP_FALSE || chunks[1].op !== OP.OP_RETURN) return null;

  // Already-serialized scripts (chain hex) collapse to exactly 2 chunks, with the second
  // chunk's data holding every byte after OP_RETURN as one blob; scripts built in-memory
  // and never serialized keep each push as its own chunk. Handle both shapes.
  return chunks.length === 2
    ? chunks[1].data
      ? parsePushDataSequence(chunks[1].data)
      : null
    : chunks.slice(2).every((chunk) => chunk.data)
      ? chunks.slice(2).map((chunk) => chunk.data as number[])
      : null;
}

function isProtocolId(bytes: number[]): boolean {
  return bytes.length === PROTOCOL_ID.length && PROTOCOL_ID.every((byte, i) => bytes[i] === byte);
}

/**
 * Decodes a record script back to its version and payload bytes, or null if the script
 * isn't OP_FALSE OP_RETURN <'nftgate'> <one-byte version> <payload> — including any
 * output that isn't a record at all (a P2PKH output, a foreign OP_RETURN, ...).
 */
export function decodeRecordScript(script: string | LockingScript): DecodedRecordScript | null {
  const pushes = recordPushes(script);
  if (!pushes || pushes.length !== 3) return null;

  const [protocolBytes, versionBytes, payloadBytes] = pushes;
  if (!isProtocolId(protocolBytes)) return null;
  if (versionBytes.length !== 1) return null;

  return { version: versionBytes[0], payloadBytes };
}

/** Format 0x02 (spec §3.8): the typed records the License contract reads (mw-5wuz6.3). */
export const RECORD_VERSION_TYPED = 0x02;

/** The record types the contract-locked builders write: mint, write, transfer. */
export type TypedRecordType = 'M' | 'W' | 'TR';

const TYPED_RECORD_TYPES: readonly TypedRecordType[] = ['M', 'W', 'TR'];

export interface DecodedTypedRecordScript {
  version: number;
  recordType: TypedRecordType;
  payloadBytes: number[];
}

/**
 * Builds a format-0x02 Data output: OP_FALSE OP_RETURN <'nftgate'> <0x02> <record type>
 * <payload>. The License contract reads bytes 0-10 as the fixed prefix and the record type
 * as a push of its ASCII name from byte 12 (`01 57` for W, `02 54 52` for TR; see
 * src/bsv/contracts/NOTES.md), which is what writeBin emits here. §3.8 fields 3-5 (epoch
 * commitment, value manifest, typed payload) are not built yet: the payload is one opaque
 * push, and carries no license origin (R4.3.4).
 */
export function encodeTypedRecordScript(recordType: TypedRecordType, payloadBytes: number[]): LockingScript {
  if (payloadBytes.length > MAX_PAYLOAD_BYTES) {
    throw new Error(`Record payload is ${payloadBytes.length} bytes, over the ${MAX_PAYLOAD_BYTES}-byte cap`);
  }

  return new LockingScript()
    .writeOpCode(OP.OP_FALSE)
    .writeOpCode(OP.OP_RETURN)
    .writeBin(PROTOCOL_ID)
    .writeBin([RECORD_VERSION_TYPED])
    .writeBin(Utils.toArray(recordType, 'utf8'))
    .writeBin(payloadBytes);
}

/** Decodes a format-0x02 Data output of a known record type, or null for anything else. */
export function decodeTypedRecordScript(script: string | LockingScript): DecodedTypedRecordScript | null {
  const pushes = recordPushes(script);
  if (!pushes || pushes.length !== 4) return null;

  const [protocolBytes, versionBytes, typeBytes, payloadBytes] = pushes;
  if (!isProtocolId(protocolBytes)) return null;
  if (versionBytes.length !== 1 || versionBytes[0] !== RECORD_VERSION_TYPED) return null;
  const recordType = TYPED_RECORD_TYPES.find((type) => type === Utils.toUTF8(typeBytes));
  if (!recordType) return null;

  return { version: versionBytes[0], recordType, payloadBytes };
}

export interface MintRecordPayload {
  kind: 'mint';
  collection: string;
  holder: string;
}

export interface TransferRecordPayload {
  kind: 'transfer';
  origin: string; // "txid:vout"
  to: string;
}

export interface WriteRecordPayload {
  kind: 'write';
  origin: string; // "txid:vout"
  text: string;
  ts: string; // ISO timestamp, supplied by the caller — never read from the clock here
}

export type DecodedRecordPayload =
  | RecordPayloadV1
  | MintRecordPayload
  | TransferRecordPayload
  | WriteRecordPayload
  | { unreadable: true }
  | { unsupportedVersion: number };

/**
 * Decodes payload bytes for a given record version. Version 0x01 is UTF-8 JSON, either
 * the phase-1 plain shape { text, ts } (no 'kind' field) or a typed { kind, ... } shape
 * (mint, transfer, write). Malformed or unexpectedly shaped JSON comes back as a typed
 * 'unreadable' result, never a thrown error, so the UI can always show something. Any
 * other version comes back as { unsupportedVersion } so phase 2 records are listed, not
 * dropped.
 */
export function decodeRecordPayload(version: number, bytes: number[]): DecodedRecordPayload {
  if (version !== RECORD_VERSION_PLAINTEXT) {
    return { unsupportedVersion: version };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(Utils.toUTF8(bytes)) as Record<string, unknown>;
  } catch {
    return { unreadable: true };
  }

  switch (parsed.kind) {
    case undefined:
      if (typeof parsed.text !== 'string' || typeof parsed.ts !== 'string') return { unreadable: true };
      return { text: parsed.text, ts: parsed.ts };
    case 'mint':
      if (typeof parsed.collection !== 'string' || typeof parsed.holder !== 'string') return { unreadable: true };
      return { kind: 'mint', collection: parsed.collection, holder: parsed.holder };
    case 'transfer':
      if (typeof parsed.origin !== 'string' || typeof parsed.to !== 'string') return { unreadable: true };
      return { kind: 'transfer', origin: parsed.origin, to: parsed.to };
    case 'write':
      if (typeof parsed.origin !== 'string' || typeof parsed.text !== 'string' || typeof parsed.ts !== 'string') {
        return { unreadable: true };
      }
      return { kind: 'write', origin: parsed.origin, text: parsed.text, ts: parsed.ts };
    default:
      return { unreadable: true };
  }
}

export interface RecordInTransaction extends DecodedRecordScript {
  vout: number;
}

/** Finds every nftgate record output in a transaction, each with its vout. */
export function findRecordsInTransaction(txHex: string): RecordInTransaction[] {
  const transaction = Transaction.fromHex(txHex);
  const records: RecordInTransaction[] = [];

  transaction.outputs.forEach((output, vout) => {
    const decoded = decodeRecordScript(output.lockingScript);
    if (decoded) records.push({ ...decoded, vout });
  });

  return records;
}

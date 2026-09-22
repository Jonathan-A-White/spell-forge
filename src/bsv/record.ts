// src/bsv/record.ts — OP_RETURN record encoding for the 'nftgate' protocol (phase 1, plaintext).
//
// Script layout: OP_FALSE OP_RETURN <push 'nftgate'> <push version> <push payload>.
// The version is written as an explicit one-byte DATA push (bytes `01 01` for version 1),
// never through a "minimal push" number helper, which would emit OP_1 (0x51) for the
// value 1 instead of a length-prefixed push. Phase 2 versions (0x02+) must keep using
// this same explicit-push approach so the prefix bytes stay stable for tag-scanning code.

import { LockingScript, OP, Utils } from '@bsv/sdk';

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

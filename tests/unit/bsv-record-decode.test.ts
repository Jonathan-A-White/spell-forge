import { describe, it, expect } from 'vitest';
import { LockingScript, OP, Utils } from '@bsv/sdk';
import {
  decodeRecordScript,
  decodeRecordPayload,
  findRecordsInTransaction,
  encodeRecordScript,
  encodeRecordPayloadV1,
  PROTOCOL_ID,
} from '../../src/bsv/record';
import goldenFixture from '../fixtures/bsv/record-script.json';
import txFixture from '../fixtures/bsv/record-transaction.json';
import kindsFixture from '../fixtures/bsv/record-kinds.json';

describe('decodeRecordScript', () => {
  it('round-trips with encodeRecordScript using the golden fixture', () => {
    const payloadBytes = encodeRecordPayloadV1(goldenFixture.payload);
    const script = encodeRecordScript(payloadBytes);

    const decoded = decodeRecordScript(script.toHex());

    expect(decoded).not.toBeNull();
    expect(decoded!.version).toBe(1);
    expect(decoded!.payloadBytes).toEqual(payloadBytes);
  });

  it('accepts a Script instance directly, not only hex', () => {
    const payloadBytes = encodeRecordPayloadV1(goldenFixture.payload);
    const script = encodeRecordScript(payloadBytes);

    const decoded = decodeRecordScript(script);

    expect(decoded).not.toBeNull();
    expect(decoded!.payloadBytes).toEqual(payloadBytes);
  });

  it('returns null when the first push is "nftgatX" rather than "nftgate"', () => {
    const script = new LockingScript()
      .writeOpCode(OP.OP_FALSE)
      .writeOpCode(OP.OP_RETURN)
      .writeBin(Utils.toArray('nftgatX', 'utf8'))
      .writeBin([0x01])
      .writeBin([0x01]);

    expect(decodeRecordScript(script)).toBeNull();
  });

  it('returns null when the script lacks OP_FALSE OP_RETURN', () => {
    const script = new LockingScript()
      .writeOpCode(OP.OP_DUP)
      .writeOpCode(OP.OP_HASH160)
      .writeBin(PROTOCOL_ID)
      .writeBin([0x01])
      .writeBin([0x01]);

    expect(decodeRecordScript(script)).toBeNull();
  });

  it('returns null for a script that is push-only but too short to be a record', () => {
    const script = new LockingScript().writeOpCode(OP.OP_FALSE).writeOpCode(OP.OP_RETURN).writeBin(PROTOCOL_ID);

    expect(decodeRecordScript(script)).toBeNull();
  });
});

describe('decodeRecordPayload', () => {
  it('parses a version 0x01 JSON payload into text and ts', () => {
    const payload = { text: 'hi', ts: '2026-01-01T00:00:00.000Z' };
    const bytes = encodeRecordPayloadV1(payload);

    expect(decodeRecordPayload(0x01, bytes)).toEqual(payload);
  });

  it('returns a typed unreadable result for malformed JSON, and never throws', () => {
    const bytes = Utils.toArray('not json{{{', 'utf8');

    expect(() => decodeRecordPayload(0x01, bytes)).not.toThrow();
    expect(decodeRecordPayload(0x01, bytes)).toEqual({ unreadable: true });
  });

  it('returns a typed unreadable result when the JSON is valid but missing text/ts', () => {
    const bytes = Utils.toArray(JSON.stringify({ foo: 'bar' }), 'utf8');

    expect(decodeRecordPayload(0x01, bytes)).toEqual({ unreadable: true });
  });

  it('returns unsupportedVersion for any version other than 0x01, so it can be listed not dropped', () => {
    const bytes = Utils.toArray('anything', 'utf8');

    expect(decodeRecordPayload(0x02, bytes)).toEqual({ unsupportedVersion: 2 });
  });

  it('decodes the golden mint fixture by its kind', () => {
    const decodedScript = decodeRecordScript(kindsFixture.mint.hex);
    expect(decodedScript).not.toBeNull();

    expect(decodeRecordPayload(decodedScript!.version, decodedScript!.payloadBytes)).toEqual(kindsFixture.mint.payload);
  });

  it('decodes the golden transfer fixture by its kind', () => {
    const decodedScript = decodeRecordScript(kindsFixture.transfer.hex);
    expect(decodedScript).not.toBeNull();

    expect(decodeRecordPayload(decodedScript!.version, decodedScript!.payloadBytes)).toEqual(kindsFixture.transfer.payload);
  });

  it('decodes the golden write fixture by its kind', () => {
    const decodedScript = decodeRecordScript(kindsFixture.write.hex);
    expect(decodedScript).not.toBeNull();

    expect(decodeRecordPayload(decodedScript!.version, decodedScript!.payloadBytes)).toEqual(kindsFixture.write.payload);
  });

  it('returns unreadable for a mint payload missing required fields', () => {
    const bytes = Utils.toArray(JSON.stringify({ kind: 'mint', collection: 'x' }), 'utf8');

    expect(decodeRecordPayload(0x01, bytes)).toEqual({ unreadable: true });
  });

  it('returns unreadable for an unknown kind', () => {
    const bytes = Utils.toArray(JSON.stringify({ kind: 'rotate', foo: 'bar' }), 'utf8');

    expect(decodeRecordPayload(0x01, bytes)).toEqual({ unreadable: true });
  });
});

describe('findRecordsInTransaction', () => {
  it('returns exactly the one nftgate output, with its vout, from a mix of outputs', () => {
    const records = findRecordsInTransaction(txFixture.mixedTxHex);

    expect(records).toHaveLength(1);
    expect(records[0].vout).toBe(txFixture.recordVout);
    expect(records[0].version).toBe(0x01);
    expect(decodeRecordPayload(records[0].version, records[0].payloadBytes)).toEqual(txFixture.payload);
  });

  it('returns an empty list when no output matches', () => {
    const records = findRecordsInTransaction(txFixture.noRecordTxHex);

    expect(records).toEqual([]);
  });
});

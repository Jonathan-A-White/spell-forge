// mw-yo97u.1: the format-0x02 Data output carries the §3.8 value-manifest field (field 4),
// empty, between the record type and the payload. Epoch commitment (field 3) does not exist
// in this codebase yet — that is a separate story — so the manifest sits directly after the
// record type for now. Step 2's already-broadcast tokens (no manifest push at all) must keep
// decoding: tests/fixtures/bsv/typed-record-legacy.json is a captured pre-manifest script.
import { describe, it, expect } from 'vitest';
import { Utils } from '@bsv/sdk';
import { decodeTypedRecordScript, encodeTypedRecordScript } from '../../src/bsv/record';
import legacyFixture from '../fixtures/bsv/typed-record-legacy.json';

describe('encodeTypedRecordScript / decodeTypedRecordScript — §3.8 value manifest', () => {
  it('writes protocol id, version, type, empty manifest, payload in that order', () => {
    const payloadBytes = Utils.toArray('payload', 'utf8'); // 7 bytes: a single-byte push length
    const script = encodeTypedRecordScript('W', payloadBytes);
    const hex = script.toHex();

    const prefix = '006a076e667467617465' + '0102'; // OP_FALSE OP_RETURN push7'nftgate' push1(version=0x02)
    const typePush = '0157'; // push1 'W'
    const manifestPush = '0100'; // push1: a single zero byte — the empty manifest (0 entries)
    const payloadPush = payloadBytes.length.toString(16).padStart(2, '0') + Buffer.from(payloadBytes).toString('hex');

    expect(hex).toBe(prefix + typePush + manifestPush + payloadPush);
  });

  it('decodes a freshly written record with manifest = []', () => {
    const payloadBytes = Utils.toArray(JSON.stringify({ kind: 'write', origin: 'bb'.repeat(32) + ':0', text: 'hello', ts: '2026-09-23T00:00:00.000Z' }), 'utf8');
    const script = encodeTypedRecordScript('W', payloadBytes);

    const decoded = decodeTypedRecordScript(script);

    expect(decoded).toMatchObject({ version: 2, recordType: 'W', manifest: [] });
    expect(decoded!.payloadBytes).toEqual(payloadBytes);
  });

  it('still decodes a step 2 (pre-manifest) record, with manifest = []', () => {
    const decoded = decodeTypedRecordScript(legacyFixture.hex);

    expect(decoded).toMatchObject({ version: 2, recordType: 'W', manifest: [] });
    expect(JSON.parse(Utils.toUTF8(decoded!.payloadBytes))).toEqual(legacyFixture.payload);
  });
});

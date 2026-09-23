// mw-yo97u.1: the format-0x02 Data output carries the §3.8 value-manifest field (field 4),
// empty, between the record type and the payload. Epoch commitment (field 3) does not exist
// in this codebase yet — that is a separate story — so the manifest sits directly after the
// record type for now. Step 2's already-broadcast tokens (no manifest push at all) must keep
// decoding: tests/fixtures/bsv/typed-record-legacy.json is a captured pre-manifest script.
// The write-order and fresh-decode assertions are covered by
// tests/features/bsv/record-manifest.feature instead.
import { describe, it, expect } from 'vitest';
import { Utils } from '@bsv/sdk';
import { decodeTypedRecordScript } from '../../src/bsv/record';
import legacyFixture from '../fixtures/bsv/typed-record-legacy.json';

describe('encodeTypedRecordScript / decodeTypedRecordScript — §3.8 value manifest', () => {
  it('still decodes a step 2 (pre-manifest) record, with manifest = []', () => {
    const decoded = decodeTypedRecordScript(legacyFixture.hex);

    expect(decoded).toMatchObject({ version: 2, recordType: 'W', manifest: [] });
    expect(JSON.parse(Utils.toUTF8(decoded!.payloadBytes))).toEqual(legacyFixture.payload);
  });
});

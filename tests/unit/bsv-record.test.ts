import { describe, it, expect } from 'vitest';
import { encodeRecordScript, encodeRecordPayloadV1, PROTOCOL_ID, RECORD_VERSION_PLAINTEXT } from '../../src/bsv/record';
import goldenFixture from '../fixtures/bsv/record-script.json';

describe('record encoding', () => {
  it('PROTOCOL_ID is the 7 ASCII bytes "nftgate"', () => {
    expect(PROTOCOL_ID).toEqual([0x6e, 0x66, 0x74, 0x67, 0x61, 0x74, 0x65]);
  });

  it('RECORD_VERSION_PLAINTEXT is 0x01', () => {
    expect(RECORD_VERSION_PLAINTEXT).toBe(0x01);
  });

  it("encodeRecordScript's hex equals the golden fixture", () => {
    const payloadBytes = encodeRecordPayloadV1(goldenFixture.payload);
    const script = encodeRecordScript(payloadBytes);

    expect(script.toHex()).toBe(goldenFixture.hex);
  });

  it('begins OP_FALSE OP_RETURN <push nftgate> <push 01 01>, not OP_1', () => {
    const payloadBytes = encodeRecordPayloadV1({ text: 'x', ts: '2026-01-01T00:00:00.000Z' });
    const script = encodeRecordScript(payloadBytes);

    expect(script.toHex().startsWith('006a076e667467617465' + '0101')).toBe(true);
  });

  it('refuses a payload over the 10 KB cap', () => {
    const oversized = new Array(10 * 1024 + 1).fill(0x61);

    expect(() => encodeRecordScript(oversized)).toThrow(/10.*KB|10240/i);
  });
});

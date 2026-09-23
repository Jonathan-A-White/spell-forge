import { describe, it, expect } from 'vitest';
import { LockingScript, OP, P2PKH, PrivateKey, Transaction, UnlockingScript, Utils } from '@bsv/sdk';
import {
  decodeRecordScript,
  decodeRecordPayload,
  findRecordsInTransaction,
  findUnreadableDataOutputs,
  classifyPlainPayment,
  encodeRecordScript,
  encodeRecordPayloadV1,
  PROTOCOL_ID,
} from '../../src/bsv/record';
import goldenFixture from '../fixtures/bsv/record-script.json';
import txFixture from '../fixtures/bsv/record-transaction.json';
import kindsFixture from '../fixtures/bsv/record-kinds.json';
import scanHistoryFixture from '../fixtures/bsv/scan-history.json';

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

function buildTxHex(
  outputs: { lockingScript: LockingScript; satoshis: number }[],
  unlockingScript: UnlockingScript = new UnlockingScript(),
): string {
  const tx = new Transaction();
  tx.addInput({
    sourceTXID: '11'.repeat(32),
    sourceOutputIndex: 0,
    unlockingScript,
    sequence: 0xffffffff,
  });
  for (const output of outputs) tx.addOutput(output);
  return tx.toHex();
}

describe('findUnreadableDataOutputs', () => {
  it('returns nothing for a transaction with no data output', () => {
    const address = PrivateKey.fromRandom().toAddress('testnet');
    const txHex = buildTxHex([{ lockingScript: new P2PKH().lock(address), satoshis: 1000 }]);

    expect(findUnreadableDataOutputs(txHex)).toEqual([]);
  });

  it('returns nothing when the data output is a valid nftgate record', () => {
    const payloadBytes = encodeRecordPayloadV1({ text: 'hi', ts: '2026-01-01T00:00:00.000Z' });
    const txHex = buildTxHex([{ lockingScript: encodeRecordScript(payloadBytes), satoshis: 0 }]);

    expect(findUnreadableDataOutputs(txHex)).toEqual([]);
  });

  it('flags a foreign OP_RETURN protocol as unreadable, with a reason', () => {
    const script = new LockingScript()
      .writeOpCode(OP.OP_FALSE)
      .writeOpCode(OP.OP_RETURN)
      .writeBin(Utils.toArray('otherprotocol', 'utf8'))
      .writeBin([0x01]);
    const txHex = buildTxHex([{ lockingScript: script, satoshis: 0 }]);

    const found = findUnreadableDataOutputs(txHex);

    expect(found).toHaveLength(1);
    expect(found[0].vout).toBe(0);
    expect(found[0].reason).toBe('not an nftgate record');
  });
});

describe('classifyPlainPayment', () => {
  it('returns null when the transaction does not touch the anchor at all', () => {
    const anchorAddress = PrivateKey.fromRandom().toAddress('testnet');
    const otherAddress = PrivateKey.fromRandom().toAddress('testnet');
    const txHex = buildTxHex([{ lockingScript: new P2PKH().lock(otherAddress), satoshis: 1000 }]);

    expect(classifyPlainPayment(txHex, anchorAddress)).toBeNull();
  });

  it('reports "received" with the satoshis paid to the anchor', () => {
    const anchorAddress = PrivateKey.fromRandom().toAddress('testnet');
    const changeAddress = PrivateKey.fromRandom().toAddress('testnet');
    const txHex = buildTxHex([
      { lockingScript: new P2PKH().lock(anchorAddress), satoshis: 5000 },
      { lockingScript: new P2PKH().lock(changeAddress), satoshis: 3000 },
    ]);

    expect(classifyPlainPayment(txHex, anchorAddress)).toEqual({ direction: 'received', satoshis: 5000 });
  });

  it('reports "sent" with the satoshis paid elsewhere when the anchor is the input side', () => {
    const anchorKey = PrivateKey.fromRandom();
    const anchorAddress = anchorKey.toAddress('testnet');
    const recipientAddress = PrivateKey.fromRandom().toAddress('testnet');
    const unlockingScript = new UnlockingScript().writeBin(new Array(71).fill(0)).writeBin(anchorKey.toPublicKey().toDER() as number[]);
    const txHex = buildTxHex([{ lockingScript: new P2PKH().lock(recipientAddress), satoshis: 4000 }], unlockingScript);

    expect(classifyPlainPayment(txHex, anchorAddress)).toEqual({ direction: 'sent', satoshis: 4000 });
  });

  it('reports "sent" with only the amount paid elsewhere when the anchor spends its own coin and gets change back', () => {
    const result = classifyPlainPayment(scanHistoryFixture.anchorSentTxHex, scanHistoryFixture.anchorSentAddress);

    expect(result).toEqual({ direction: 'sent', satoshis: scanHistoryFixture.anchorSentSatoshis });
  });

  it('still reports "received" for a payment from another key, not "sent"', () => {
    const result = classifyPlainPayment(scanHistoryFixture.plainPaymentTxHex, scanHistoryFixture.anchorAddress);

    expect(result).toEqual({ direction: 'received', satoshis: scanHistoryFixture.plainPaymentSatoshis });
  });
});

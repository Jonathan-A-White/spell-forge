// Gated records, offline (mw-jeswf.3): every new format-0x02 Data output carries §3.8 field 3,
// the epoch commitment c(e), between the record type and the manifest (6 pushes); the M record
// carries c(0) and a wrap of k(0) to the holder's P-256 wrap key; a W payload is encrypted
// under k(0) (docs/bsv-wire-formats.md §4); readGatedWrite gives the holder the text and any
// other key a 'cannot read' result. Legacy 4- and 5-push layouts still decode. No network:
// the fake chain of tests/fixtures/bsv/license-contract-chain.ts, the fixed wallet keys.
import { describe, it, expect, beforeAll } from 'vitest';
import { Script, Utils } from '@bsv/sdk';
import {
  buildContractMintTransaction,
  buildContractTokenRecordTransaction,
  buildContractTransferTransaction,
  verifyFuelInput,
  verifyLicenseInput,
} from '../../src/bsv/license-contract';
import type { BuiltContractTransaction } from '../../src/bsv/license-contract';
import {
  decodeTypedRecordScript,
  encodeTypedRecordScript,
  findTypedRecordsInTransaction,
  type DecodedTypedRecordScript,
} from '../../src/bsv/record';
import {
  decodeMintRecord,
  fetchTokenWraps,
  mintRecordWraps,
  readGatedWrite,
  type KnownWrap,
} from '../../src/bsv/gated-records';
import { COMMITMENT_BYTES, PAYLOAD_OVERHEAD_BYTES, WRAP_BYTES, encodeWritePlaintext, unwrapEpochKey } from '../../src/bsv/epoch-crypto';
import * as bsv from '../../src/bsv';
import legacyFixture from '../fixtures/bsv/typed-record-legacy.json';
import {
  config,
  encodeLegacyTypedRecordScript,
  fakeChain,
  MINT_FUEL,
  mintOwnersLicense,
  mintOwnersPreGatingLicense,
  utxoOf,
  wallet,
  wrapKeyOf,
} from '../fixtures/bsv/license-contract-chain';

const payload = { text: 'a secret for the holder only', ts: '2026-09-30T00:00:00.000Z' };
const VERIFIED = { success: true, error: '' };

let mint: BuiltContractTransaction;
let write: BuiltContractTransaction;
let wRecord: DecodedTypedRecordScript;
let wraps: KnownWrap[];
let holderWrapPrivateKey: Uint8Array;
let strangerWrapPrivateKey: Uint8Array;

function hex(bytes: Uint8Array | number[]): string {
  return Utils.toHex(Array.from(bytes));
}

function recordAt(built: BuiltContractTransaction, vout = 2): DecodedTypedRecordScript {
  const record = decodeTypedRecordScript(built.transaction.outputs[vout].lockingScript);
  if (!record) throw new Error(`output ${vout} is not a typed record`);
  return record;
}

/** How many pushes follow OP_FALSE OP_RETURN (00 6a) in a Data output script's hex. */
function pushCount(scriptHex: string): number {
  const bytes = Utils.toArray(scriptHex, 'hex');
  expect(bytes.slice(0, 2)).toEqual([0x00, 0x6a]);
  let count = 0;
  for (let i = 2; i < bytes.length; count++) {
    const op = bytes[i++];
    if (op < 0x4c) i += op;
    else if (op === 0x4c) i += 1 + bytes[i];
    else if (op === 0x4d) i += 2 + (bytes[i] | (bytes[i + 1] << 8));
    else throw new Error(`not a push: ${op}`);
  }
  return count;
}

beforeAll(async () => {
  holderWrapPrivateKey = (await wrapKeyOf(wallet.owner.wif)).privateKey;
  strangerWrapPrivateKey = (await wrapKeyOf(wallet.stranger.wif)).privateKey;
  mint = await mintOwnersLicense();
  write = await buildContractTokenRecordTransaction({
    holderKey: wallet.owner.wif,
    token: mint.token,
    payload,
    wrapPrivateKey: holderWrapPrivateKey,
    config,
    provider: fakeChain([mint.transaction]),
  });
  const found = findTypedRecordsInTransaction(write.hex).find((record) => record.recordType === 'W');
  if (!found) throw new Error('the write carries no W record');
  wRecord = found;
  wraps = await fetchTokenWraps(mint.token.origin, fakeChain([mint.transaction]));
});

describe('the gated M record', () => {
  it('is 6 pushes: protocol id, version 2, M, c(0), the empty manifest, the payload', () => {
    const scriptHex = mint.transaction.outputs[2].lockingScript.toHex();
    expect(pushCount(scriptHex)).toBe(6);
    const record = recordAt(mint);
    expect(record).toMatchObject({ version: 2, recordType: 'M', manifest: [] });
    expect(record.commitment).toHaveLength(COMMITMENT_BYTES);
  });

  it("carries today's collection and holder, the holder's 65-byte wrap public key and a 126-byte wrap of k(0) to it", async () => {
    const holderWrap = await wrapKeyOf(wallet.owner.wif);
    const decoded = decodeMintRecord(mint.hex);
    expect(decoded).not.toBeNull();
    expect(decoded!.collection).toBe(config.collectionId);
    expect(decoded!.holder).toBe(wallet.owner.address);
    expect(hex(decoded!.wrapKey!)).toBe(hex(holderWrap.publicKey));
    expect(decoded!.wrap).toHaveLength(WRAP_BYTES);
    expect(mintRecordWraps(decoded!)).toHaveLength(1);
    expect(wraps).toHaveLength(1);
  });

  it("refuses a mint with no holder wrap key: every License mint carries a wrap of k(0)", async () => {
    await expect(
      buildContractMintTransaction({
        issuerKey: wallet.owner.wif,
        utxos: [utxoOf(wallet.mintFundingTx)],
        holderPubKey: wallet.owner.pubKey,
        mintFuelSatoshis: MINT_FUEL,
        config,
        provider: fakeChain(),
      }),
    ).rejects.toThrow("the holder's wrap public key is required");
  });
});

describe('the gated W record', () => {
  it('is 6 pushes, with the M record’s c(0) in field 3', () => {
    expect(pushCount(write.transaction.outputs[2].lockingScript.toHex())).toBe(6);
    expect(wRecord).toMatchObject({ version: 2, recordType: 'W', manifest: [] });
    expect(hex(wRecord.commitment!)).toBe(hex(recordAt(mint).commitment!));
  });

  it('carries the payload encrypted: 0x01 ‖ nonce ‖ ciphertext ‖ tag, and no plaintext in the transaction', () => {
    const plaintext = encodeWritePlaintext(payload.text, payload.ts);
    expect(wRecord.payloadBytes[0]).toBe(0x01);
    expect(wRecord.payloadBytes).toHaveLength(PAYLOAD_OVERHEAD_BYTES + plaintext.length);
    expect(write.hex).not.toContain(hex(Utils.toArray(payload.text, 'utf8')));
  });

  it('passes verifyLicenseInput and verifyFuelInput on the 6-push write', async () => {
    expect(await verifyLicenseInput(write.transaction, 0)).toEqual(VERIFIED);
    expect(await verifyFuelInput(write.transaction, 1)).toEqual(VERIFIED);
  });

  it('AC-4.2.8-1: k(0) in hex appears in neither the mint’s nor the write’s transaction hex', async () => {
    const [known] = wraps;
    const epochKey = await unwrapEpochKey(known.wrap, holderWrapPrivateKey, known.commitment);
    expect(mint.hex).not.toContain(hex(epochKey));
    expect(write.hex).not.toContain(hex(epochKey));
  });

  it('applies the 10 KB payload cap to the ciphertext, 29 bytes longer than the plaintext', async () => {
    const overhead = encodeWritePlaintext('', payload.ts).length;
    const text = 'x'.repeat(10 * 1024 - overhead - 10); // plaintext 10,230 bytes: under the cap, its ciphertext over
    await expect(
      buildContractTokenRecordTransaction({
        holderKey: wallet.owner.wif,
        token: mint.token,
        payload: { text, ts: payload.ts },
        wrapPrivateKey: holderWrapPrivateKey,
        config,
        provider: fakeChain([mint.transaction]),
      }),
    ).rejects.toThrow(`Record payload is ${10 * 1024 - 10 + PAYLOAD_OVERHEAD_BYTES} bytes, over the 10240-byte cap`);
  });

  it('defaults the writer’s wrap key to the stand-in wrap key of its own WIF', async () => {
    const byDefault = await buildContractTokenRecordTransaction({
      holderKey: wallet.owner.wif,
      token: mint.token,
      payload,
      config,
      provider: fakeChain([mint.transaction]),
    });
    const record = findTypedRecordsInTransaction(byDefault.hex).find((found) => found.recordType === 'W')!;
    expect(await readGatedWrite({ record, wraps, wrapPrivateKey: holderWrapPrivateKey })).toMatchObject({ readable: true, text: payload.text });
  });

  it('refuses, readably, a writer whose wrap key cannot open the token’s wrap', async () => {
    await expect(
      buildContractTokenRecordTransaction({
        holderKey: wallet.owner.wif,
        token: mint.token,
        payload,
        wrapPrivateKey: strangerWrapPrivateKey,
        config,
        provider: fakeChain([mint.transaction]),
      }),
    ).rejects.toThrow("This wrap key cannot open the token's epoch key");
  });
});

describe('readGatedWrite', () => {
  it("opens the W with the holder's wrap key and returns the written text", async () => {
    expect(await readGatedWrite({ record: wRecord, wraps, wrapPrivateKey: holderWrapPrivateKey })).toEqual({
      readable: true,
      encrypted: true,
      text: payload.text,
      ts: payload.ts,
    });
  });

  it("gives a wrap key from another seed 'cannot read', never a throw", async () => {
    const result = await readGatedWrite({ record: wRecord, wraps, wrapPrivateKey: strangerWrapPrivateKey });
    expect(result.readable).toBe(false);
    if (result.readable) return;
    expect(result.reason).toBe('no-wrap-opens');
    expect(result.message).toMatch(/^cannot read: /);
  });

  it("gives one flipped ciphertext byte 'cannot read' (the tag)", async () => {
    const payloadBytes = [...wRecord.payloadBytes];
    payloadBytes[20] ^= 0x01;
    const result = await readGatedWrite({ record: { ...wRecord, payloadBytes }, wraps, wrapPrivateKey: holderWrapPrivateKey });
    expect(result).toMatchObject({ readable: false, reason: 'tag-failed' });
    if (!result.readable) expect(result.message).toMatch(/^cannot read: /);
  });

  it("gives a W declaring another commitment 'cannot read' (commitment mismatch)", async () => {
    const commitment = [...wRecord.commitment!];
    commitment[0] ^= 0x01;
    const result = await readGatedWrite({ record: { ...wRecord, commitment }, wraps, wrapPrivateKey: holderWrapPrivateKey });
    expect(result).toMatchObject({ readable: false, reason: 'commitment-mismatch' });
    if (!result.readable) expect(result.message).toMatch(/^cannot read: /);
  });

  it("gives a reader who knows no wraps 'cannot read'", async () => {
    const result = await readGatedWrite({ record: wRecord, wraps: [], wrapPrivateKey: holderWrapPrivateKey });
    expect(result).toMatchObject({ readable: false, reason: 'no-wrap-opens' });
  });

  it('reads a legacy (plaintext JSON) W as plaintext, with or without the wraps', async () => {
    const legacy = decodeTypedRecordScript(legacyFixture.hex)!;
    expect(await readGatedWrite({ record: legacy, wraps: [], wrapPrivateKey: strangerWrapPrivateKey })).toEqual({
      readable: true,
      encrypted: false,
      text: legacyFixture.payload.text,
      ts: legacyFixture.payload.ts,
    });
    const fivePush = decodeTypedRecordScript(encodeLegacyTypedRecordScript('W', Utils.toArray(JSON.stringify(payload), 'utf8'), 'manifest'))!;
    expect(await readGatedWrite({ record: fivePush, wraps, wrapPrivateKey: holderWrapPrivateKey })).toEqual({
      readable: true,
      encrypted: false,
      ...payload,
    });
  });

  it('is exported from src/bsv/index.ts with its helpers', () => {
    expect(bsv.readGatedWrite).toBe(readGatedWrite);
    expect(bsv.fetchTokenWraps).toBe(fetchTokenWraps);
    expect(typeof bsv.deriveStandInWrapKeyPair).toBe('function');
  });
});

describe('the gated TR record', () => {
  it('carries the current c(0) in field 3 and no wrap to the recipient', async () => {
    const transfer = await buildContractTransferTransaction({
      holderKey: wallet.owner.wif,
      token: write.token,
      toPubKey: wallet.buyer.pubKey,
      config,
      provider: fakeChain([mint.transaction, write.transaction]),
    });
    expect(pushCount(transfer.transaction.outputs[2].lockingScript.toHex())).toBe(6);
    const record = recordAt(transfer);
    expect(record.recordType).toBe('TR');
    expect(hex(record.commitment!)).toBe(hex(recordAt(mint).commitment!));
    expect(JSON.parse(Utils.toUTF8(record.payloadBytes))).toEqual({ to: wallet.buyer.address });
    expect(await verifyLicenseInput(transfer.transaction, 0)).toEqual(VERIFIED);
  });
});

describe('a License token minted before gated reading', () => {
  let preGating: BuiltContractTransaction;

  beforeAll(async () => {
    preGating = await mintOwnersPreGatingLicense();
  });

  it("is refused a write with 'minted before gated reading'", async () => {
    await expect(
      buildContractTokenRecordTransaction({
        holderKey: wallet.owner.wif,
        token: preGating.token,
        payload,
        wrapPrivateKey: holderWrapPrivateKey,
        config,
        provider: fakeChain([preGating.transaction]),
      }),
    ).rejects.toThrow('minted before gated reading');
  });

  it("is refused a transfer with 'minted before gated reading': its mint record has no c(0) to carry", async () => {
    await expect(
      buildContractTransferTransaction({
        holderKey: wallet.owner.wif,
        token: preGating.token,
        toPubKey: wallet.buyer.pubKey,
        config,
        provider: fakeChain([preGating.transaction]),
      }),
    ).rejects.toThrow('minted before gated reading');
  });
});

describe('decodeTypedRecordScript', () => {
  const payloadBytes = Utils.toArray(JSON.stringify(payload), 'utf8');
  const commitment = Array.from({ length: 32 }, (_, i) => 0xa0 + i);

  it('reads the 6-push form, with the commitment', () => {
    const script = encodeTypedRecordScript('W', commitment, payloadBytes);
    expect(decodeTypedRecordScript(script.toHex())).toEqual({ version: 2, recordType: 'W', commitment, manifest: [], payloadBytes });
    expect(decodeTypedRecordScript(script)).toEqual({ version: 2, recordType: 'W', commitment, manifest: [], payloadBytes });
  });

  it('reads the 5-push form (mw-yo97u.1) and the 4-push form (step 2), with no commitment', () => {
    for (const layout of ['manifest', 'no-manifest'] as const) {
      const script = encodeLegacyTypedRecordScript('W', payloadBytes, layout);
      expect(decodeTypedRecordScript(script.toHex())).toEqual({ version: 2, recordType: 'W', commitment: null, manifest: [], payloadBytes });
    }
  });

  it('still decodes tests/fixtures/bsv/typed-record-legacy.json', () => {
    const decoded = decodeTypedRecordScript(legacyFixture.hex);
    expect(decoded).toMatchObject({ version: 2, recordType: 'W', commitment: null, manifest: [] });
    expect(JSON.parse(Utils.toUTF8(decoded!.payloadBytes))).toEqual(legacyFixture.payload);
  });

  it('refuses to encode a commitment that is not 32 bytes', () => {
    expect(() => encodeTypedRecordScript('W', commitment.slice(1), payloadBytes)).toThrow('32 bytes');
  });

  it('reads a 6-push form whose field 3 is not 32 bytes as no record', () => {
    const script = encodeLegacyTypedRecordScript('W', payloadBytes, 'manifest');
    const sixWithShortField = Script.fromHex(script.toHex().replace('0157', '0157' + '02abcd'));
    expect(decodeTypedRecordScript(sixWithShortField.toHex())).toBeNull();
  });
});

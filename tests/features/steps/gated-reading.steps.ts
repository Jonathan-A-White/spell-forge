// tests/features/steps/gated-reading.steps.ts — Reusable step bodies for
// tests/features/bsv/gated-reading.feature, wired in tests/features/bsv/gated-reading.test.ts.
// Calls the same builders, fixtures and reader tests/unit/bsv-gated-records.test.ts uses.
import { expect } from 'vitest';
import { PrivateKey, Utils } from '@bsv/sdk';
import {
  buildContractMintTransaction,
  buildContractTokenRecordTransaction,
} from '../../../src/bsv/license-contract';
import type { BuiltContractTransaction } from '../../../src/bsv/license-contract';
import { findTypedRecordsInTransaction, type DecodedTypedRecordScript } from '../../../src/bsv/record';
import { fetchTokenWraps, readGatedWrite, type GatedReadResult, type KnownWrap } from '../../../src/bsv/gated-records';
import { EpochCryptoError } from '../../../src/bsv/epoch-crypto';
import {
  config,
  fakeChain,
  MINT_FUEL,
  mintOwnersLicense,
  utxoOf,
  wallet,
  wrapKeyOf,
} from '../../fixtures/bsv/license-contract-chain';

export interface GatedReadingContext {
  mint?: BuiltContractTransaction;
  write?: BuiltContractTransaction;
  text?: string;
  record?: DecodedTypedRecordScript;
  result?: GatedReadResult;
  secp256k1Keys?: Uint8Array[];
  refusals?: unknown[];
}

const TS = '2026-09-30T00:00:00.000Z';

function mintOf(ctx: GatedReadingContext): BuiltContractTransaction {
  if (!ctx.mint) throw new Error('no mint in this scenario');
  return ctx.mint;
}

async function tokenWraps(ctx: GatedReadingContext): Promise<KnownWrap[]> {
  return fetchTokenWraps(mintOf(ctx).token.origin, fakeChain([mintOf(ctx).transaction]));
}

export async function givenGatedMint(ctx: GatedReadingContext): Promise<void> {
  ctx.mint = await mintOwnersLicense();
}

export async function givenHolderWrites(ctx: GatedReadingContext, text: string): Promise<void> {
  const mint = mintOf(ctx);
  ctx.text = text;
  ctx.write = await buildContractTokenRecordTransaction({
    holderKey: wallet.owner.wif,
    token: mint.token,
    payload: { text, ts: TS },
    wrapPrivateKey: (await wrapKeyOf(wallet.owner.wif)).privateKey,
    config,
    provider: fakeChain([mint.transaction]),
  });
  ctx.record = findTypedRecordsInTransaction(ctx.write.hex).find((record) => record.recordType === 'W');
}

export async function whenOutsiderReads(ctx: GatedReadingContext): Promise<void> {
  ctx.result = await readGatedWrite({
    record: ctx.record as DecodedTypedRecordScript,
    wraps: await tokenWraps(ctx),
    wrapPrivateKey: (await wrapKeyOf(wallet.stranger.wif)).privateKey,
  });
}

export async function whenHolderReads(ctx: GatedReadingContext): Promise<void> {
  ctx.result = await readGatedWrite({
    record: ctx.record as DecodedTypedRecordScript,
    wraps: await tokenWraps(ctx),
    wrapPrivateKey: (await wrapKeyOf(wallet.owner.wif)).privateKey,
  });
}

export async function whenHolderReadsWithSecp256k1DeclaredWrap(ctx: GatedReadingContext): Promise<void> {
  const ownerKey = PrivateKey.fromWif(wallet.owner.wif).toPublicKey();
  const secp256k1Uncompressed = Uint8Array.from(ownerKey.encode(false) as number[]);
  const wraps = (await tokenWraps(ctx)).map((known) => ({ ...known, publicKey: secp256k1Uncompressed }));
  ctx.result = await readGatedWrite({
    record: ctx.record as DecodedTypedRecordScript,
    wraps,
    wrapPrivateKey: (await wrapKeyOf(wallet.owner.wif)).privateKey,
  });
}

export function thenCannotRead(ctx: GatedReadingContext): void {
  const result = ctx.result as GatedReadResult;
  expect(result.readable).toBe(false);
  if (!result.readable) expect(result.message.startsWith('cannot read')).toBe(true);
}

export function thenTextAbsentFromChain(ctx: GatedReadingContext): void {
  const textHex = Utils.toHex(Utils.toArray(ctx.text as string, 'utf8'));
  expect(mintOf(ctx).hex).not.toContain(textHex);
  expect((ctx.write as BuiltContractTransaction).hex).not.toContain(textHex);
}

export function thenGetsText(ctx: GatedReadingContext, text: string): void {
  expect(ctx.result).toEqual({ readable: true, encrypted: true, text, ts: TS });
}

export function givenSecp256k1Keys(ctx: GatedReadingContext): void {
  const ownerKey = PrivateKey.fromWif(wallet.owner.wif).toPublicKey();
  ctx.secp256k1Keys = [Uint8Array.from(ownerKey.encode(true) as number[]), Uint8Array.from(ownerKey.encode(false) as number[])];
}

export async function whenIssuerMintsWithEach(ctx: GatedReadingContext): Promise<void> {
  ctx.refusals = [];
  for (const holderWrapPubKey of ctx.secp256k1Keys as Uint8Array[]) {
    try {
      await buildContractMintTransaction({
        issuerKey: wallet.owner.wif,
        utxos: [utxoOf(wallet.mintFundingTx)],
        holderPubKey: wallet.owner.pubKey,
        holderWrapPubKey,
        mintFuelSatoshis: MINT_FUEL,
        config,
        provider: fakeChain(),
      });
      ctx.refusals.push(undefined);
    } catch (error) {
      ctx.refusals.push(error);
    }
  }
}

export function thenEachMintRefusedAsMalformed(ctx: GatedReadingContext, refusal: string): void {
  expect(ctx.refusals).toHaveLength(2);
  for (const error of ctx.refusals as unknown[]) {
    expect(error).toBeInstanceOf(EpochCryptoError);
    expect((error as EpochCryptoError).refusal).toBe(refusal);
    expect((error as EpochCryptoError).message).toMatch(/^malformed: /);
  }
}

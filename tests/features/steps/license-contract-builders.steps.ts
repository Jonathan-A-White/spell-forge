// tests/features/steps/license-contract-builders.steps.ts — Reusable step bodies for
// tests/features/bsv/license-contract-builders.feature, wired in
// tests/features/bsv/license-contract-builders.test.ts. Calls straight into the same builders
// and fixtures tests/unit/bsv-license-contract-{mint,write,transfer}.test.ts use.
import { expect } from 'vitest';
import { Hash, P2PKH, Transaction, Utils } from '@bsv/sdk';
import {
  buildContractTokenRecordTransaction,
  buildContractTransferTransaction,
  ContractVersionMismatchError,
  fuelLockingScript,
  readLicenseState,
  verifyFuelInput,
  verifyLicenseInput,
} from '../../../src/bsv/license-contract';
import type { BuiltContractTransaction } from '../../../src/bsv/license-contract';
import { decodeTypedRecordScript } from '../../../src/bsv/record';
import {
  config,
  fakeChain,
  MINT_FUEL,
  mintOwnersLicense,
  mintOwnersStandInLicense,
  utxoOf,
  wallet,
} from '../../fixtures/bsv/license-contract-chain';

const VERIFIED = { success: true, error: '' };
const payload = { text: 'hello covenant', ts: '2026-09-23T00:00:00.000Z' };

export interface LicenseBuilderContext {
  mint?: BuiltContractTransaction;
  standInMint?: BuiltContractTransaction;
  write?: BuiltContractTransaction;
  transfer?: BuiltContractTransaction;
  provider?: ReturnType<typeof fakeChain>;
}

export async function givenLicenseMintedWithFuel(ctx: LicenseBuilderContext): Promise<void> {
  ctx.mint = await mintOwnersLicense();
}

export async function whenWriteIsBuilt(ctx: LicenseBuilderContext): Promise<void> {
  const mint = ctx.mint as BuiltContractTransaction;
  ctx.write = await buildContractTokenRecordTransaction({
    holderKey: wallet.owner.wif,
    token: mint.token,
    feeUtxos: [utxoOf(wallet.writeFundingTx)],
    payload,
    config,
    provider: fakeChain([mint.transaction]),
  });
}

export async function whenTransferIsBuilt(ctx: LicenseBuilderContext): Promise<void> {
  const mint = ctx.mint as BuiltContractTransaction;
  ctx.transfer = await buildContractTransferTransaction({
    holderKey: wallet.owner.wif,
    token: mint.token,
    toPubKey: wallet.buyer.pubKey,
    config,
    provider: fakeChain([mint.transaction]),
  });
}

export async function whenArtifactMismatchWriteIsAttempted(ctx: LicenseBuilderContext): Promise<void> {
  const mint = ctx.mint as BuiltContractTransaction;
  ctx.standInMint = await mintOwnersStandInLicense();
  ctx.provider = fakeChain([mint.transaction, ctx.standInMint.transaction]);
}

export function thenOutput0IsTheLicense(ctx: LicenseBuilderContext): void {
  const { outputs } = (ctx.mint as BuiltContractTransaction).transaction;
  expect(outputs).toHaveLength(4);
  expect(outputs[0].satoshis).toBe(1);
}

export async function thenOutput1IsFuelAtMintFuel(ctx: LicenseBuilderContext): Promise<void> {
  const { outputs } = (ctx.mint as BuiltContractTransaction).transaction;
  const state = await readLicenseState(outputs[0].lockingScript.toHex());
  expect(state.ownerPubKeyHex).toBe(wallet.owner.pubKey);
  expect(state.collectionIdHex).toBe(Utils.toHex(Utils.toArray(config.collectionId, 'utf8')));

  const fuel = await fuelLockingScript(config);
  expect(outputs[1].lockingScript.toHex()).toBe(fuel.toHex());
  expect(outputs[1].satoshis).toBe(MINT_FUEL);
  expect(state.fuelScriptHashHex).toBe(Utils.toHex(Hash.hash256(outputs[1].lockingScript.toBinary())));
}

export function thenOutput2IsTypeMData(ctx: LicenseBuilderContext): void {
  const { outputs } = (ctx.mint as BuiltContractTransaction).transaction;
  expect(outputs[2].satoshis).toBe(0);
  const record = decodeTypedRecordScript(outputs[2].lockingScript);
  expect(record).toMatchObject({ version: 2, recordType: 'M', manifest: [] });
  expect(JSON.parse(Utils.toUTF8(record!.payloadBytes))).toEqual({
    collection: config.collectionId,
    holder: wallet.owner.address,
  });
}

export function thenOutput3IsIssuerChange(ctx: LicenseBuilderContext): void {
  const { outputs } = (ctx.mint as BuiltContractTransaction).transaction;
  expect(outputs[3].lockingScript.toHex()).toBe(new P2PKH().lock(wallet.owner.address).toHex());
  expect(outputs[3].satoshis).toBeGreaterThan(0);
}

export async function thenWriteBothVerify(ctx: LicenseBuilderContext): Promise<void> {
  const mint = ctx.mint as BuiltContractTransaction;
  const write = ctx.write as BuiltContractTransaction;
  expect(await verifyLicenseInput(write.transaction, 0)).toEqual(VERIFIED);
  expect(await verifyFuelInput(write.transaction, 1)).toEqual(VERIFIED);
  const fromHex = Transaction.fromHex(write.hex);
  fromHex.inputs[0].sourceTransaction = mint.transaction;
  fromHex.inputs[1].sourceTransaction = mint.transaction;
  expect(await verifyLicenseInput(fromHex, 0)).toEqual(VERIFIED);
  expect(await verifyFuelInput(fromHex, 1)).toEqual(VERIFIED);
}

export async function thenTransferBothVerify(ctx: LicenseBuilderContext): Promise<void> {
  const transfer = ctx.transfer as BuiltContractTransaction;
  expect(await verifyLicenseInput(transfer.transaction, 0)).toEqual(VERIFIED);
  expect(await verifyFuelInput(transfer.transaction, 1)).toEqual(VERIFIED);
}

export async function thenEachArtifactMismatchIsRefused(ctx: LicenseBuilderContext): Promise<void> {
  const mint = ctx.mint as BuiltContractTransaction;
  const standInMint = ctx.standInMint as BuiltContractTransaction;
  const provider = ctx.provider as ReturnType<typeof fakeChain>;
  for (const token of [
    { ...mint.token, artifact: '0'.repeat(32) },
    { ...standInMint.token, artifact: '0'.repeat(32) },
    { ...mint.token, fuelArtifact: '0'.repeat(32) },
  ]) {
    const attempt = buildContractTokenRecordTransaction({
      holderKey: wallet.owner.wif,
      token,
      feeUtxos: [utxoOf(wallet.writeFundingTx)],
      payload,
      config,
      provider,
    });
    await expect(attempt).rejects.toBeInstanceOf(ContractVersionMismatchError);
    await expect(attempt).rejects.toMatchObject({ name: 'ContractVersionMismatchError' });
    await expect(attempt).rejects.toThrow('This token was minted under an older contract version');
    expect(provider.getTransactionHex).not.toHaveBeenCalled();
  }
}

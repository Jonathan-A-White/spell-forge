// buildContractTransferTransaction (mw-5wuz6.3, mw-yo97u.3): spends a minted License at input
// 0 and recreates it to the buyer's owner key, a TR Data output at output 2 and any payment
// outputs after. A License + Fuel token spends its Fuel(C) at input 1, paying the fee from
// it, with payment inputs after; a step 2 token keeps the stand-in path (the seller's
// change at output 1); a token minted under another License artifact is refused. No network.
import { describe, it, expect, beforeAll } from 'vitest';
import { P2PKH, Transaction, Utils } from '@bsv/sdk';
import {
  buildContractTokenRecordTransaction,
  buildContractTransferTransaction,
  ContractVersionMismatchError,
  readLicenseState,
  verifyFuelInput,
  verifyLicenseInput,
} from '../../src/bsv/license-contract';
import type { BuiltContractTransaction } from '../../src/bsv/license-contract';
import { buildTransferTransaction, TokenLockMismatchError } from '../../src/bsv/license-token';
import type { LicenseToken } from '../../src/bsv/license-token';
import { decodeTypedRecordScript } from '../../src/bsv/record';
import {
  ARTIFACT_MD5,
  config,
  fakeChain,
  FEE_CAP,
  FUEL_ARTIFACT_MD5,
  MINT_FUEL,
  mintOwnersLicense,
  mintOwnersStandInLicense,
  utxoOf,
  wallet,
} from '../fixtures/bsv/license-contract-chain';

const VERIFIED = { success: true, error: '' };

let mint: BuiltContractTransaction;
let transfer: BuiltContractTransaction;
let standInMint: BuiltContractTransaction;
let standInTransfer: BuiltContractTransaction;

beforeAll(async () => {
  mint = await mintOwnersLicense();
  transfer = await buildContractTransferTransaction({
    holderKey: wallet.owner.wif,
    token: mint.token,
    toPubKey: wallet.buyer.pubKey,
    config,
    provider: fakeChain([mint.transaction]),
  });
  standInMint = await mintOwnersStandInLicense();
  standInTransfer = await buildContractTransferTransaction({
    holderKey: wallet.owner.wif,
    token: standInMint.token,
    feeUtxos: [utxoOf(wallet.transferFundingTx)],
    toPubKey: wallet.buyer.pubKey,
    config,
    provider: fakeChain([standInMint.transaction]),
  });
});

describe('buildContractTransferTransaction, a License + Fuel token', () => {
  it('spends the License at 0 and its Fuel at 1; outputs the License to the buyer’s key, Fuel(C), a TR Data output', async () => {
    const { inputs, outputs } = transfer.transaction;
    expect(inputs.map((input) => [input.sourceTXID, input.sourceOutputIndex])).toEqual([
      [mint.txid, 0],
      [mint.txid, 1],
    ]);
    expect(transfer.spentOutpoints).toEqual([mint.token.current, { txid: mint.txid, vout: 1 }]);

    expect(outputs).toHaveLength(3);
    expect(outputs[0].satoshis).toBe(1);
    const state = await readLicenseState(outputs[0].lockingScript.toHex());
    const minted = await readLicenseState(mint.transaction.outputs[0].lockingScript.toHex());
    expect(state).toEqual({ ...minted, ownerPubKeyHex: wallet.buyer.pubKey });

    expect(outputs[1].lockingScript.toHex()).toBe(mint.transaction.outputs[1].lockingScript.toHex());
    expect(outputs[1].satoshis).toBeGreaterThanOrEqual(MINT_FUEL - 2_000);
    expect(outputs[1].satoshis).toBeLessThan(MINT_FUEL);
    expect(MINT_FUEL - (outputs[1].satoshis ?? 0)).toBeLessThanOrEqual(FEE_CAP);

    expect(outputs[2].satoshis).toBe(0);
    const record = decodeTypedRecordScript(outputs[2].lockingScript);
    expect(record).toMatchObject({ version: 2, recordType: 'TR', manifest: [] });
    expect(JSON.parse(Utils.toUTF8(record!.payloadBytes))).toEqual({ to: wallet.buyer.address });
  });

  // Both covenants' local verify against the committed artifacts is covered by
  // tests/features/bsv/license-contract-builders.feature (AC-4.4.2-1).

  it('adds payment inputs after the Fuel and payment outputs after the Data output; the fee still comes from the Fuel', async () => {
    const withPayment = await buildContractTransferTransaction({
      holderKey: wallet.owner.wif,
      token: mint.token,
      feeUtxos: [utxoOf(wallet.transferFundingTx)],
      toPubKey: wallet.buyer.pubKey,
      payments: [{ address: wallet.stranger.address, satoshis: 700 }],
      config,
      provider: fakeChain([mint.transaction]),
    });
    const { inputs, outputs } = withPayment.transaction;
    expect(inputs.map((input) => [input.sourceTXID, input.sourceOutputIndex])).toEqual([
      [mint.txid, 0],
      [mint.txid, 1],
      [wallet.transferFundingTx.txid, 0],
    ]);
    expect(outputs).toHaveLength(5);
    expect(outputs[3].lockingScript.toHex()).toBe(new P2PKH().lock(wallet.stranger.address).toHex());
    expect(outputs[3].satoshis).toBe(700);
    // The payer's change: every satoshi of the payment input not paid out.
    expect(outputs[4].lockingScript.toHex()).toBe(new P2PKH().lock(wallet.owner.address).toHex());
    expect(outputs[4].satoshis).toBe(wallet.transferFundingTx.satoshis - 700);
    expect(outputs[1].satoshis).toBeGreaterThanOrEqual(MINT_FUEL - FEE_CAP);

    expect(await verifyLicenseInput(withPayment.transaction, 0)).toEqual(VERIFIED);
    expect(await verifyFuelInput(withPayment.transaction, 1)).toEqual(VERIFIED);
    expect(await verifyLicenseInput(withPayment.transaction, 2)).toEqual(VERIFIED); // the P2PKH payment input
  });

  it('moves the token record to the buyer: current at output 0, both artifacts kept', () => {
    expect(transfer.token).toEqual({
      ...mint.token,
      current: { txid: transfer.txid, vout: 0 },
      holderAddress: wallet.buyer.address,
      lock: 'license',
      artifact: ARTIFACT_MD5,
      fuelArtifact: FUEL_ARTIFACT_MD5,
    });
  });

  it('lets the buyer write next, fee from the same Fuel: Fuel(C) binds no key', async () => {
    const buyerWrite = await buildContractTokenRecordTransaction({
      holderKey: wallet.buyer.wif,
      token: transfer.token,
      payload: { text: 'mine now', ts: '2026-09-23T00:00:00.000Z' },
      config,
      provider: fakeChain([mint.transaction, transfer.transaction]),
    });
    expect(buyerWrite.transaction.inputs).toHaveLength(2);
    expect(await verifyLicenseInput(buyerWrite.transaction, 0)).toEqual(VERIFIED);
    expect(await verifyFuelInput(buyerWrite.transaction, 1)).toEqual(VERIFIED);
  });

  it('refuses a token minted under another License artifact with ContractVersionMismatchError, fetching nothing', async () => {
    const provider = fakeChain([mint.transaction]);
    const attempt = buildContractTransferTransaction({
      holderKey: wallet.owner.wif,
      token: { ...mint.token, artifact: '0'.repeat(32) },
      toPubKey: wallet.buyer.pubKey,
      config,
      provider,
    });
    await expect(attempt).rejects.toBeInstanceOf(ContractVersionMismatchError);
    await expect(attempt).rejects.toThrow('This token was minted under an older contract version');
    expect(provider.getTransactionHex).not.toHaveBeenCalled();
  });
});

describe('buildContractTransferTransaction, a step 2 token (the P2PKH stand-in, current artifact)', () => {
  it('keeps the stand-in path: a funding input at 1, the stand-in with the seller’s change at output 1, and verifies', async () => {
    const { inputs, outputs } = standInTransfer.transaction;
    expect(inputs).toHaveLength(2);
    expect(inputs[0].sourceTXID).toBe(standInMint.txid);
    expect(inputs[1].sourceTXID).toBe(wallet.transferFundingTx.txid);

    expect(outputs).toHaveLength(3);
    const state = await readLicenseState(outputs[0].lockingScript.toHex());
    const minted = await readLicenseState(standInMint.transaction.outputs[0].lockingScript.toHex());
    expect(state).toEqual({ ...minted, ownerPubKeyHex: wallet.buyer.pubKey });
    expect(outputs[1].lockingScript.toHex()).toBe(new P2PKH().lock(wallet.owner.address).toHex());
    expect(outputs[1].satoshis).toBeGreaterThan(0);
    expect(decodeTypedRecordScript(outputs[2].lockingScript)).toMatchObject({ version: 2, recordType: 'TR' });

    expect(await verifyLicenseInput(standInTransfer.transaction, 0)).toEqual(VERIFIED);
  });

  it('adds payment outputs after the Data output, and the License still verifies', async () => {
    const withPayment = await buildContractTransferTransaction({
      holderKey: wallet.owner.wif,
      token: standInMint.token,
      feeUtxos: [utxoOf(wallet.transferFundingTx)],
      toPubKey: wallet.buyer.pubKey,
      payments: [{ address: wallet.stranger.address, satoshis: 700 }],
      config,
      provider: fakeChain([standInMint.transaction]),
    });
    const { outputs } = withPayment.transaction;
    expect(outputs).toHaveLength(4);
    expect(outputs[3].lockingScript.toHex()).toBe(new P2PKH().lock(wallet.stranger.address).toHex());
    expect(outputs[3].satoshis).toBe(700);
    expect(await verifyLicenseInput(withPayment.transaction, 0)).toEqual(VERIFIED);
  });

  it('moves the token record to the buyer: current at output 0, lock license, the artifact md5', () => {
    expect(standInTransfer.token).toEqual({
      ...standInMint.token,
      current: { txid: standInTransfer.txid, vout: 0 },
      holderAddress: wallet.buyer.address,
      lock: 'license',
      artifact: ARTIFACT_MD5,
    });
  });

  it('refuses the buyer’s later write with a named error: the stand-in Fuel still binds the minter’s key', async () => {
    await expect(
      buildContractTokenRecordTransaction({
        holderKey: wallet.buyer.wif,
        token: standInTransfer.token,
        feeUtxos: [utxoOf(wallet.buyerFundingTx)],
        payload: { text: 'mine now', ts: '2026-09-23T00:00:00.000Z' },
        config,
        provider: fakeChain([standInMint.transaction, standInTransfer.transaction]),
      }),
    ).rejects.toThrow("This License's Fuel stand-in is not a P2PKH to this holder's key");
  });
});

describe('buildContractTransferTransaction refuses', () => {
  it('a P2PKH token with TokenLockMismatchError', async () => {
    const p2pkhToken: LicenseToken = { ...mint.token, lock: 'p2pkh', artifact: undefined };
    await expect(
      buildContractTransferTransaction({
        holderKey: wallet.owner.wif,
        token: p2pkhToken,
        feeUtxos: [utxoOf(wallet.transferFundingTx)],
        toPubKey: wallet.buyer.pubKey,
        config,
        provider: fakeChain([mint.transaction]),
      }),
    ).rejects.toBeInstanceOf(TokenLockMismatchError);
  });

  it('the P2PKH transfer builder refuses a License token the same way', async () => {
    await expect(
      buildTransferTransaction({
        holderKey: wallet.owner.wif,
        token: mint.token,
        feeUtxos: [utxoOf(wallet.transferFundingTx)],
        toAddress: wallet.buyer.address,
        config,
        provider: fakeChain([mint.transaction]),
      }),
    ).rejects.toMatchObject({ name: 'TokenLockMismatchError' });
  });

  it('a step 2 token minted under another License artifact, the same way', async () => {
    await expect(
      buildContractTransferTransaction({
        holderKey: wallet.owner.wif,
        token: { ...standInMint.token, artifact: '0'.repeat(32) },
        feeUtxos: [utxoOf(wallet.transferFundingTx)],
        toPubKey: wallet.buyer.pubKey,
        config,
        provider: fakeChain([standInMint.transaction]),
      }),
    ).rejects.toMatchObject({ name: 'ContractVersionMismatchError' });
  });
});

// Kept for the transfer's hex round trip: the broadcast hex alone verifies once its sources are attached.
describe('buildContractTransferTransaction, from the broadcast hex', () => {
  it('verifies both inputs', async () => {
    const fromHex = Transaction.fromHex(transfer.hex);
    fromHex.inputs[0].sourceTransaction = mint.transaction;
    fromHex.inputs[1].sourceTransaction = mint.transaction;
    expect(await verifyLicenseInput(fromHex, 0)).toEqual(VERIFIED);
    expect(await verifyFuelInput(fromHex, 1)).toEqual(VERIFIED);
  });
});

// buildContractTransferTransaction (mw-5wuz6.3): spends a minted License at input 0 and
// recreates it to the buyer's owner key, with the Fuel stand-in at output 1 (the seller's
// change), a TR Data output at output 2, and any payment outputs after. No network.
import { describe, it, expect, beforeAll } from 'vitest';
import { P2PKH, Utils } from '@bsv/sdk';
import {
  buildContractTokenRecordTransaction,
  buildContractTransferTransaction,
  readLicenseState,
  verifyLicenseInput,
} from '../../src/bsv/license-contract';
import type { BuiltContractTransaction } from '../../src/bsv/license-contract';
import { buildTransferTransaction, TokenLockMismatchError } from '../../src/bsv/license-token';
import type { LicenseToken } from '../../src/bsv/license-token';
import { decodeTypedRecordScript } from '../../src/bsv/record';
import { ARTIFACT_MD5, config, fakeChain, mintOwnersLicense, utxoOf, wallet } from '../fixtures/bsv/license-contract-chain';

let mint: BuiltContractTransaction;
let transfer: BuiltContractTransaction;

beforeAll(async () => {
  mint = await mintOwnersLicense();
  transfer = await buildContractTransferTransaction({
    holderKey: wallet.owner.wif,
    token: mint.token,
    feeUtxos: [utxoOf(wallet.transferFundingTx)],
    toPubKey: wallet.buyer.pubKey,
    config,
    provider: fakeChain([mint.transaction]),
  });
});

describe('buildContractTransferTransaction', () => {
  it('builds three outputs: the License to the buyer’s key, Fuel, a TR Data output naming the buyer', async () => {
    const { inputs, outputs } = transfer.transaction;
    expect(inputs).toHaveLength(2);
    expect(inputs[0].sourceTXID).toBe(mint.txid);
    expect(inputs[1].sourceTXID).toBe(wallet.transferFundingTx.txid);

    expect(outputs.length).toBeGreaterThanOrEqual(3);
    expect(outputs).toHaveLength(3);
    expect(outputs[0].satoshis).toBe(1);
    const state = await readLicenseState(outputs[0].lockingScript.toHex());
    const minted = await readLicenseState(mint.transaction.outputs[0].lockingScript.toHex());
    expect(state).toEqual({ ...minted, ownerPubKeyHex: wallet.buyer.pubKey });

    expect(outputs[1].lockingScript.toHex()).toBe(new P2PKH().lock(wallet.owner.address).toHex());
    expect(outputs[1].satoshis).toBeGreaterThan(0);

    expect(outputs[2].satoshis).toBe(0);
    const record = decodeTypedRecordScript(outputs[2].lockingScript);
    expect(record).toMatchObject({ version: 2, recordType: 'TR' });
    expect(JSON.parse(Utils.toUTF8(record!.payloadBytes))).toEqual({ to: wallet.buyer.address });

    expect(await verifyLicenseInput(transfer.transaction, 0)).toEqual({ success: true, error: '' });
  });

  it('adds payment outputs after the Data output, and the License still verifies', async () => {
    const withPayment = await buildContractTransferTransaction({
      holderKey: wallet.owner.wif,
      token: mint.token,
      feeUtxos: [utxoOf(wallet.transferFundingTx)],
      toPubKey: wallet.buyer.pubKey,
      payments: [{ address: wallet.stranger.address, satoshis: 700 }],
      config,
      provider: fakeChain([mint.transaction]),
    });
    const { outputs } = withPayment.transaction;
    expect(outputs).toHaveLength(4);
    expect(outputs[3].lockingScript.toHex()).toBe(new P2PKH().lock(wallet.stranger.address).toHex());
    expect(outputs[3].satoshis).toBe(700);
    expect(await verifyLicenseInput(withPayment.transaction, 0)).toEqual({ success: true, error: '' });
  });

  it('moves the token record to the buyer: current at output 0, lock license, the artifact md5', () => {
    expect(transfer.token).toEqual({
      ...mint.token,
      current: { txid: transfer.txid, vout: 0 },
      holderAddress: wallet.buyer.address,
      lock: 'license',
      artifact: ARTIFACT_MD5,
    });
  });

  it('refuses a P2PKH token with TokenLockMismatchError', async () => {
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

  it('refuses the buyer’s later write with a named error: the stand-in Fuel still binds the minter’s key', async () => {
    await expect(
      buildContractTokenRecordTransaction({
        holderKey: wallet.buyer.wif,
        token: transfer.token,
        feeUtxos: [utxoOf(wallet.buyerFundingTx)],
        payload: { text: 'mine now', ts: '2026-09-23T00:00:00.000Z' },
        config,
        provider: fakeChain([mint.transaction, transfer.transaction]),
      }),
    ).rejects.toThrow("This License's Fuel stand-in is not a P2PKH to this holder's key");
  });
});

// buildContractMintTransaction (mw-5wuz6.3): output 0 is the 1-sat License-locked token to
// the holder's owner key, output 1 the Fuel stand-in (a P2PKH to the same holder carrying
// the change, whose hash the License binds), output 2 a type-M Data output. No network.
import { describe, it, expect, beforeAll } from 'vitest';
import { Hash, P2PKH, Utils } from '@bsv/sdk';
import { buildContractMintTransaction, readLicenseState } from '../../src/bsv/license-contract';
import type { BuiltContractTransaction } from '../../src/bsv/license-contract';
import { decodeTypedRecordScript } from '../../src/bsv/record';
import { ARTIFACT_MD5, config, fakeChain, mintOwnersLicense, utxoOf, wallet } from '../fixtures/bsv/license-contract-chain';

let mint: BuiltContractTransaction;

beforeAll(async () => {
  mint = await mintOwnersLicense();
});

describe('buildContractMintTransaction', () => {
  it('builds exactly three outputs: the License token, the Fuel stand-in carrying the change, an M Data output', async () => {
    const { outputs } = mint.transaction;
    expect(outputs).toHaveLength(3);

    expect(outputs[0].satoshis).toBe(1);
    const state = await readLicenseState(outputs[0].lockingScript.toHex());
    expect(state.ownerPubKeyHex).toBe(wallet.owner.pubKey);
    expect(state.collectionIdHex).toBe(Utils.toHex(Utils.toArray(config.collectionId, 'utf8')));

    const standIn = new P2PKH().lock(wallet.owner.address);
    expect(outputs[1].lockingScript.toHex()).toBe(standIn.toHex());
    expect(outputs[1].satoshis).toBeGreaterThan(0);
    expect(state.fuelScriptHashHex).toBe(Utils.toHex(Hash.hash256(standIn.toBinary())));

    expect(outputs[2].satoshis).toBe(0);
    const record = decodeTypedRecordScript(outputs[2].lockingScript);
    expect(record).toMatchObject({ version: 2, recordType: 'M' });
    expect(JSON.parse(Utils.toUTF8(record!.payloadBytes))).toEqual({
      collection: config.collectionId,
      holder: wallet.owner.address,
    });
  });

  it('spends only the funding inputs, signed, and inputs total = outputs total + fee', () => {
    const { inputs, outputs } = mint.transaction;
    expect(inputs).toHaveLength(1);
    expect(inputs[0].sourceTXID).toBe(wallet.mintFundingTx.txid);
    expect(inputs[0].unlockingScript).toBeDefined();
    expect(mint.spentOutpoints).toEqual([{ txid: wallet.mintFundingTx.txid, vout: 0 }]);

    const outTotal = outputs.reduce((sum, output) => sum + (output.satoshis ?? 0), 0);
    const fee = wallet.mintFundingTx.satoshis - outTotal;
    expect(fee).toBeGreaterThan(0);
    expect(fee).toBe(Math.ceil((mint.hex.length / 2 / 1000) * config.feeRateSatPerKb));
  });

  it('never spends a 1-satoshi UTXO, so output 0 is a fresh origin', async () => {
    const built = await buildContractMintTransaction({
      issuerKey: wallet.owner.wif,
      utxos: [utxoOf(wallet.decoyOneSatTx), utxoOf(wallet.mintFundingTx)],
      holderPubKey: wallet.owner.pubKey,
      config,
      provider: fakeChain(),
    });
    expect(built.transaction.inputs.map((input) => input.sourceTXID)).toEqual([wallet.mintFundingTx.txid]);
  });

  it('returns the token record: origin and current at output 0, lock license, the artifact md5', () => {
    const origin = { txid: mint.txid, vout: 0 };
    expect(mint.token).toEqual({
      origin,
      current: origin,
      holderAddress: wallet.owner.address,
      collectionId: config.collectionId,
      lock: 'license',
      artifact: ARTIFACT_MD5,
    });
  });

  it('refuses an owner key that is not a public key', async () => {
    await expect(
      buildContractMintTransaction({
        issuerKey: wallet.owner.wif,
        utxos: [utxoOf(wallet.mintFundingTx)],
        holderPubKey: wallet.owner.address,
        config,
        provider: fakeChain(),
      }),
    ).rejects.toThrow('Invalid holder public key');
  });
});

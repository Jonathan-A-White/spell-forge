// buildContractTokenRecordTransaction (mw-5wuz6.3): spends a minted License at input 0 and
// recreates it to the same owner, with the Fuel stand-in at output 1 and a W Data output at
// output 2, funding inputs at 1 and later. The built write is verified locally against the
// committed artifact (scrypt-ts's interpreter; no compiler, no network).
import { describe, it, expect, beforeAll } from 'vitest';
import { P2PKH, Transaction, Utils } from '@bsv/sdk';
import {
  buildContractTokenRecordTransaction,
  readLicenseState,
  verifyLicenseInput,
} from '../../src/bsv/license-contract';
import type { BuiltContractTransaction } from '../../src/bsv/license-contract';
import { buildTokenRecordTransaction, TokenLockMismatchError } from '../../src/bsv/license-token';
import type { LicenseToken } from '../../src/bsv/license-token';
import { decodeTypedRecordScript } from '../../src/bsv/record';
import { ARTIFACT_MD5, config, fakeChain, mintOwnersLicense, utxoOf, wallet } from '../fixtures/bsv/license-contract-chain';

const payload = { text: 'hello covenant', ts: '2026-09-23T00:00:00.000Z' };

let mint: BuiltContractTransaction;
let write: BuiltContractTransaction;

async function buildWrite(token: LicenseToken, holderKey = wallet.owner.wif): Promise<BuiltContractTransaction> {
  return buildContractTokenRecordTransaction({
    holderKey,
    token,
    feeUtxos: [utxoOf(wallet.writeFundingTx)],
    payload,
    config,
    provider: fakeChain([mint.transaction]),
  });
}

beforeAll(async () => {
  mint = await mintOwnersLicense();
  write = await buildWrite(mint.token);
});

describe('buildContractTokenRecordTransaction', () => {
  it('spends the token at input 0 and a funding input at 1, with exactly three outputs: itself, Fuel, a W Data output', async () => {
    const { inputs, outputs } = write.transaction;
    expect(inputs).toHaveLength(2);
    expect(inputs[0].sourceTXID).toBe(mint.txid);
    expect(inputs[0].sourceOutputIndex).toBe(0);
    expect(inputs[1].sourceTXID).toBe(wallet.writeFundingTx.txid);
    expect(write.spentOutpoints).toEqual([mint.token.current, { txid: wallet.writeFundingTx.txid, vout: 0 }]);

    expect(outputs).toHaveLength(3);
    expect(outputs[0].satoshis).toBe(1);
    expect(outputs[0].lockingScript.toHex()).toBe(mint.transaction.outputs[0].lockingScript.toHex());
    expect((await readLicenseState(outputs[0].lockingScript.toHex())).ownerPubKeyHex).toBe(wallet.owner.pubKey);

    expect(outputs[1].lockingScript.toHex()).toBe(new P2PKH().lock(wallet.owner.address).toHex());
    expect(outputs[1].satoshis).toBeGreaterThan(0);

    expect(outputs[2].satoshis).toBe(0);
    const record = decodeTypedRecordScript(outputs[2].lockingScript);
    expect(record).toMatchObject({ version: 2, recordType: 'W' });
    expect(JSON.parse(Utils.toUTF8(record!.payloadBytes))).toEqual(payload);
  });

  it('passes the License contract’s local verify against the committed artifact', async () => {
    expect(await verifyLicenseInput(write.transaction, 0)).toEqual({ success: true, error: '' });
    // The same, from the broadcast hex alone.
    const fromHex = Transaction.fromHex(write.hex);
    fromHex.inputs[0].sourceTransaction = mint.transaction;
    expect(await verifyLicenseInput(fromHex, 0)).toEqual({ success: true, error: '' });
  });

  it('fails the local verify once an output is changed after signing', async () => {
    const tampered = Transaction.fromHex(write.hex);
    tampered.inputs[0].sourceTransaction = mint.transaction;
    tampered.outputs[1].satoshis = (tampered.outputs[1].satoshis ?? 0) - 1;
    const result = await verifyLicenseInput(tampered, 0);
    expect(result.success).toBe(false);
  });

  it('pays a fee that tracks the transaction size, the License unlocking script included', () => {
    const outTotal = write.transaction.outputs.reduce((sum, output) => sum + (output.satoshis ?? 0), 0);
    const fee = 1 + wallet.writeFundingTx.satoshis - outTotal;
    const size = write.hex.length / 2;
    // The ~4.3 KB License script is paid for twice: output 0, and input 0's preimage.
    expect(size).toBeGreaterThan(8_000);
    // The fee is paid on the estimated unlocking length, which may exceed the real one by a little.
    expect(fee).toBeGreaterThanOrEqual(Math.ceil((size / 1000) * config.feeRateSatPerKb));
    expect(fee).toBeLessThanOrEqual(Math.ceil(((size + 200) / 1000) * config.feeRateSatPerKb));
  });

  it('moves the token record to output 0, same holder, lock license, artifact unchanged', () => {
    expect(write.token).toEqual({
      ...mint.token,
      current: { txid: write.txid, vout: 0 },
      lock: 'license',
      artifact: ARTIFACT_MD5,
    });
  });

  it('refuses a P2PKH token with TokenLockMismatchError before touching the chain', async () => {
    const p2pkhToken: LicenseToken = { ...mint.token, lock: 'p2pkh', artifact: undefined };
    const provider = fakeChain([mint.transaction]);
    const attempt = buildContractTokenRecordTransaction({
      holderKey: wallet.owner.wif,
      token: p2pkhToken,
      feeUtxos: [utxoOf(wallet.writeFundingTx)],
      payload,
      config,
      provider,
    });
    await expect(attempt).rejects.toBeInstanceOf(TokenLockMismatchError);
    await expect(attempt).rejects.toMatchObject({
      name: 'TokenLockMismatchError',
      message: "This token is locked by 'p2pkh'; this builder spends 'license' tokens",
    });
    expect(provider.getTransactionHex).not.toHaveBeenCalled();
  });

  it('the P2PKH write builder refuses a License token the same way', async () => {
    await expect(
      buildTokenRecordTransaction({
        holderKey: wallet.owner.wif,
        token: mint.token,
        feeUtxos: [utxoOf(wallet.writeFundingTx)],
        payload,
        config,
        provider: fakeChain([mint.transaction]),
      }),
    ).rejects.toMatchObject({ name: 'TokenLockMismatchError' });
  });

  it('refuses a key that is not the License owner, naming it, instead of failing verification', async () => {
    await expect(buildWrite(mint.token, wallet.stranger.wif)).rejects.toThrow(
      `Key ${wallet.stranger.pubKey} is not this License's owner (${wallet.owner.pubKey})`,
    );
  });

  it('refuses a License whose artifact differs from the one this build carries', async () => {
    await expect(buildWrite({ ...mint.token, artifact: '0'.repeat(32) })).rejects.toThrow(
      `This token was locked by License artifact ${'0'.repeat(32)}; this build carries ${ARTIFACT_MD5}`,
    );
  });
});

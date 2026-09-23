// buildContractTokenRecordTransaction (mw-5wuz6.3, mw-yo97u.3): spends a minted License at
// input 0 and recreates it to the same owner, with a W Data output at output 2. A License +
// Fuel token spends its Fuel(C) at input 1 and pays the fee from it (no holder coin); a step
// 2 token (fuelScriptHash of the P2PKH stand-in) keeps the stand-in path, funding inputs at 1
// and later; a token minted under another License artifact is refused. Every built write is
// verified locally against the committed artifacts (scrypt-ts's interpreter; no network).
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { P2PKH, Transaction, Utils } from '@bsv/sdk';
import {
  buildContractSpendVariant,
  buildContractTokenRecordTransaction,
  FuelFeeCapExceededError,
  readLicenseState,
  verifyFuelInput,
  verifyLicenseInput,
  writeWithContractToken,
} from '../../src/bsv/license-contract';
import type { BuiltContractTransaction, BuildContractSpendVariantParams } from '../../src/bsv/license-contract';
import { buildTokenRecordTransaction, TokenLockMismatchError } from '../../src/bsv/license-token';
import type { LicenseToken } from '../../src/bsv/license-token';
import { decodeTypedRecordScript } from '../../src/bsv/record';
import { createEventBus } from '../../src/contracts/events';
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

const payload = { text: 'hello covenant', ts: '2026-09-23T00:00:00.000Z' };
const VERIFIED = { success: true, error: '' };

let mint: BuiltContractTransaction;
let write: BuiltContractTransaction;
let standInMint: BuiltContractTransaction;
let standInWrite: BuiltContractTransaction;

async function buildWrite(
  token: LicenseToken,
  source: BuiltContractTransaction[],
  holderKey = wallet.owner.wif,
): Promise<BuiltContractTransaction> {
  return buildContractTokenRecordTransaction({
    holderKey,
    token,
    feeUtxos: [utxoOf(wallet.writeFundingTx)],
    payload,
    config,
    provider: fakeChain(source.map((built) => built.transaction)),
  });
}

function outputTotal(transaction: Transaction): number {
  return transaction.outputs.reduce((sum, output) => sum + (output.satoshis ?? 0), 0);
}

beforeAll(async () => {
  mint = await mintOwnersLicense();
  write = await buildWrite(mint.token, [mint]);
  standInMint = await mintOwnersStandInLicense();
  standInWrite = await buildWrite(standInMint.token, [standInMint]);
});

describe('buildContractTokenRecordTransaction, a License + Fuel token', () => {
  it('spends the License at input 0 and its Fuel at input 1, no holder coin; outputs exactly itself, Fuel(C), a W Data output', async () => {
    const { inputs, outputs } = write.transaction;
    expect(inputs).toHaveLength(2);
    expect(inputs[0].sourceTXID).toBe(mint.txid);
    expect(inputs[0].sourceOutputIndex).toBe(0);
    expect(inputs[1].sourceTXID).toBe(mint.txid);
    expect(inputs[1].sourceOutputIndex).toBe(1);
    expect(write.spentOutpoints).toEqual([mint.token.current, { txid: mint.txid, vout: 1 }]);

    expect(outputs).toHaveLength(3);
    expect(outputs[0].satoshis).toBe(1);
    expect(outputs[0].lockingScript.toHex()).toBe(mint.transaction.outputs[0].lockingScript.toHex());
    expect((await readLicenseState(outputs[0].lockingScript.toHex())).ownerPubKeyHex).toBe(wallet.owner.pubKey);

    expect(outputs[1].lockingScript.toHex()).toBe(mint.transaction.outputs[1].lockingScript.toHex());

    expect(outputs[2].satoshis).toBe(0);
    const record = decodeTypedRecordScript(outputs[2].lockingScript);
    expect(record).toMatchObject({ version: 2, recordType: 'W', manifest: [] });
    expect(JSON.parse(Utils.toUTF8(record!.payloadBytes))).toEqual(payload);
  });

  // Both covenants' local verify (License at input 0, Fuel at input 1, against the committed
  // artifacts) is covered by tests/features/bsv/license-contract-builders.feature (AC-4.3.1-1).

  it('pays the fee from the Fuel: output 1 = own − fee, the fee at least the configured rate and at most FEE_CAP', () => {
    const fuelOut = write.transaction.outputs[1].satoshis ?? 0;
    const fee = MINT_FUEL + 1 - outputTotal(write.transaction);
    expect(fee).toBe(MINT_FUEL - fuelOut);
    expect(fuelOut).toBeGreaterThanOrEqual(MINT_FUEL - 2_000);
    const size = write.hex.length / 2;
    expect(size).toBeGreaterThan(8_000);
    expect(fee).toBeGreaterThanOrEqual(Math.ceil((size / 1000) * config.feeRateSatPerKb));
    expect(fee).toBeLessThanOrEqual(Math.ceil(((size + 200) / 1000) * config.feeRateSatPerKb));
    expect(fee).toBeLessThanOrEqual(FEE_CAP);
  });

  it('chains: the next write spends the License and Fuel this write recreated, and both verify', async () => {
    const next = await buildWrite(write.token, [mint, write]);
    expect(next.transaction.inputs.map((input) => [input.sourceTXID, input.sourceOutputIndex])).toEqual([
      [write.txid, 0],
      [write.txid, 1],
    ]);
    expect(await verifyLicenseInput(next.transaction, 0)).toEqual(VERIFIED);
    expect(await verifyFuelInput(next.transaction, 1)).toEqual(VERIFIED);
  });

  it('fails early with FuelFeeCapExceededError when the estimated fee exceeds FEE_CAP', async () => {
    const attempt = buildContractTokenRecordTransaction({
      holderKey: wallet.owner.wif,
      token: mint.token,
      payload,
      config: { ...config, feeRateSatPerKb: 500 },
      provider: fakeChain([mint.transaction]),
    });
    await expect(attempt).rejects.toBeInstanceOf(FuelFeeCapExceededError);
    await expect(attempt).rejects.toThrow(/^This spend's estimated fee \d+ sat exceeds the Fuel's FEE_CAP of 2000 sat$/);
  });

  it('moves the token record to output 0, same holder, both artifacts unchanged', () => {
    expect(write.token).toEqual({
      ...mint.token,
      current: { txid: write.txid, vout: 0 },
      lock: 'license',
      artifact: ARTIFACT_MD5,
      fuelArtifact: FUEL_ARTIFACT_MD5,
    });
  });

  it('fails the local verify once an output is changed after signing', async () => {
    const tampered = Transaction.fromHex(write.hex);
    tampered.inputs[0].sourceTransaction = mint.transaction;
    tampered.inputs[1].sourceTransaction = mint.transaction;
    tampered.outputs[1].satoshis = (tampered.outputs[1].satoshis ?? 0) - 1;
    expect((await verifyLicenseInput(tampered, 0)).success).toBe(false);
    expect((await verifyFuelInput(tampered, 1)).success).toBe(false);
  });

  it('refuses a key that is not the License owner, naming it, instead of failing verification', async () => {
    await expect(buildWrite(mint.token, [mint], wallet.stranger.wif)).rejects.toThrow(
      `Key ${wallet.stranger.pubKey} is not this License's owner (${wallet.owner.pubKey})`,
    );
  });
});

describe('buildContractTokenRecordTransaction, a step 2 token (the P2PKH stand-in, current artifact)', () => {
  it('keeps the stand-in path: a funding input at 1, the stand-in carrying the change at output 1', async () => {
    const { inputs, outputs } = standInWrite.transaction;
    expect(inputs).toHaveLength(2);
    expect(inputs[0].sourceTXID).toBe(standInMint.txid);
    expect(inputs[1].sourceTXID).toBe(wallet.writeFundingTx.txid);
    expect(standInWrite.spentOutpoints).toEqual([standInMint.token.current, { txid: wallet.writeFundingTx.txid, vout: 0 }]);

    expect(outputs).toHaveLength(3);
    expect(outputs[0].lockingScript.toHex()).toBe(standInMint.transaction.outputs[0].lockingScript.toHex());
    expect(outputs[1].lockingScript.toHex()).toBe(new P2PKH().lock(wallet.owner.address).toHex());
    expect(outputs[1].satoshis).toBeGreaterThan(0);
    expect(decodeTypedRecordScript(outputs[2].lockingScript)).toMatchObject({ version: 2, recordType: 'W', manifest: [] });
  });

  it('passes the License contract’s local verify against the committed artifact', async () => {
    expect(await verifyLicenseInput(standInWrite.transaction, 0)).toEqual(VERIFIED);
    const fromHex = Transaction.fromHex(standInWrite.hex);
    fromHex.inputs[0].sourceTransaction = standInMint.transaction;
    expect(await verifyLicenseInput(fromHex, 0)).toEqual(VERIFIED);
  });

  it('pays a fee that tracks the transaction size, the License unlocking script included', () => {
    const fee = 1 + wallet.writeFundingTx.satoshis - outputTotal(standInWrite.transaction);
    const size = standInWrite.hex.length / 2;
    // The ~4.3 KB License script is paid for twice: output 0, and input 0's preimage.
    expect(size).toBeGreaterThan(8_000);
    // The fee is paid on the estimated unlocking length, which may exceed the real one by a little.
    expect(fee).toBeGreaterThanOrEqual(Math.ceil((size / 1000) * config.feeRateSatPerKb));
    expect(fee).toBeLessThanOrEqual(Math.ceil(((size + 200) / 1000) * config.feeRateSatPerKb));
  });

  it('moves the token record to output 0, same holder, lock license, artifact unchanged', () => {
    expect(standInWrite.token).toEqual({
      ...standInMint.token,
      current: { txid: standInWrite.txid, vout: 0 },
      lock: 'license',
      artifact: ARTIFACT_MD5,
    });
  });

  it('still refuses with no fee UTXOs: the stand-in path needs the holder’s coin', async () => {
    await expect(
      buildContractTokenRecordTransaction({
        holderKey: wallet.owner.wif,
        token: standInMint.token,
        payload,
        config,
        provider: fakeChain([standInMint.transaction]),
      }),
    ).rejects.toThrow('No fee UTXOs available — fund this wallet before writing a record');
  });
});

describe('buildContractTokenRecordTransaction refuses', () => {
  it('a P2PKH token with TokenLockMismatchError before touching the chain', async () => {
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

  // The artifact-version refusal (an old-artifact License, stand-in License, or Fuel, each
  // with ContractVersionMismatchError before touching the chain) is covered by
  // tests/features/bsv/license-contract-builders.feature (AC-4.3.1-1).
});

describe('buildContractSpendVariant, the Fuel negatives (not verified by the builder, so a caller can broadcast one)', () => {
  function variant(overrides: Partial<BuildContractSpendVariantParams>): Promise<BuiltContractTransaction> {
    return buildContractSpendVariant({
      holderKey: wallet.owner.wif,
      token: mint.token,
      feeUtxos: [utxoOf(wallet.writeFundingTx)],
      payload,
      config,
      provider: fakeChain([mint.transaction]),
      ...overrides,
    });
  }

  it('control: with no override the variant is the verifying write', async () => {
    const control = await variant({});
    expect(control.transaction.inputs).toHaveLength(2);
    expect(await verifyLicenseInput(control.transaction, 0)).toEqual(VERIFIED);
    expect(await verifyFuelInput(control.transaction, 1)).toEqual(VERIFIED);
  });

  it('output 1 under own − FEE_CAP: the Fuel fails, the License (which accepts any Fuel value) verifies', async () => {
    const built = await variant({ fuelOutputSatoshis: MINT_FUEL - FEE_CAP - 1 });
    expect(built.transaction.outputs[1].satoshis).toBe(MINT_FUEL - FEE_CAP - 1);
    // Fuel's `fuelValue >= own − FEE_CAP` assert.
    expect(await verifyFuelInput(built.transaction, 1)).toEqual({ success: false, error: 'SCRIPT_ERR_VERIFY' });
    expect(await verifyLicenseInput(built.transaction, 0)).toEqual(VERIFIED);
  });

  it('an ordinary outpoint at prevouts[0] (FB-1): input 0 is a P2PKH, not the License; the Fuel fails', async () => {
    const built = await variant({ ordinaryInput0: true });
    const { inputs } = built.transaction;
    expect(inputs.map((input) => [input.sourceTXID, input.sourceOutputIndex])).toEqual([
      [wallet.writeFundingTx.txid, 0],
      [mint.txid, 1],
    ]);
    // FB-1: prevouts[0] == (T, 0).
    expect(await verifyFuelInput(built.transaction, 1)).toEqual({ success: false, error: 'SCRIPT_ERR_EQUALVERIFY' });
  });

  it('output 1 carrying a different script: both the Fuel and the License fail', async () => {
    const stranger = new P2PKH().lock(wallet.stranger.address).toHex();
    const built = await variant({ fuelOutputScriptHex: stranger });
    expect(built.transaction.outputs[1].lockingScript.toHex()).toBe(stranger);
    // Fuel's last assert (hashOutputs is its own script at fuelValue) leaves false on the stack.
    expect(await verifyFuelInput(built.transaction, 1)).toEqual({ success: false, error: 'SCRIPT_ERR_EVAL_FALSE_IN_STACK' });
    // The License's rule (f): hash256(output 1's script) == fuelScriptHash.
    expect(await verifyLicenseInput(built.transaction, 0)).toEqual({ success: false, error: 'SCRIPT_ERR_EQUALVERIFY' });
  });

  it('the Fuel at input 2, a funding input at 1: the Fuel fails, the License verifies', async () => {
    const built = await variant({ fuelInputIndex: 2 });
    const { inputs } = built.transaction;
    expect(inputs.map((input) => [input.sourceTXID, input.sourceOutputIndex])).toEqual([
      [mint.txid, 0],
      [wallet.writeFundingTx.txid, 0],
      [mint.txid, 1],
    ]);
    // "the Fuel is input 1": prevouts[1] == its own outpoint.
    expect(await verifyFuelInput(built.transaction, 2)).toEqual({ success: false, error: 'SCRIPT_ERR_EQUALVERIFY' });
    expect(await verifyLicenseInput(built.transaction, 0)).toEqual(VERIFIED);
  });

  it('refuses a Fuel override on a step 2 token, which has no Fuel', async () => {
    await expect(
      buildContractSpendVariant({
        holderKey: wallet.owner.wif,
        token: standInMint.token,
        feeUtxos: [utxoOf(wallet.writeFundingTx)],
        payload,
        fuelInputIndex: 2,
        config,
        provider: fakeChain([standInMint.transaction]),
      }),
    ).rejects.toThrow('The Fuel overrides need a License + Fuel token; this is a step 2 token (the P2PKH stand-in)');
  });
});

describe('writeWithContractToken, a License + Fuel token', () => {
  it('fetches no holder UTXOs, broadcasts the Fuel-paid write, records the License and Fuel as a pending spend', async () => {
    const provider = fakeChain([mint.transaction]);
    vi.mocked(provider.broadcast).mockImplementation(async (hex: string) => Transaction.fromHex(hex).id('hex'));
    const pendingSpendRepo = { getAll: vi.fn().mockResolvedValue([]), add: vi.fn(), removeMany: vi.fn() };
    const repository = { updateCurrent: vi.fn() };

    const { txid } = await writeWithContractToken({
      holderKey: wallet.owner.wif,
      token: mint.token,
      payload,
      provider,
      config,
      eventBus: createEventBus(),
      repository,
      pendingSpendRepo,
    });

    expect(provider.getUtxos).not.toHaveBeenCalled();
    expect(provider.getTransactionHex).toHaveBeenCalledTimes(1);
    expect(txid).toBe(write.txid);
    expect(pendingSpendRepo.add).toHaveBeenCalledWith(
      expect.objectContaining({ txid, outpoints: [`${mint.txid}:0`, `${mint.txid}:1`] }),
    );
    expect(repository.updateCurrent).toHaveBeenCalledWith(mint.token.origin, { txid, vout: 0 }, wallet.owner.address);
  });

  it('a step 2 token still fetches the holder’s fee UTXOs', async () => {
    const provider = fakeChain([standInMint.transaction]);
    vi.mocked(provider.getUtxos).mockResolvedValue([utxoOf(wallet.writeFundingTx)]);
    vi.mocked(provider.broadcast).mockImplementation(async (hex: string) => Transaction.fromHex(hex).id('hex'));
    const { txid } = await writeWithContractToken({
      holderKey: wallet.owner.wif,
      token: standInMint.token,
      payload,
      provider,
      config,
      eventBus: createEventBus(),
      repository: { updateCurrent: vi.fn() },
      pendingSpendRepo: { getAll: vi.fn().mockResolvedValue([]), add: vi.fn(), removeMany: vi.fn() },
    });
    expect(provider.getUtxos).toHaveBeenCalledWith(wallet.owner.address);
    expect(txid).toBe(standInWrite.txid);
  });
});

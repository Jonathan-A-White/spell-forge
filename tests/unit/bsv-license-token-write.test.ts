import { describe, it, expect, vi } from 'vitest';
import { P2PKH, Spend, Transaction, Utils } from '@bsv/sdk';
import { buildTokenRecordTransaction, writeWithToken } from '../../src/bsv/license-token';
import type { LicenseToken, TokenRepository } from '../../src/bsv/license-token';
import { decodeRecordScript } from '../../src/bsv/record';
import { createEventBus } from '../../src/contracts/events';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { ChainConfig } from '../../src/bsv/config';
import type { Utxo } from '../../src/contracts/types';
import wallet from '../fixtures/bsv/license-token-transfer-wallet.json';

const baseConfig: ChainConfig = {
  network: 'testnet',
  providerBaseUrl: 'https://api.whatsonchain.com/v1/bsv/test',
  anchorAddress: wallet.toAddress,
  feeRateSatPerKb: 1,
  collectionId: 'spellforge-leaderboard-testnet',
};

const currentUtxo: Utxo = { txid: wallet.currentTx.txid, vout: wallet.currentTx.vout, satoshis: wallet.currentTx.satoshis };
const fundingUtxo: Utxo = { txid: wallet.fundingTx.txid, vout: wallet.fundingTx.vout, satoshis: wallet.fundingTx.satoshis };
const decoyOneSatUtxo: Utxo = { txid: wallet.decoyOneSatTx.txid, vout: wallet.decoyOneSatTx.vout, satoshis: wallet.decoyOneSatTx.satoshis };

const token: LicenseToken = {
  origin: { txid: wallet.originTx.txid, vout: wallet.originTx.vout },
  current: { txid: wallet.currentTx.txid, vout: wallet.currentTx.vout },
  holderAddress: wallet.holderAddress,
  collectionId: baseConfig.collectionId,
};

const payload = { text: 'hello chain', ts: '2026-03-01T00:00:00.000Z' };

function fakeProvider(overrides: Partial<ChainProvider> = {}): ChainProvider {
  return {
    getUtxos: vi.fn().mockResolvedValue([currentUtxo, fundingUtxo]),
    getTransactionHex: vi.fn((txid: string) => {
      if (txid === wallet.currentTx.txid) return Promise.resolve(wallet.currentTx.hex);
      if (txid === wallet.fundingTx.txid) return Promise.resolve(wallet.fundingTx.hex);
      if (txid === wallet.decoyOneSatTx.txid) return Promise.resolve(wallet.decoyOneSatTx.hex);
      return Promise.reject(new Error(`unexpected txid ${txid}`));
    }),
    broadcast: vi.fn().mockResolvedValue('e'.repeat(64)),
    getAddressHistory: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('buildTokenRecordTransaction', () => {
  it('spends token.current as input 0 and builds exactly three outputs: 1-sat back to the holder, change, write data', async () => {
    const provider = fakeProvider();

    const built = await buildTokenRecordTransaction({
      holderKey: wallet.holderWif,
      token,
      feeUtxos: [fundingUtxo],
      payload,
      config: baseConfig,
      provider,
    });

    expect(built.transaction.inputs).toHaveLength(2);
    expect(built.transaction.inputs[0].sourceTXID).toBe(wallet.currentTx.txid);
    expect(built.transaction.inputs[0].sourceOutputIndex).toBe(wallet.currentTx.vout);

    expect(built.transaction.outputs).toHaveLength(3);

    expect(built.transaction.outputs[0].satoshis).toBe(1);
    expect(built.transaction.outputs[0].lockingScript.toHex()).toBe(new P2PKH().lock(wallet.holderAddress).toHex());

    expect(built.transaction.outputs[1].lockingScript.toHex()).toBe(new P2PKH().lock(wallet.holderAddress).toHex());
    expect(built.transaction.outputs[1].satoshis).toBeGreaterThan(0);

    const decoded = decodeRecordScript(built.transaction.outputs[2].lockingScript);
    expect(decoded).not.toBeNull();
    expect(built.transaction.outputs[2].satoshis).toBe(0);
    const decodedPayload = JSON.parse(Utils.toUTF8(decoded!.payloadBytes));
    expect(decodedPayload).toEqual({
      kind: 'write',
      origin: `${token.origin.txid}:${token.origin.vout}`,
      text: payload.text,
      ts: payload.ts,
    });
  });

  it('never produces an output to the anchor address, even when ChainConfig.anchorAddress is set', async () => {
    const provider = fakeProvider();

    const built = await buildTokenRecordTransaction({
      holderKey: wallet.holderWif,
      token,
      feeUtxos: [fundingUtxo],
      payload,
      config: baseConfig,
      provider,
    });

    expect(baseConfig.anchorAddress).not.toBe('');
    const anchorScriptHex = new P2PKH().lock(baseConfig.anchorAddress).toHex();
    for (const output of built.transaction.outputs) {
      expect(output.lockingScript.toHex()).not.toBe(anchorScriptHex);
    }
  });

  it('never spends a 1-satoshi UTXO other than the token as a fee input', async () => {
    const provider = fakeProvider();

    const built = await buildTokenRecordTransaction({
      holderKey: wallet.holderWif,
      token,
      feeUtxos: [decoyOneSatUtxo, fundingUtxo],
      payload,
      config: baseConfig,
      provider,
    });

    expect(built.transaction.inputs).toHaveLength(2);
    expect(built.transaction.inputs[1].sourceTXID).toBe(wallet.fundingTx.txid);
  });

  it('inputs total = outputs total + fee, and fee tracks ceil(size/1000 * feeRateSatPerKb) and changes with the rate', async () => {
    const provider = fakeProvider();

    const built = await buildTokenRecordTransaction({
      holderKey: wallet.holderWif,
      token,
      feeUtxos: [fundingUtxo],
      payload,
      config: baseConfig,
      provider,
    });

    const inputsTotal = wallet.currentTx.satoshis + wallet.fundingTx.satoshis;
    const outputsTotal = built.transaction.outputs.reduce((sum, o) => sum + (o.satoshis ?? 0), 0);
    const fee = inputsTotal - outputsTotal;
    const sizeBytes = built.hex.length / 2;
    const expectedFee = Math.ceil((sizeBytes / 1000) * baseConfig.feeRateSatPerKb);

    expect(Math.abs(fee - expectedFee)).toBeLessThanOrEqual(1);

    const higherRateConfig: ChainConfig = { ...baseConfig, feeRateSatPerKb: 50 };
    const builtHigherFee = await buildTokenRecordTransaction({
      holderKey: wallet.holderWif,
      token,
      feeUtxos: [fundingUtxo],
      payload,
      config: higherRateConfig,
      provider: fakeProvider(),
    });
    const higherOutputsTotal = builtHigherFee.transaction.outputs.reduce((sum, o) => sum + (o.satoshis ?? 0), 0);
    const higherFee = inputsTotal - higherOutputsTotal;
    expect(higherFee).toBeGreaterThan(fee);
  });

  it('produces a hex that parses back and whose input signatures verify against their source outputs', async () => {
    const provider = fakeProvider();

    const built = await buildTokenRecordTransaction({
      holderKey: wallet.holderWif,
      token,
      feeUtxos: [fundingUtxo],
      payload,
      config: baseConfig,
      provider,
    });

    const parsed = Transaction.fromHex(built.hex);
    expect(parsed.id('hex')).toBe(built.txid);

    const sourceTxs = [wallet.currentTx, wallet.fundingTx];
    for (let inputIndex = 0; inputIndex < sourceTxs.length; inputIndex++) {
      const sourceTx = sourceTxs[inputIndex];
      const sourceOutput = Transaction.fromHex(sourceTx.hex).outputs[sourceTx.vout];
      const spend = new Spend({
        sourceTXID: sourceTx.txid,
        sourceOutputIndex: sourceTx.vout,
        sourceSatoshis: sourceOutput.satoshis!,
        lockingScript: sourceOutput.lockingScript,
        transactionVersion: parsed.version,
        otherInputs: [],
        allInputs: parsed.inputs,
        outputs: parsed.outputs,
        inputIndex,
        unlockingScript: parsed.inputs[inputIndex].unlockingScript!,
        inputSequence: parsed.inputs[inputIndex].sequence ?? 0xffffffff,
        lockTime: parsed.lockTime,
      });

      expect(spend.validateJavaScript()).toBe(true);
    }
  });

  it('refuses with a readable error and builds nothing when the payload is over the 10 KB cap', async () => {
    const provider = fakeProvider();

    await expect(
      buildTokenRecordTransaction({
        holderKey: wallet.holderWif,
        token,
        feeUtxos: [fundingUtxo],
        payload: { text: 'x'.repeat(11 * 1024), ts: payload.ts },
        config: baseConfig,
        provider,
      }),
    ).rejects.toThrow(/10.*KB|byte.*cap/i);
  });

  it('refuses with a readable error when there are no fee UTXOs', async () => {
    const provider = fakeProvider();

    await expect(
      buildTokenRecordTransaction({
        holderKey: wallet.holderWif,
        token,
        feeUtxos: [],
        payload,
        config: baseConfig,
        provider,
      }),
    ).rejects.toThrow(/no fee utxos/i);
  });

  it('refuses with a readable error when the token outpoint is not among the holder UTXOs (already spent)', async () => {
    const provider = fakeProvider({ getUtxos: vi.fn().mockResolvedValue([fundingUtxo]) });

    await expect(
      buildTokenRecordTransaction({
        holderKey: wallet.holderWif,
        token,
        feeUtxos: [fundingUtxo],
        payload,
        config: baseConfig,
        provider,
      }),
    ).rejects.toThrow(/token already spent or not confirmed here/i);
  });
});

describe('writeWithToken', () => {
  function fakeRepository(): TokenRepository & { updateCurrent: ReturnType<typeof vi.fn> } {
    return { updateCurrent: vi.fn().mockResolvedValue(undefined) };
  }

  it('broadcasts once, updates the repository to the same holder, and emits bsv:record-written with the txid', async () => {
    const provider = fakeProvider();
    const repository = fakeRepository();
    const eventBus = createEventBus();
    const received: { txid: string; origin?: string }[] = [];
    eventBus.on('bsv:record-written', (event) => {
      if (event.type === 'bsv:record-written') received.push(event.payload);
    });

    const result = await writeWithToken({
      holderKey: wallet.holderWif,
      token,
      payload,
      provider,
      config: baseConfig,
      eventBus,
      repository,
    });

    expect(provider.broadcast).toHaveBeenCalledTimes(1);
    expect(result.txid).toBe('e'.repeat(64));
    expect(repository.updateCurrent).toHaveBeenCalledTimes(1);
    expect(repository.updateCurrent).toHaveBeenCalledWith(
      token.origin,
      { txid: 'e'.repeat(64), vout: 0 },
      token.holderAddress,
    );
    expect(received).toEqual([
      { txid: 'e'.repeat(64), origin: `${token.origin.txid}:${token.origin.vout}` },
    ]);
  });

  it('never broadcasts when the token is already spent', async () => {
    const provider = fakeProvider({ getUtxos: vi.fn().mockResolvedValue([fundingUtxo]) });
    const repository = fakeRepository();
    const eventBus = createEventBus();

    await expect(
      writeWithToken({
        holderKey: wallet.holderWif,
        token,
        payload,
        provider,
        config: baseConfig,
        eventBus,
        repository,
      }),
    ).rejects.toThrow(/token already spent or not confirmed here/i);

    expect(provider.broadcast).not.toHaveBeenCalled();
    expect(repository.updateCurrent).not.toHaveBeenCalled();
  });
});

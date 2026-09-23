import { describe, it, expect, vi } from 'vitest';
import { P2PKH, Spend, Transaction, Utils } from '@bsv/sdk';
import { buildTransferTransaction, transferLicenseToken } from '../../src/bsv/license-token';
import type { LicenseToken, TokenRepository } from '../../src/bsv/license-token';
import { decodeRecordScript } from '../../src/bsv/record';
import { createEventBus } from '../../src/contracts/events';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { ChainConfig } from '../../src/bsv/config';
import type { Utxo } from '../../src/contracts/types';
import type { PendingSpendEntry } from '../../src/bsv/pending-spends';
import wallet from '../fixtures/bsv/license-token-transfer-wallet.json';

function fakePendingSpendRepo(overrides: {
  getAll?: () => Promise<PendingSpendEntry[]>;
  add?: (entry: PendingSpendEntry) => Promise<void>;
  removeMany?: (txids: string[]) => Promise<void>;
} = {}) {
  return {
    getAll: vi.fn(overrides.getAll ?? (async () => [])),
    add: vi.fn(overrides.add ?? (async () => {})),
    removeMany: vi.fn(overrides.removeMany ?? (async () => {})),
  };
}

const baseConfig: ChainConfig = {
  network: 'testnet',
  providerBaseUrl: 'https://api.whatsonchain.com/v1/bsv/test',
  anchorAddress: '',
  feeRateSatPerKb: 1,
  collectionId: 'spellforge-leaderboard-testnet',
};

const currentUtxo: Utxo = { txid: wallet.currentTx.txid, vout: wallet.currentTx.vout, satoshis: wallet.currentTx.satoshis };
const fundingUtxo: Utxo = { txid: wallet.fundingTx.txid, vout: wallet.fundingTx.vout, satoshis: wallet.fundingTx.satoshis };
const fundingUtxo2: Utxo = { txid: wallet.fundingTx2.txid, vout: wallet.fundingTx2.vout, satoshis: wallet.fundingTx2.satoshis };
const decoyOneSatUtxo: Utxo = { txid: wallet.decoyOneSatTx.txid, vout: wallet.decoyOneSatTx.vout, satoshis: wallet.decoyOneSatTx.satoshis };

const token: LicenseToken = {
  origin: { txid: wallet.originTx.txid, vout: wallet.originTx.vout },
  current: { txid: wallet.currentTx.txid, vout: wallet.currentTx.vout },
  holderAddress: wallet.holderAddress,
  collectionId: baseConfig.collectionId,
  lock: 'p2pkh',
};

function fakeProvider(overrides: Partial<ChainProvider> = {}): ChainProvider {
  return {
    getUtxos: vi.fn().mockResolvedValue([currentUtxo, fundingUtxo]),
    getTransactionHex: vi.fn((txid: string) => {
      if (txid === wallet.currentTx.txid) return Promise.resolve(wallet.currentTx.hex);
      if (txid === wallet.fundingTx.txid) return Promise.resolve(wallet.fundingTx.hex);
      if (txid === wallet.decoyOneSatTx.txid) return Promise.resolve(wallet.decoyOneSatTx.hex);
      if (txid === wallet.fundingTx2.txid) return Promise.resolve(wallet.fundingTx2.hex);
      return Promise.reject(new Error(`unexpected txid ${txid}`));
    }),
    broadcast: vi.fn().mockResolvedValue('d'.repeat(64)),
    getAddressHistory: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('buildTransferTransaction', () => {
  it('spends token.current as input 0 and builds exactly three outputs: 1-sat to recipient, change, transfer data', async () => {
    const provider = fakeProvider();

    const built = await buildTransferTransaction({
      holderKey: wallet.holderWif,
      token,
      feeUtxos: [fundingUtxo],
      toAddress: wallet.toAddress,
      config: baseConfig,
      provider,
    });

    expect(built.transaction.inputs).toHaveLength(2);
    expect(built.transaction.inputs[0].sourceTXID).toBe(wallet.currentTx.txid);
    expect(built.transaction.inputs[0].sourceOutputIndex).toBe(wallet.currentTx.vout);

    expect(built.transaction.outputs).toHaveLength(3);

    expect(built.transaction.outputs[0].satoshis).toBe(1);
    expect(built.transaction.outputs[0].lockingScript.toHex()).toBe(new P2PKH().lock(wallet.toAddress).toHex());

    expect(built.transaction.outputs[1].lockingScript.toHex()).toBe(new P2PKH().lock(wallet.holderAddress).toHex());
    expect(built.transaction.outputs[1].satoshis).toBeGreaterThan(0);

    const decoded = decodeRecordScript(built.transaction.outputs[2].lockingScript);
    expect(decoded).not.toBeNull();
    expect(built.transaction.outputs[2].satoshis).toBe(0);
    const payload = JSON.parse(Utils.toUTF8(decoded!.payloadBytes));
    expect(payload).toEqual({
      kind: 'transfer',
      origin: `${token.origin.txid}:${token.origin.vout}`,
      to: wallet.toAddress,
    });
  });

  it('never spends a 1-satoshi UTXO other than the token as a fee input', async () => {
    const provider = fakeProvider();

    const built = await buildTransferTransaction({
      holderKey: wallet.holderWif,
      token,
      feeUtxos: [decoyOneSatUtxo, fundingUtxo],
      toAddress: wallet.toAddress,
      config: baseConfig,
      provider,
    });

    expect(built.transaction.inputs).toHaveLength(2);
    expect(built.transaction.inputs[1].sourceTXID).toBe(wallet.fundingTx.txid);
  });

  it('inputs total = outputs total + fee, and fee tracks ceil(size/1000 * feeRateSatPerKb)', async () => {
    const provider = fakeProvider();

    const built = await buildTransferTransaction({
      holderKey: wallet.holderWif,
      token,
      feeUtxos: [fundingUtxo],
      toAddress: wallet.toAddress,
      config: baseConfig,
      provider,
    });

    const inputsTotal = wallet.currentTx.satoshis + wallet.fundingTx.satoshis;
    const outputsTotal = built.transaction.outputs.reduce((sum, o) => sum + (o.satoshis ?? 0), 0);
    const fee = inputsTotal - outputsTotal;
    const sizeBytes = built.hex.length / 2;
    const expectedFee = Math.ceil((sizeBytes / 1000) * baseConfig.feeRateSatPerKb);

    expect(Math.abs(fee - expectedFee)).toBeLessThanOrEqual(1);
  });

  it('produces a hex that parses back and whose input signatures verify against their source outputs', async () => {
    const provider = fakeProvider();

    const built = await buildTransferTransaction({
      holderKey: wallet.holderWif,
      token,
      feeUtxos: [fundingUtxo],
      toAddress: wallet.toAddress,
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

  it('refuses with a readable error when the token outpoint is not among the holder UTXOs', async () => {
    const provider = fakeProvider({ getUtxos: vi.fn().mockResolvedValue([fundingUtxo]) });

    await expect(
      buildTransferTransaction({
        holderKey: wallet.holderWif,
        token,
        feeUtxos: [fundingUtxo],
        toAddress: wallet.toAddress,
        config: baseConfig,
        provider,
      }),
    ).rejects.toThrow(/token already spent or not confirmed here/i);
  });

  it('refuses with a readable error when there are no fee UTXOs', async () => {
    const provider = fakeProvider();

    await expect(
      buildTransferTransaction({
        holderKey: wallet.holderWif,
        token,
        feeUtxos: [],
        toAddress: wallet.toAddress,
        config: baseConfig,
        provider,
      }),
    ).rejects.toThrow(/no fee utxos/i);
  });

  it('refuses with a readable error for an invalid recipient address', async () => {
    const provider = fakeProvider();

    await expect(
      buildTransferTransaction({
        holderKey: wallet.holderWif,
        token,
        feeUtxos: [fundingUtxo],
        toAddress: 'not-a-real-address',
        config: baseConfig,
        provider,
      }),
    ).rejects.toThrow(/invalid.*address/i);
  });
});

describe('transferLicenseToken', () => {
  function fakeRepository(): TokenRepository & { updateCurrent: ReturnType<typeof vi.fn> } {
    return { updateCurrent: vi.fn().mockResolvedValue(undefined) };
  }

  it('broadcasts once, updates the repository, and emits bsv:token-transferred', async () => {
    const provider = fakeProvider();
    const repository = fakeRepository();
    const eventBus = createEventBus();
    const received: { txid: string; origin: { txid: string; vout: number }; to: string }[] = [];
    eventBus.on('bsv:token-transferred', (event) => {
      if (event.type === 'bsv:token-transferred') received.push(event.payload);
    });

    const result = await transferLicenseToken({
      holderKey: wallet.holderWif,
      token,
      toAddress: wallet.toAddress,
      provider,
      config: baseConfig,
      eventBus,
      repository,
      pendingSpendRepo: fakePendingSpendRepo(),
    });

    expect(provider.broadcast).toHaveBeenCalledTimes(1);
    expect(result.txid).toBe('d'.repeat(64));
    expect(repository.updateCurrent).toHaveBeenCalledTimes(1);
    expect(repository.updateCurrent).toHaveBeenCalledWith(
      token.origin,
      { txid: 'd'.repeat(64), vout: 0 },
      wallet.toAddress,
    );
    expect(received).toEqual([{ txid: 'd'.repeat(64), origin: token.origin, to: wallet.toAddress }]);
  });

  it('records the spent outpoints (token input and fee input) as a pending spend after broadcast', async () => {
    const provider = fakeProvider();
    const repository = fakeRepository();
    const eventBus = createEventBus();
    const pendingSpendRepo = fakePendingSpendRepo();

    await transferLicenseToken({
      holderKey: wallet.holderWif,
      token,
      toAddress: wallet.toAddress,
      provider,
      config: baseConfig,
      eventBus,
      repository,
      pendingSpendRepo,
    });

    expect(pendingSpendRepo.add).toHaveBeenCalledTimes(1);
    expect(pendingSpendRepo.add).toHaveBeenCalledWith(
      expect.objectContaining({
        txid: 'd'.repeat(64),
        outpoints: [`${token.current.txid}:${token.current.vout}`, `${fundingUtxo.txid}:${fundingUtxo.vout}`],
      }),
    );
  });

  it("never reselects a fee outpoint the app's own unconfirmed transfer already spent (mw-b00z.11)", async () => {
    const provider = fakeProvider({ getUtxos: vi.fn().mockResolvedValue([currentUtxo, fundingUtxo, fundingUtxo2]) });
    const repository = fakeRepository();
    const eventBus = createEventBus();
    const pendingTxid = 'a'.repeat(64);
    const pendingSpendRepo = fakePendingSpendRepo({
      getAll: async () => [
        { txid: pendingTxid, outpoints: [`${fundingUtxo.txid}:${fundingUtxo.vout}`], createdAt: new Date() },
      ],
    });

    const result = await transferLicenseToken({
      holderKey: wallet.holderWif,
      token,
      toAddress: wallet.toAddress,
      provider,
      config: baseConfig,
      eventBus,
      repository,
      pendingSpendRepo,
    });

    expect(provider.broadcast).toHaveBeenCalledTimes(1);
    expect(result.txid).toBe('d'.repeat(64));
    expect(pendingSpendRepo.add).toHaveBeenCalledWith(
      expect.objectContaining({
        outpoints: [`${token.current.txid}:${token.current.vout}`, `${fundingUtxo2.txid}:${fundingUtxo2.vout}`],
      }),
    );
  });

  it('never broadcasts when the token outpoint is absent from getUtxos', async () => {
    const provider = fakeProvider({ getUtxos: vi.fn().mockResolvedValue([fundingUtxo]) });
    const repository = fakeRepository();
    const eventBus = createEventBus();

    await expect(
      transferLicenseToken({
        holderKey: wallet.holderWif,
        token,
        toAddress: wallet.toAddress,
        provider,
        config: baseConfig,
        eventBus,
        repository,
        pendingSpendRepo: fakePendingSpendRepo(),
      }),
    ).rejects.toThrow(/token already spent or not confirmed here/i);

    expect(provider.broadcast).not.toHaveBeenCalled();
    expect(repository.updateCurrent).not.toHaveBeenCalled();
  });
});

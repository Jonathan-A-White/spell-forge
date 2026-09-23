import { describe, it, expect, vi } from 'vitest';
import { P2PKH, Spend, Transaction } from '@bsv/sdk';
import { buildRecordTransaction, writeRecord } from '../../src/bsv/write-record';
import { encodeRecordScript, encodeRecordPayloadV1 } from '../../src/bsv/record';
import { createEventBus } from '../../src/contracts/events';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { ChainConfig } from '../../src/bsv/config';
import type { Utxo } from '../../src/contracts/types';
import type { PendingSpendEntry } from '../../src/bsv/pending-spends';
import wallet from '../fixtures/bsv/write-record-wallet.json';
// Same wallet (wif/address) as write-record-wallet.json, funded with extra UTXOs — reused
// here for the pending-spend exclusion tests below (mw-b00z.10).
import extraFunding from '../fixtures/bsv/send-sats-wallet.json';

const baseConfig: ChainConfig = {
  network: 'testnet',
  providerBaseUrl: 'https://api.whatsonchain.com/v1/bsv/test',
  anchorAddress: wallet.anchorAddress,
  feeRateSatPerKb: 1,
  collectionId: 'spellforge-leaderboard-testnet',
};

const utxo: Utxo = {
  txid: wallet.sourceTx.txid,
  vout: wallet.sourceTx.vout,
  satoshis: wallet.sourceTx.satoshis,
};

const payload = { text: 'hello nftgate', ts: '2026-01-01T00:00:00.000Z' };

function fakeProvider(overrides: Partial<ChainProvider> = {}): ChainProvider {
  return {
    getUtxos: vi.fn().mockResolvedValue([utxo]),
    getTransactionHex: vi.fn().mockResolvedValue(wallet.sourceTx.hex),
    broadcast: vi.fn().mockResolvedValue('f'.repeat(64)),
    getAddressHistory: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

// A source transaction paying only 1 satoshi to the wallet, for the insufficient-funds case.
const tinySourceTx = new Transaction();
tinySourceTx.addOutput({ lockingScript: new P2PKH().lock(wallet.address), satoshis: 1 });
const tinySourceTxHex = tinySourceTx.toHex();
const tinyUtxo: Utxo = { txid: tinySourceTx.id('hex'), vout: 0, satoshis: 1 };

const utxo3000: Utxo = {
  txid: extraFunding.utxo3000Tx.txid,
  vout: extraFunding.utxo3000Tx.vout,
  satoshis: extraFunding.utxo3000Tx.satoshis,
};
const tokenUtxo: Utxo = {
  txid: extraFunding.tokenOutpointTx.txid,
  vout: extraFunding.tokenOutpointTx.vout,
  satoshis: extraFunding.tokenOutpointTx.satoshis,
};
const oneSatUtxo: Utxo = {
  txid: extraFunding.oneSatTx.txid,
  vout: extraFunding.oneSatTx.vout,
  satoshis: extraFunding.oneSatTx.satoshis,
};

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

function multiSourceProvider(overrides: Partial<ChainProvider> = {}): ChainProvider {
  return {
    getUtxos: vi.fn().mockResolvedValue([utxo]),
    getTransactionHex: vi.fn().mockImplementation((txid: string) => {
      if (txid === wallet.sourceTx.txid) return Promise.resolve(wallet.sourceTx.hex);
      if (txid === extraFunding.utxo3000Tx.txid) return Promise.resolve(extraFunding.utxo3000Tx.hex);
      if (txid === extraFunding.tokenOutpointTx.txid) return Promise.resolve(extraFunding.tokenOutpointTx.hex);
      if (txid === extraFunding.oneSatTx.txid) return Promise.resolve(extraFunding.oneSatTx.hex);
      throw new Error(`no fixture source tx for ${txid}`);
    }),
    broadcast: vi.fn().mockResolvedValue('f'.repeat(64)),
    getAddressHistory: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('buildRecordTransaction', () => {
  it('builds exactly three outputs in order: record (0 sat), anchor (1 sat), change', async () => {
    const provider = fakeProvider();

    const built = await buildRecordTransaction({
      key: wallet.wif,
      utxos: [utxo],
      payload,
      config: baseConfig,
      provider,
    });

    expect(built.transaction.outputs).toHaveLength(3);

    const payloadBytes = encodeRecordPayloadV1(payload);
    expect(built.transaction.outputs[0].satoshis).toBe(0);
    expect(built.transaction.outputs[0].lockingScript.toHex()).toBe(encodeRecordScript(payloadBytes).toHex());

    expect(built.transaction.outputs[1].satoshis).toBe(1);
    expect(built.transaction.outputs[1].lockingScript.toHex()).toBe(new P2PKH().lock(baseConfig.anchorAddress).toHex());

    expect(built.transaction.outputs[2].lockingScript.toHex()).toBe(new P2PKH().lock(wallet.address).toHex());
    expect(built.transaction.outputs[2].satoshis).toBeGreaterThan(0);
  });

  it('inputs total = outputs total + fee, and fee tracks ceil(size/1000 * feeRateSatPerKb)', async () => {
    const provider = fakeProvider();

    const built = await buildRecordTransaction({
      key: wallet.wif,
      utxos: [utxo],
      payload,
      config: baseConfig,
      provider,
    });

    const outputsTotal = built.transaction.outputs.reduce((sum, o) => sum + (o.satoshis ?? 0), 0);
    const fee = wallet.sourceTx.satoshis - outputsTotal;
    const sizeBytes = built.hex.length / 2;
    const expectedFee = Math.ceil((sizeBytes / 1000) * baseConfig.feeRateSatPerKb);

    expect(Math.abs(fee - expectedFee)).toBeLessThanOrEqual(1);
  });

  it('fee changes when feeRateSatPerKb changes', async () => {
    const lowFeeProvider = fakeProvider();
    const highFeeProvider = fakeProvider();

    const lowFeeBuilt = await buildRecordTransaction({
      key: wallet.wif,
      utxos: [utxo],
      payload,
      config: { ...baseConfig, feeRateSatPerKb: 1 },
      provider: lowFeeProvider,
    });
    const highFeeBuilt = await buildRecordTransaction({
      key: wallet.wif,
      utxos: [utxo],
      payload,
      config: { ...baseConfig, feeRateSatPerKb: 50 },
      provider: highFeeProvider,
    });

    const changeAt = (tx: Transaction) => tx.outputs[2].satoshis ?? 0;

    expect(changeAt(highFeeBuilt.transaction)).toBeLessThan(changeAt(lowFeeBuilt.transaction));
  });

  it('produces a hex that parses back and whose input signature verifies against the source output', async () => {
    const provider = fakeProvider();

    const built = await buildRecordTransaction({
      key: wallet.wif,
      utxos: [utxo],
      payload,
      config: baseConfig,
      provider,
    });

    const parsed = Transaction.fromHex(built.hex);
    expect(parsed.id('hex')).toBe(built.txid);

    const sourceOutput = Transaction.fromHex(wallet.sourceTx.hex).outputs[wallet.sourceTx.vout];
    const spend = new Spend({
      sourceTXID: wallet.sourceTx.txid,
      sourceOutputIndex: wallet.sourceTx.vout,
      sourceSatoshis: sourceOutput.satoshis!,
      lockingScript: sourceOutput.lockingScript,
      transactionVersion: parsed.version,
      otherInputs: [],
      allInputs: parsed.inputs,
      outputs: parsed.outputs,
      inputIndex: 0,
      unlockingScript: parsed.inputs[0].unlockingScript!,
      inputSequence: parsed.inputs[0].sequence ?? 0xffffffff,
      lockTime: parsed.lockTime,
    });

    expect(spend.validateJavaScript()).toBe(true);
  });

  it('refuses with a readable error when no anchor address is configured', async () => {
    const provider = fakeProvider();

    await expect(
      buildRecordTransaction({
        key: wallet.wif,
        utxos: [utxo],
        payload,
        config: { ...baseConfig, anchorAddress: '' },
        provider,
      }),
    ).rejects.toThrow(/anchor address/i);
  });

  it('refuses with a readable error when there are no UTXOs', async () => {
    const provider = fakeProvider();

    await expect(
      buildRecordTransaction({
        key: wallet.wif,
        utxos: [],
        payload,
        config: baseConfig,
        provider,
      }),
    ).rejects.toThrow(/no utxos/i);
  });

  it('refuses with a readable error when there are too few satoshis', async () => {
    const provider = fakeProvider({ getTransactionHex: vi.fn().mockResolvedValue(tinySourceTxHex) });

    await expect(
      buildRecordTransaction({
        key: wallet.wif,
        utxos: [tinyUtxo],
        payload,
        config: baseConfig,
        provider,
      }),
    ).rejects.toThrow(/not enough satoshis/i);
  });
});

describe('writeRecord', () => {
  it('broadcasts exactly once and emits bsv:record-written with the txid the provider returned', async () => {
    const provider = fakeProvider();
    const eventBus = createEventBus();
    const received: string[] = [];
    eventBus.on('bsv:record-written', (event) => {
      if (event.type === 'bsv:record-written') received.push(event.payload.txid);
    });

    const result = await writeRecord({
      key: wallet.wif,
      utxos: [utxo],
      payload,
      config: baseConfig,
      provider,
      eventBus,
      pendingSpendRepo: fakePendingSpendRepo(),
    });

    expect(provider.broadcast).toHaveBeenCalledTimes(1);
    const [broadcastHex] = (provider.broadcast as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(typeof broadcastHex).toBe('string');
    expect(result.txid).toBe('f'.repeat(64));
    expect(received).toEqual(['f'.repeat(64)]);
  });

  it('never broadcasts when the build step refuses', async () => {
    const provider = fakeProvider();
    const eventBus = createEventBus();
    const pendingSpendRepo = fakePendingSpendRepo();

    await expect(
      writeRecord({
        key: wallet.wif,
        utxos: [],
        payload,
        config: baseConfig,
        provider,
        eventBus,
        pendingSpendRepo,
      }),
    ).rejects.toThrow();

    expect(provider.broadcast).not.toHaveBeenCalled();
    expect(pendingSpendRepo.add).not.toHaveBeenCalled();
  });

  it("never selects an outpoint the app's own unconfirmed transaction already spent (mw-b00z.10)", async () => {
    const provider = multiSourceProvider({ getUtxos: vi.fn().mockResolvedValue([utxo, utxo3000, tokenUtxo]) });
    const eventBus = createEventBus();
    const pendingTxid = 'e'.repeat(64);
    const pendingSpendRepo = fakePendingSpendRepo({
      getAll: async () => [
        { txid: pendingTxid, outpoints: [`${tokenUtxo.txid}:${tokenUtxo.vout}`], createdAt: new Date() },
      ],
    });

    const result = await writeRecord({
      key: wallet.wif,
      utxos: [utxo, utxo3000, tokenUtxo],
      payload,
      config: baseConfig,
      provider,
      eventBus,
      pendingSpendRepo,
    });

    expect(provider.broadcast).toHaveBeenCalledTimes(1);
    const [broadcastHex] = (provider.broadcast as ReturnType<typeof vi.fn>).mock.calls[0];
    const broadcastTx = Transaction.fromHex(broadcastHex);
    expect(broadcastTx.inputs.map((input) => input.sourceTXID)).not.toContain(tokenUtxo.txid);
    expect(broadcastTx.inputs).toHaveLength(2);

    expect(pendingSpendRepo.removeMany).not.toHaveBeenCalled();
    expect(pendingSpendRepo.add).toHaveBeenCalledTimes(1);
    // Records the whole pending-filtered UTXO list (not just the fee inputs actually
    // spent) as newly pending, matching the pre-existing screen-level convention.
    expect(pendingSpendRepo.add.mock.calls[0][0].outpoints).toEqual([
      `${utxo.txid}:${utxo.vout}`,
      `${utxo3000.txid}:${utxo3000.vout}`,
    ]);
    expect(result.txid).toBe('f'.repeat(64));
  });

  it('rejects before broadcast, naming the pending count, when the only non-pending UTXO is too small (mw-b00z.10)', async () => {
    const provider = multiSourceProvider({ getUtxos: vi.fn().mockResolvedValue([oneSatUtxo, utxo, utxo3000]) });
    const eventBus = createEventBus();
    const pendingSpendRepo = fakePendingSpendRepo({
      getAll: async () => [
        { txid: 'a'.repeat(64), outpoints: [`${utxo.txid}:${utxo.vout}`], createdAt: new Date() },
        { txid: 'b'.repeat(64), outpoints: [`${utxo3000.txid}:${utxo3000.vout}`], createdAt: new Date() },
      ],
    });

    await expect(
      writeRecord({
        key: wallet.wif,
        utxos: [oneSatUtxo, utxo, utxo3000],
        payload,
        config: baseConfig,
        provider,
        eventBus,
        pendingSpendRepo,
      }),
    ).rejects.toThrow(/2 pending transaction/i);

    expect(provider.broadcast).not.toHaveBeenCalled();
    expect(pendingSpendRepo.add).not.toHaveBeenCalled();
  });
});

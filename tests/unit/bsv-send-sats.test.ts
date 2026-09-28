import { describe, it, expect, vi } from 'vitest';
import { Spend, Transaction } from '@bsv/sdk';
import { buildSendTransaction, sendSats } from '../../src/bsv/send-sats';
import { ChainError } from '../../src/bsv/chain-error';
import { createEventBus } from '../../src/contracts/events';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { ChainConfig } from '../../src/bsv/config';
import type { Utxo } from '../../src/contracts/types';
import type { PendingSpendEntry } from '../../src/bsv/pending-spends';
import wallet from '../fixtures/bsv/send-sats-wallet.json';

const baseConfig: ChainConfig = {
  network: 'testnet',
  providerBaseUrl: 'https://api.whatsonchain.com/v1/bsv/test',
  anchorAddress: '',
  feeRateSatPerKb: 1,
  collectionId: 'spellforge-leaderboard-testnet',
};

const oneSatUtxo: Utxo = { txid: wallet.oneSatTx.txid, vout: wallet.oneSatTx.vout, satoshis: wallet.oneSatTx.satoshis };
const utxo5000: Utxo = { txid: wallet.utxo5000Tx.txid, vout: wallet.utxo5000Tx.vout, satoshis: wallet.utxo5000Tx.satoshis };
const utxo3000: Utxo = { txid: wallet.utxo3000Tx.txid, vout: wallet.utxo3000Tx.vout, satoshis: wallet.utxo3000Tx.satoshis };
const tokenUtxo: Utxo = { txid: wallet.tokenOutpointTx.txid, vout: wallet.tokenOutpointTx.vout, satoshis: wallet.tokenOutpointTx.satoshis };
const tokenOutpoint = { txid: wallet.tokenOutpointTx.txid, vout: wallet.tokenOutpointTx.vout };

const allUtxos = [oneSatUtxo, utxo5000, utxo3000, tokenUtxo];

function sourceHexFor(txid: string): string {
  if (txid === wallet.oneSatTx.txid) return wallet.oneSatTx.hex;
  if (txid === wallet.utxo5000Tx.txid) return wallet.utxo5000Tx.hex;
  if (txid === wallet.utxo3000Tx.txid) return wallet.utxo3000Tx.hex;
  if (txid === wallet.tokenOutpointTx.txid) return wallet.tokenOutpointTx.hex;
  throw new Error(`no fixture source tx for ${txid}`);
}

/** A broadcast that acknowledges with the txid of the hex it was sent, as WhatsOnChain does. */
function echoBroadcast() {
  return vi.fn(async (txHex: string) => Transaction.fromHex(txHex).id('hex'));
}

/** The txid of the hex handed to provider.broadcast on its first call. */
function broadcastTxid(provider: ChainProvider): string {
  const [broadcastHex] = (provider.broadcast as ReturnType<typeof vi.fn>).mock.calls[0];
  return Transaction.fromHex(broadcastHex).id('hex');
}

function fakeProvider(overrides: Partial<ChainProvider> = {}): ChainProvider {
  return {
    getUtxos: vi.fn().mockResolvedValue(allUtxos),
    getTransactionHex: vi.fn().mockImplementation((txid: string) => Promise.resolve(sourceHexFor(txid))),
    broadcast: echoBroadcast(),
    getAddressHistory: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('buildSendTransaction', () => {
  it('excludes the 1-sat UTXO and the excluded token outpoint from inputs, sends exactly the amount, and returns change', async () => {
    const provider = fakeProvider();

    const built = await buildSendTransaction({
      key: wallet.wif,
      utxos: allUtxos,
      toAddress: wallet.toAddress,
      amountSats: 2000,
      config: baseConfig,
      provider,
      excludeOutpoints: [tokenOutpoint],
    });

    expect(built.spentOutpoints).toEqual([
      { txid: utxo5000.txid, vout: utxo5000.vout },
      { txid: utxo3000.txid, vout: utxo3000.vout },
    ]);

    for (const input of built.transaction.inputs) {
      expect(input.sourceTXID).not.toBe(oneSatUtxo.txid);
      expect(input.sourceTXID).not.toBe(tokenUtxo.txid);
    }

    expect(built.transaction.outputs).toHaveLength(2);
    expect(built.transaction.outputs[0].satoshis).toBe(2000);
    expect(built.transaction.outputs[1].satoshis).toBeGreaterThan(0);
  });

  it('inputs total = outputs total + fee, within 1 satoshi of ceil(size/1000 * feeRateSatPerKb)', async () => {
    const provider = fakeProvider();

    const built = await buildSendTransaction({
      key: wallet.wif,
      utxos: allUtxos,
      toAddress: wallet.toAddress,
      amountSats: 2000,
      config: baseConfig,
      provider,
      excludeOutpoints: [tokenOutpoint],
    });

    const inputsTotal = utxo5000.satoshis + utxo3000.satoshis;
    const outputsTotal = built.transaction.outputs.reduce((sum, o) => sum + (o.satoshis ?? 0), 0);
    const fee = inputsTotal - outputsTotal;
    const sizeBytes = built.hex.length / 2;
    const expectedFee = Math.ceil((sizeBytes / 1000) * baseConfig.feeRateSatPerKb);

    expect(Math.abs(fee - expectedFee)).toBeLessThanOrEqual(1);
  });

  it('produces a hex that parses back with @bsv/sdk and whose input signatures verify', async () => {
    const provider = fakeProvider();

    const built = await buildSendTransaction({
      key: wallet.wif,
      utxos: allUtxos,
      toAddress: wallet.toAddress,
      amountSats: 2000,
      config: baseConfig,
      provider,
      excludeOutpoints: [tokenOutpoint],
    });

    const parsed = Transaction.fromHex(built.hex);
    expect(parsed.id('hex')).toBe(built.txid);

    const spentSourceTxs = [wallet.utxo5000Tx, wallet.utxo3000Tx];
    for (let inputIndex = 0; inputIndex < parsed.inputs.length; inputIndex++) {
      const sourceTx = spentSourceTxs[inputIndex];
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

  it('refuses with a readable error when the amount is under 2 satoshis', async () => {
    const provider = fakeProvider();

    await expect(
      buildSendTransaction({
        key: wallet.wif,
        utxos: allUtxos,
        toAddress: wallet.toAddress,
        amountSats: 1,
        config: baseConfig,
        provider,
      }),
    ).rejects.toThrow(/at least 2 satoshis/i);
    expect(provider.broadcast).not.toHaveBeenCalled();
  });

  it('refuses with a readable error for a mainnet address', async () => {
    const provider = fakeProvider();

    await expect(
      buildSendTransaction({
        key: wallet.wif,
        utxos: allUtxos,
        toAddress: wallet.mainnetAddress,
        amountSats: 2000,
        config: baseConfig,
        provider,
      }),
    ).rejects.toThrow(/invalid or wrong-network address/i);
  });

  it('refuses with a readable error for a malformed address', async () => {
    const provider = fakeProvider();

    await expect(
      buildSendTransaction({
        key: wallet.wif,
        utxos: allUtxos,
        toAddress: 'not-an-address',
        amountSats: 2000,
        config: baseConfig,
        provider,
      }),
    ).rejects.toThrow(/invalid or wrong-network address/i);
  });

  it('refuses with a readable error when the amount is over the spendable total', async () => {
    const provider = fakeProvider();

    await expect(
      buildSendTransaction({
        key: wallet.wif,
        utxos: allUtxos,
        toAddress: wallet.toAddress,
        amountSats: 1_000_000,
        config: baseConfig,
        provider,
        excludeOutpoints: [tokenOutpoint],
      }),
    ).rejects.toThrow(/not enough satoshis/i);
  });

  it('refuses with a readable error when there are no eligible UTXOs', async () => {
    const provider = fakeProvider();

    await expect(
      buildSendTransaction({
        key: wallet.wif,
        utxos: [oneSatUtxo],
        toAddress: wallet.toAddress,
        amountSats: 2000,
        config: baseConfig,
        provider,
      }),
    ).rejects.toThrow(/no utxos/i);
  });
});

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

describe('sendSats', () => {
  it('broadcasts exactly once, records the spent outpoints as pending spends, and emits bsv:sats-sent', async () => {
    const provider = fakeProvider();
    const eventBus = createEventBus();
    const received: Array<{ txid: string; toAddress: string; amountSats: number }> = [];
    eventBus.on('bsv:sats-sent', (event) => {
      if (event.type === 'bsv:sats-sent') received.push(event.payload);
    });
    const added: Array<{ txid: string; outpoints: string[] }> = [];
    const pendingSpendRepo = fakePendingSpendRepo({
      add: async (entry) => {
        added.push(entry);
      },
    });

    const result = await sendSats({
      key: wallet.wif,
      toAddress: wallet.toAddress,
      amountSats: 2000,
      provider,
      config: baseConfig,
      eventBus,
      pendingSpendRepo,
      excludeOutpoints: [tokenOutpoint],
    });

    expect(provider.broadcast).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ txid: broadcastTxid(provider), amountSats: 2000, toAddress: wallet.toAddress });
    expect(pendingSpendRepo.add).toHaveBeenCalledTimes(1);
    expect(added[0].outpoints).toEqual([
      `${utxo5000.txid}:${utxo5000.vout}`,
      `${utxo3000.txid}:${utxo3000.vout}`,
    ]);
    expect(received).toEqual([{ txid: broadcastTxid(provider), toAddress: wallet.toAddress, amountSats: 2000 }]);
  });

  it('never broadcasts when the build step refuses', async () => {
    const provider = fakeProvider();
    const eventBus = createEventBus();
    const pendingSpendRepo = fakePendingSpendRepo();

    await expect(
      sendSats({
        key: wallet.wif,
        toAddress: wallet.toAddress,
        amountSats: 1,
        provider,
        config: baseConfig,
        eventBus,
        pendingSpendRepo,
      }),
    ).rejects.toThrow();

    expect(provider.broadcast).not.toHaveBeenCalled();
    expect(pendingSpendRepo.add).not.toHaveBeenCalled();
  });

  it("never selects an outpoint the app's own unconfirmed transaction already spent (mw-b00z.10)", async () => {
    const provider = fakeProvider({ getUtxos: vi.fn().mockResolvedValue([utxo5000, utxo3000, tokenUtxo]) });
    const eventBus = createEventBus();
    const pendingTxid = 'e'.repeat(64);
    const pendingSpendRepo = fakePendingSpendRepo({
      getAll: async () => [
        { txid: pendingTxid, outpoints: [`${tokenUtxo.txid}:${tokenUtxo.vout}`], createdAt: new Date() },
      ],
    });

    const result = await sendSats({
      key: wallet.wif,
      toAddress: wallet.toAddress,
      amountSats: 2000,
      provider,
      config: baseConfig,
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
    expect(pendingSpendRepo.add.mock.calls[0][0].outpoints).toEqual([
      `${utxo5000.txid}:${utxo5000.vout}`,
      `${utxo3000.txid}:${utxo3000.vout}`,
    ]);
    expect(result.txid).toBe(broadcastTxid(provider));
  });

  it('rejects before broadcast, naming the pending count, when the only non-pending UTXO is too small (mw-b00z.10)', async () => {
    const provider = fakeProvider({ getUtxos: vi.fn().mockResolvedValue([oneSatUtxo, utxo5000, utxo3000]) });
    const eventBus = createEventBus();
    const pendingSpendRepo = fakePendingSpendRepo({
      getAll: async () => [
        { txid: 'a'.repeat(64), outpoints: [`${utxo5000.txid}:${utxo5000.vout}`], createdAt: new Date() },
        { txid: 'b'.repeat(64), outpoints: [`${utxo3000.txid}:${utxo3000.vout}`], createdAt: new Date() },
      ],
    });

    await expect(
      sendSats({
        key: wallet.wif,
        toAddress: wallet.toAddress,
        amountSats: 2000,
        provider,
        config: baseConfig,
        eventBus,
        pendingSpendRepo,
      }),
    ).rejects.toThrow(/2 pending transaction/i);

    expect(provider.broadcast).not.toHaveBeenCalled();
    expect(pendingSpendRepo.add).not.toHaveBeenCalled();
  });

  it('spends an outpoint getUtxos lists twice (WhatsOnChain around confirmation) only once (bad-txns-inputs-duplicate)', async () => {
    const provider = fakeProvider({
      getUtxos: vi.fn().mockResolvedValue([{ ...utxo5000, height: 0 }, utxo3000, { ...utxo5000, height: 2432800 }]),
    });
    const pendingSpendRepo = fakePendingSpendRepo();

    await sendSats({
      key: wallet.wif,
      toAddress: wallet.toAddress,
      amountSats: 2000,
      provider,
      config: baseConfig,
      eventBus: createEventBus(),
      pendingSpendRepo,
    });

    const [broadcastHex] = (provider.broadcast as ReturnType<typeof vi.fn>).mock.calls[0];
    const inputOutpoints = Transaction.fromHex(broadcastHex).inputs.map(
      (input) => `${input.sourceTXID}:${input.sourceOutputIndex}`,
    );
    expect(inputOutpoints).toEqual([`${utxo5000.txid}:${utxo5000.vout}`, `${utxo3000.txid}:${utxo3000.vout}`]);
    expect(pendingSpendRepo.add.mock.calls[0][0].outpoints).toEqual(inputOutpoints);
  });

  it('reports success with the locally computed txid when the broadcast comes back "txn-already-known"', async () => {
    const provider = fakeProvider({
      broadcast: vi
        .fn()
        .mockRejectedValue(
          new ChainError('WhatsOnChain said 400: unexpected response code 500: 257: txn-already-known', { status: 400 }),
        ),
    });
    const eventBus = createEventBus();
    const received: string[] = [];
    eventBus.on('bsv:sats-sent', (event) => {
      if (event.type === 'bsv:sats-sent') received.push(event.payload.txid);
    });
    const pendingSpendRepo = fakePendingSpendRepo();

    const result = await sendSats({
      key: wallet.wif,
      toAddress: wallet.toAddress,
      amountSats: 2000,
      provider,
      config: baseConfig,
      eventBus,
      pendingSpendRepo,
      excludeOutpoints: [tokenOutpoint],
    });

    const computedTxid = broadcastTxid(provider);
    expect(result.txid).toBe(computedTxid);
    expect(received).toEqual([computedTxid]);
    expect(pendingSpendRepo.add).toHaveBeenCalledTimes(1);
    expect(pendingSpendRepo.add.mock.calls[0][0].txid).toBe(computedTxid);
    expect(pendingSpendRepo.removeMany).not.toHaveBeenCalled();
  });

  it("refuses a broadcast acknowledged with a txid other than the transaction's own, keeping its inputs pending", async () => {
    const provider = fakeProvider({ broadcast: vi.fn().mockResolvedValue('f'.repeat(64)) });
    const pendingSpendRepo = fakePendingSpendRepo();

    await expect(
      sendSats({
        key: wallet.wif,
        toAddress: wallet.toAddress,
        amountSats: 2000,
        provider,
        config: baseConfig,
        eventBus: createEventBus(),
        pendingSpendRepo,
        excludeOutpoints: [tokenOutpoint],
      }),
    ).rejects.toThrow(/acknowledged txid f{64}, not this transaction's own/);

    expect(pendingSpendRepo.add).toHaveBeenCalledTimes(1);
    expect(pendingSpendRepo.add.mock.calls[0][0].txid).toBe(broadcastTxid(provider));
    expect(pendingSpendRepo.removeMany).not.toHaveBeenCalled();
  });

  it('records the pending spend before broadcasting, and keeps it when the broadcast gets no reply', async () => {
    const provider = fakeProvider({
      broadcast: vi
        .fn()
        .mockRejectedValue(
          new ChainError(
            'Could not reach WhatsOnChain after 3 tries (offline, or rate-limited: its 429 reply carries no CORS header)',
          ),
        ),
    });
    const pendingSpendRepo = fakePendingSpendRepo();

    await expect(
      sendSats({
        key: wallet.wif,
        toAddress: wallet.toAddress,
        amountSats: 2000,
        provider,
        config: baseConfig,
        eventBus: createEventBus(),
        pendingSpendRepo,
        excludeOutpoints: [tokenOutpoint],
      }),
    ).rejects.toThrow(/could not reach whatsonchain/i);

    expect(pendingSpendRepo.add).toHaveBeenCalledTimes(1);
    expect(pendingSpendRepo.add.mock.calls[0][0]).toMatchObject({
      txid: broadcastTxid(provider),
      outpoints: [`${utxo5000.txid}:${utxo5000.vout}`, `${utxo3000.txid}:${utxo3000.vout}`],
    });
    expect(pendingSpendRepo.add.mock.invocationCallOrder[0]).toBeLessThan(
      (provider.broadcast as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
    );
    expect(pendingSpendRepo.removeMany).not.toHaveBeenCalled();
  });
});

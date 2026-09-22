import { describe, it, expect, vi } from 'vitest';
import { P2PKH, Spend, Transaction, Utils } from '@bsv/sdk';
import { buildMintTransaction, mintLicenseToken } from '../../src/bsv/license-token';
import { decodeRecordScript } from '../../src/bsv/record';
import { createEventBus } from '../../src/contracts/events';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { ChainConfig } from '../../src/bsv/config';
import type { Utxo } from '../../src/contracts/types';
import wallet from '../fixtures/bsv/license-token-mint-wallet.json';

const baseConfig: ChainConfig = {
  network: 'testnet',
  providerBaseUrl: 'https://api.whatsonchain.com/v1/bsv/test',
  anchorAddress: '',
  feeRateSatPerKb: 1,
  collectionId: 'spellforge-leaderboard-testnet',
};

const fundingUtxo: Utxo = {
  txid: wallet.fundingTx.txid,
  vout: wallet.fundingTx.vout,
  satoshis: wallet.fundingTx.satoshis,
};

const oneSatUtxo: Utxo = {
  txid: wallet.oneSatTx.txid,
  vout: wallet.oneSatTx.vout,
  satoshis: wallet.oneSatTx.satoshis,
};

function fakeProvider(overrides: Partial<ChainProvider> = {}): ChainProvider {
  return {
    getUtxos: vi.fn().mockResolvedValue([fundingUtxo]),
    getTransactionHex: vi.fn((txid: string) => {
      if (txid === wallet.fundingTx.txid) return Promise.resolve(wallet.fundingTx.hex);
      if (txid === wallet.oneSatTx.txid) return Promise.resolve(wallet.oneSatTx.hex);
      return Promise.reject(new Error(`unexpected txid ${txid}`));
    }),
    broadcast: vi.fn().mockResolvedValue('f'.repeat(64)),
    getAddressHistory: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('buildMintTransaction', () => {
  it('builds exactly three outputs in order: token (1 sat), change, data (0 sat, mint payload)', async () => {
    const provider = fakeProvider();

    const built = await buildMintTransaction({
      issuerKey: wallet.issuerWif,
      utxos: [fundingUtxo],
      holderAddress: wallet.holderAddress,
      config: baseConfig,
      provider,
    });

    expect(built.transaction.outputs).toHaveLength(3);

    expect(built.transaction.outputs[0].satoshis).toBe(1);
    expect(built.transaction.outputs[0].lockingScript.toHex()).toBe(
      new P2PKH().lock(wallet.holderAddress).toHex(),
    );

    expect(built.transaction.outputs[1].lockingScript.toHex()).toBe(
      new P2PKH().lock(wallet.issuerAddress).toHex(),
    );
    expect(built.transaction.outputs[1].satoshis).toBeGreaterThan(0);

    const dataScriptHex = built.transaction.outputs[2].lockingScript.toHex();
    expect(built.transaction.outputs[2].satoshis).toBe(0);
    expect(dataScriptHex.startsWith('006a076e6674676174650101')).toBe(true);

    const decoded = decodeRecordScript(built.transaction.outputs[2].lockingScript);
    expect(decoded).not.toBeNull();
    const payload = JSON.parse(Utils.toUTF8(decoded!.payloadBytes));
    expect(payload).toEqual({
      kind: 'mint',
      collection: baseConfig.collectionId,
      holder: wallet.holderAddress,
    });
  });

  it('never spends a 1-satoshi UTXO as an input', async () => {
    const provider = fakeProvider();

    const built = await buildMintTransaction({
      issuerKey: wallet.issuerWif,
      utxos: [oneSatUtxo, fundingUtxo],
      holderAddress: wallet.holderAddress,
      config: baseConfig,
      provider,
    });

    expect(built.transaction.inputs).toHaveLength(1);
    expect(built.transaction.inputs[0].sourceTXID).toBe(wallet.fundingTx.txid);
  });

  it('inputs total = outputs total + fee, and fee tracks ceil(size/1000 * feeRateSatPerKb)', async () => {
    const provider = fakeProvider();

    const built = await buildMintTransaction({
      issuerKey: wallet.issuerWif,
      utxos: [fundingUtxo],
      holderAddress: wallet.holderAddress,
      config: baseConfig,
      provider,
    });

    const outputsTotal = built.transaction.outputs.reduce((sum, o) => sum + (o.satoshis ?? 0), 0);
    const fee = wallet.fundingTx.satoshis - outputsTotal;
    const sizeBytes = built.hex.length / 2;
    const expectedFee = Math.ceil((sizeBytes / 1000) * baseConfig.feeRateSatPerKb);

    expect(Math.abs(fee - expectedFee)).toBeLessThanOrEqual(1);
  });

  it('produces a hex that parses back and whose input signature verifies against the source output', async () => {
    const provider = fakeProvider();

    const built = await buildMintTransaction({
      issuerKey: wallet.issuerWif,
      utxos: [fundingUtxo],
      holderAddress: wallet.holderAddress,
      config: baseConfig,
      provider,
    });

    const parsed = Transaction.fromHex(built.hex);
    expect(parsed.id('hex')).toBe(built.txid);

    const sourceOutput = Transaction.fromHex(wallet.fundingTx.hex).outputs[wallet.fundingTx.vout];
    const spend = new Spend({
      sourceTXID: wallet.fundingTx.txid,
      sourceOutputIndex: wallet.fundingTx.vout,
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

  it('refuses with a readable error when there are no UTXOs', async () => {
    const provider = fakeProvider();

    await expect(
      buildMintTransaction({
        issuerKey: wallet.issuerWif,
        utxos: [],
        holderAddress: wallet.holderAddress,
        config: baseConfig,
        provider,
      }),
    ).rejects.toThrow(/no utxos/i);
  });

  it('refuses with a readable error when the only UTXOs are 1-satoshi tokens (too few satoshis)', async () => {
    const provider = fakeProvider();

    await expect(
      buildMintTransaction({
        issuerKey: wallet.issuerWif,
        utxos: [oneSatUtxo],
        holderAddress: wallet.holderAddress,
        config: baseConfig,
        provider,
      }),
    ).rejects.toThrow(/not enough satoshis/i);
  });

  it('refuses with a readable error for an invalid holder address', async () => {
    const provider = fakeProvider();

    await expect(
      buildMintTransaction({
        issuerKey: wallet.issuerWif,
        utxos: [fundingUtxo],
        holderAddress: 'not-a-real-address',
        config: baseConfig,
        provider,
      }),
    ).rejects.toThrow(/invalid.*address/i);
  });
});

describe('mintLicenseToken', () => {
  it('broadcasts exactly once and returns a token whose origin and current are {txid, 0}', async () => {
    const provider = fakeProvider();
    const eventBus = createEventBus();
    const received: { txid: string; origin: { txid: string; vout: number } }[] = [];
    eventBus.on('bsv:token-minted', (event) => {
      if (event.type === 'bsv:token-minted') received.push(event.payload);
    });

    const token = await mintLicenseToken({
      issuerKey: wallet.issuerWif,
      holderAddress: wallet.holderAddress,
      provider,
      config: baseConfig,
      eventBus,
    });

    expect(provider.broadcast).toHaveBeenCalledTimes(1);
    expect(token.origin).toEqual({ txid: 'f'.repeat(64), vout: 0 });
    expect(token.current).toEqual({ txid: 'f'.repeat(64), vout: 0 });
    expect(token.holderAddress).toBe(wallet.holderAddress);
    expect(token.collectionId).toBe(baseConfig.collectionId);
    expect(received).toEqual([{ txid: 'f'.repeat(64), origin: { txid: 'f'.repeat(64), vout: 0 } }]);
  });

  it('never broadcasts when the build step refuses', async () => {
    const provider = fakeProvider({ getUtxos: vi.fn().mockResolvedValue([]) });
    const eventBus = createEventBus();

    await expect(
      mintLicenseToken({
        issuerKey: wallet.issuerWif,
        holderAddress: wallet.holderAddress,
        provider,
        config: baseConfig,
        eventBus,
      }),
    ).rejects.toThrow();

    expect(provider.broadcast).not.toHaveBeenCalled();
  });
});

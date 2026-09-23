// buildContractMintTransaction (mw-5wuz6.3, mw-yo97u.3): output 0 is the 1-sat License-locked
// token to the holder's owner key, output 1 Fuel(C) at exactly the MINT_FUEL passed (its
// hash256 is the fuelScriptHash the License binds), output 2 a type-M Data output, output 3
// the issuer's change. No network.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Transaction } from '@bsv/sdk';
import {
  buildContractMintTransaction,
  InvalidMintFuelError,
  mintContractLicenseToken,
} from '../../src/bsv/license-contract';
import type { BuiltContractTransaction } from '../../src/bsv/license-contract';
import { createEventBus } from '../../src/contracts/events';
import { chainConfig } from '../../src/bsv/config';
import {
  ARTIFACT_MD5,
  config,
  fakeChain,
  FUEL_ARTIFACT_MD5,
  MINT_FUEL,
  mintOwnersLicense,
  utxoOf,
  wallet,
} from '../fixtures/bsv/license-contract-chain';

let mint: BuiltContractTransaction;

beforeAll(async () => {
  mint = await mintOwnersLicense();
});

function mintWithFuel(mintFuelSatoshis: number | undefined): Promise<BuiltContractTransaction> {
  return buildContractMintTransaction({
    issuerKey: wallet.owner.wif,
    utxos: [utxoOf(wallet.mintFundingTx)],
    holderPubKey: wallet.owner.pubKey,
    mintFuelSatoshis,
    config,
    provider: fakeChain(),
  });
}

describe('buildContractMintTransaction', () => {
  // The License at output 0, Fuel(C) at MINT_FUEL at output 1, and the type-M Data output at
  // output 2 are covered by tests/features/bsv/license-contract-builders.feature (AC-4.1.1-1).

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
      mintFuelSatoshis: MINT_FUEL,
      config,
      provider: fakeChain(),
    });
    expect(built.transaction.inputs.map((input) => input.sourceTXID)).toEqual([wallet.mintFundingTx.txid]);
  });

  it('returns the token record: origin and current at output 0, lock license, the License and Fuel artifact md5s', () => {
    const origin = { txid: mint.txid, vout: 0 };
    expect(mint.token).toEqual({
      origin,
      current: origin,
      holderAddress: wallet.owner.address,
      collectionId: config.collectionId,
      lock: 'license',
      artifact: ARTIFACT_MD5,
      fuelArtifact: FUEL_ARTIFACT_MD5,
    });
  });

  it('refuses a MINT_FUEL under 2 × FEE_CAP (4,000 sat), or none, with InvalidMintFuelError', async () => {
    await expect(mintWithFuel(3_999)).rejects.toBeInstanceOf(InvalidMintFuelError);
    await expect(mintWithFuel(3_999)).rejects.toMatchObject({
      name: 'InvalidMintFuelError',
      message: 'MINT_FUEL 3999 sat is below 2 × FEE_CAP (4000 sat): a Fuel that small cannot pay for two writes',
    });
    await expect(mintWithFuel(undefined)).rejects.toMatchObject({
      name: 'InvalidMintFuelError',
      message: 'MINT_FUEL is not set: configure mintFuelSatoshis before minting a License with Fuel',
    });
    const atMinimum = await mintWithFuel(4_000);
    expect(atMinimum.transaction.outputs[1].satoshis).toBe(4_000);
  });

  it('refuses an owner key that is not a public key', async () => {
    await expect(
      buildContractMintTransaction({
        issuerKey: wallet.owner.wif,
        utxos: [utxoOf(wallet.mintFundingTx)],
        holderPubKey: wallet.owner.address,
        mintFuelSatoshis: MINT_FUEL,
        config,
        provider: fakeChain(),
      }),
    ).rejects.toThrow('Invalid holder public key');
  });
});

describe('mintContractLicenseToken', () => {
  function pendingSpendRepo() {
    return { getAll: vi.fn().mockResolvedValue([]), add: vi.fn(), removeMany: vi.fn() };
  }

  it('mints with the configured MINT_FUEL', async () => {
    const provider = fakeChain();
    vi.mocked(provider.getUtxos).mockResolvedValue([utxoOf(wallet.mintFundingTx)]);
    vi.mocked(provider.broadcast).mockImplementation(async (hex: string) => {
      const tx = Transaction.fromHex(hex);
      expect(tx.outputs[1].satoshis).toBe(12_345);
      return tx.id('hex');
    });
    const token = await mintContractLicenseToken({
      issuerKey: wallet.owner.wif,
      provider,
      config: { ...config, mintFuelSatoshis: 12_345 },
      eventBus: createEventBus(),
      pendingSpendRepo: pendingSpendRepo(),
    });
    expect(provider.broadcast).toHaveBeenCalledTimes(1);
    expect(token.fuelArtifact).toBe(FUEL_ARTIFACT_MD5);
  });

  it('mints with the app\'s own chainConfig, whose MINT_FUEL is 10,000 sat (mw-yo97u.9)', async () => {
    const provider = fakeChain();
    vi.mocked(provider.getUtxos).mockResolvedValue([utxoOf(wallet.mintFundingTx)]);
    vi.mocked(provider.broadcast).mockImplementation(async (hex: string) => {
      const tx = Transaction.fromHex(hex);
      expect(tx.outputs[1].satoshis).toBe(10_000);
      return tx.id('hex');
    });
    await mintContractLicenseToken({
      issuerKey: wallet.owner.wif,
      provider,
      config: chainConfig,
      eventBus: createEventBus(),
      pendingSpendRepo: pendingSpendRepo(),
    });
    expect(provider.broadcast).toHaveBeenCalledTimes(1);
  });

  it('refuses to mint, and broadcasts nothing, when MINT_FUEL is not configured', async () => {
    const provider = fakeChain();
    vi.mocked(provider.getUtxos).mockResolvedValue([utxoOf(wallet.mintFundingTx)]);
    await expect(
      mintContractLicenseToken({
        issuerKey: wallet.owner.wif,
        provider,
        config,
        eventBus: createEventBus(),
        pendingSpendRepo: pendingSpendRepo(),
      }),
    ).rejects.toMatchObject({ name: 'InvalidMintFuelError' });
    expect(provider.broadcast).not.toHaveBeenCalled();
  });
});

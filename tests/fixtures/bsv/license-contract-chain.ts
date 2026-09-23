// An offline chain for the contract-locked builders' tests (mw-5wuz6.3): a fake provider
// serving the License wallet fixture's funding transactions and any transaction a test has
// built, so a License minted in one test is the source of the write or transfer under test.

import { vi } from 'vitest';
import { Hash, LockingScript, P2PKH, PrivateKey, SatoshisPerKilobyte, Transaction, Utils } from '@bsv/sdk';
import type { ChainProvider } from '../../../src/bsv/chain-provider';
import type { ChainConfig } from '../../../src/bsv/config';
import type { Utxo } from '../../../src/contracts/types';
import { buildContractMintTransaction, licenseLockingScript } from '../../../src/bsv/license-contract';
import type { BuiltContractTransaction } from '../../../src/bsv/license-contract';
import { encodeTypedRecordScript } from '../../../src/bsv/record';
import wallet from './license-contract-wallet.json';

export { wallet };

export const config: ChainConfig = {
  network: 'testnet',
  providerBaseUrl: 'https://api.whatsonchain.com/v1/bsv/test',
  anchorAddress: '',
  feeRateSatPerKb: 1,
  collectionId: 'spellforge-leaderboard-testnet',
};

/** The committed artifact's md5 (src/bsv/contracts/artifacts/license.json). */
export const ARTIFACT_MD5 = '7bb5fb1b89692ca39e5d836931223a2d';

/** The committed Fuel artifact's md5 (src/bsv/contracts/artifacts/fuel.json). */
export const FUEL_ARTIFACT_MD5 = '766b4938551d13e90c65d25cbcbe2135';

/** The MINT_FUEL these tests mint with: the e2e's 10,000 sat. */
export const MINT_FUEL = 10_000;

/** Fuel(C)'s FEE_CAP (spec §3.9), compiled into the Fuel artifact. */
export const FEE_CAP = 2_000;

interface SourceFixture {
  txid: string;
  vout: number;
  satoshis: number;
  hex: string;
}

export function utxoOf(source: SourceFixture): Utxo {
  return { txid: source.txid, vout: source.vout, satoshis: source.satoshis };
}

const FIXTURE_SOURCES: SourceFixture[] = [
  wallet.mintFundingTx,
  wallet.writeFundingTx,
  wallet.transferFundingTx,
  wallet.buyerFundingTx,
  wallet.decoyOneSatTx,
];

/** A provider that knows the fixture's funding transactions and `built`; it never broadcasts. */
export function fakeChain(built: Transaction[] = []): ChainProvider {
  return {
    getUtxos: vi.fn().mockResolvedValue([]),
    getTransactionHex: vi.fn(async (txid: string) => {
      const fixture = FIXTURE_SOURCES.find((source) => source.txid === txid);
      if (fixture) return fixture.hex;
      const transaction = built.find((tx) => tx.id('hex') === txid);
      if (transaction) return transaction.toHex();
      throw new Error(`unexpected txid ${txid}`);
    }),
    broadcast: vi.fn().mockRejectedValue(new Error('builders never broadcast')),
    getAddressHistory: vi.fn().mockResolvedValue([]),
  };
}

/** A License + Fuel(C) at MINT_FUEL, minted by the owner to the owner's own key, funded by mintFundingTx. */
export async function mintOwnersLicense(): Promise<BuiltContractTransaction> {
  return buildContractMintTransaction({
    issuerKey: wallet.owner.wif,
    utxos: [utxoOf(wallet.mintFundingTx)],
    holderPubKey: wallet.owner.pubKey,
    mintFuelSatoshis: MINT_FUEL,
    config,
    provider: fakeChain(),
  });
}

/**
 * A step 2 token (mw-5wuz6.3's mint, built here by hand since the builder now mints Fuel):
 * [0] the License, locked by the current artifact, whose fuelScriptHash is hash256 of the
 * stand-in, [1] the stand-in, a P2PKH to the owner carrying the change, [2] an M Data output.
 */
export async function mintOwnersStandInLicense(): Promise<BuiltContractTransaction> {
  const standIn = new P2PKH().lock(wallet.owner.address);
  const licenseScript = LockingScript.fromHex(
    await licenseLockingScript({
      collectionIdHex: Utils.toHex(Utils.toArray(config.collectionId, 'utf8')),
      fuelScriptHashHex: Utils.toHex(Hash.hash256(standIn.toBinary())),
      ownerPubKeyHex: wallet.owner.pubKey,
    }),
  );
  const transaction = new Transaction();
  transaction.addInput({
    sourceTransaction: Transaction.fromHex(wallet.mintFundingTx.hex),
    sourceOutputIndex: wallet.mintFundingTx.vout,
    unlockingScriptTemplate: new P2PKH().unlock(PrivateKey.fromWif(wallet.owner.wif)),
  });
  transaction.addOutput({ lockingScript: licenseScript, satoshis: 1 });
  transaction.addOutput({ lockingScript: standIn, change: true });
  const mintRecord = { collection: config.collectionId, holder: wallet.owner.address };
  transaction.addOutput({ lockingScript: encodeTypedRecordScript('M', Utils.toArray(JSON.stringify(mintRecord), 'utf8')), satoshis: 0 });
  await transaction.fee(new SatoshisPerKilobyte(config.feeRateSatPerKb));
  await transaction.sign();

  const txid = transaction.id('hex');
  const origin = { txid, vout: 0 };
  return {
    transaction,
    hex: transaction.toHex(),
    txid,
    spentOutpoints: [{ txid: wallet.mintFundingTx.txid, vout: wallet.mintFundingTx.vout }],
    token: {
      origin,
      current: origin,
      holderAddress: wallet.owner.address,
      collectionId: config.collectionId,
      lock: 'license',
      artifact: ARTIFACT_MD5,
    },
  };
}

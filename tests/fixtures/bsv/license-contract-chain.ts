// An offline chain for the contract-locked builders' tests (mw-5wuz6.3): a fake provider
// serving the License wallet fixture's funding transactions and any transaction a test has
// built, so a License minted in one test is the source of the write or transfer under test.

import { vi } from 'vitest';
import type { Transaction } from '@bsv/sdk';
import type { ChainProvider } from '../../../src/bsv/chain-provider';
import type { ChainConfig } from '../../../src/bsv/config';
import type { Utxo } from '../../../src/contracts/types';
import { buildContractMintTransaction } from '../../../src/bsv/license-contract';
import type { BuiltContractTransaction } from '../../../src/bsv/license-contract';
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

/** A License minted by the owner to the owner's own key, funded by mintFundingTx. */
export async function mintOwnersLicense(): Promise<BuiltContractTransaction> {
  return buildContractMintTransaction({
    issuerKey: wallet.owner.wif,
    utxos: [utxoOf(wallet.mintFundingTx)],
    holderPubKey: wallet.owner.pubKey,
    config,
    provider: fakeChain(),
  });
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { P2PKH, PrivateKey, Transaction, UnlockingScript } from '@bsv/sdk';
import { db } from '../../src/data/db';
import { bsvWalletRepo, bsvTokenRepo } from '../../src/data/repositories';
import { BsvDebugScreen } from '../../src/features/bsv-debug/bsv-debug-screen';
import { buildMintTransaction } from '../../src/bsv/license-token';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { ChainConfig } from '../../src/bsv/config';
import type { BsvWalletKey, Utxo } from '../../src/contracts/types';
import type { LicenseToken } from '../../src/bsv/license-token';

const ISSUER_WIF = 'cVrqDHmU8NyhzixQUuwNoy72CpRpS3PgpMtoWDB7BYe4oCNwB9N5';
const HOLDER_WIF = 'cRRKfjqDywEvtsG6Xoy4r8RmQPsjeGrETd4ghagSsWRmiKXggB6b';
const holderAddress = PrivateKey.fromWif(HOLDER_WIF).toAddress('testnet');

const config: ChainConfig = {
  network: 'testnet',
  providerBaseUrl: 'https://api.whatsonchain.com/v1/bsv/test',
  anchorAddress: '',
  feeRateSatPerKb: 1,
  collectionId: 'spellforge-leaderboard-testnet',
};

function fundingTx(address: string, satoshis = 5000): { hex: string; txid: string; utxo: Utxo } {
  const tx = new Transaction();
  tx.addOutput({ lockingScript: new P2PKH().lock(address), satoshis });
  const txid = tx.id('hex');
  return { hex: tx.toHex(), txid, utxo: { txid, vout: 0, satoshis } };
}

async function buildOriginMint(): Promise<{ txid: string; hex: string }> {
  const issuerFunding = fundingTx(PrivateKey.fromWif(ISSUER_WIF).toAddress('testnet'));
  const provider: ChainProvider = {
    getUtxos: vi.fn(),
    getTransactionHex: vi.fn((txid: string) =>
      txid === issuerFunding.txid ? Promise.resolve(issuerFunding.hex) : Promise.reject(new Error('unexpected')),
    ),
    broadcast: vi.fn(),
    getAddressHistory: vi.fn().mockResolvedValue([]),
  };
  const built = await buildMintTransaction({
    issuerKey: ISSUER_WIF,
    utxos: [issuerFunding.utxo],
    holderAddress,
    config,
    provider,
  });
  return { txid: built.txid, hex: built.hex };
}

const storedKey: BsvWalletKey = {
  id: 'wallet-1',
  kind: 'wif',
  network: 'testnet',
  material: HOLDER_WIF,
  address: holderAddress,
  createdAt: new Date('2026-01-01'),
};

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('BsvDebugScreen token history', () => {
  it('lists the hops with kind and txid when History is pressed', async () => {
    const mint = await buildOriginMint();
    const token: LicenseToken = {
      origin: { txid: mint.txid, vout: 0 },
      current: { txid: mint.txid, vout: 0 },
      holderAddress,
      collectionId: config.collectionId,
    };
    await bsvWalletRepo.save(storedKey);
    await bsvTokenRepo.put(token);

    const provider: ChainProvider = {
      getUtxos: vi.fn().mockResolvedValue([]),
      getTransactionHex: vi.fn((txid: string) =>
        txid === mint.txid ? Promise.resolve(mint.hex) : Promise.reject(new Error('unexpected')),
      ),
      broadcast: vi.fn(),
      getAddressHistory: vi.fn().mockResolvedValue([]),
    };

    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);

    const historyButton = await screen.findByRole('button', { name: 'History' }, { timeout: 5000 });
    fireEvent.click(historyButton);

    await waitFor(() => {
      expect(screen.getByTestId('bsv-token-history')).toBeInTheDocument();
    });

    const historyPanel = screen.getByTestId('bsv-token-history');
    const hops = within(historyPanel).getAllByTestId('bsv-lineage-hop');
    expect(hops).toHaveLength(1);
    expect(hops[0]).toHaveTextContent('mint');
    expect(hops[0]).toHaveTextContent(mint.txid);
    expect(within(historyPanel).getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('shows a broken lineage line when a hop violates the 1-satoshi rule', async () => {
    const mint = await buildOriginMint();
    const token: LicenseToken = {
      origin: { txid: mint.txid, vout: 0 },
      current: { txid: mint.txid, vout: 0 },
      holderAddress,
      collectionId: config.collectionId,
    };
    await bsvWalletRepo.save(storedKey);
    await bsvTokenRepo.put(token);

    const brokenTx = new Transaction();
    brokenTx.addInput({ sourceTXID: mint.txid, sourceOutputIndex: 0, unlockingScript: new UnlockingScript(), sequence: 0xffffffff });
    brokenTx.addOutput({ lockingScript: new P2PKH().lock(holderAddress), satoshis: 2 });
    const brokenHex = brokenTx.toHex();
    const brokenTxid = brokenTx.id('hex');

    const provider: ChainProvider = {
      getUtxos: vi.fn().mockResolvedValue([]),
      getTransactionHex: vi.fn((txid: string) => {
        if (txid === mint.txid) return Promise.resolve(mint.hex);
        if (txid === brokenTxid) return Promise.resolve(brokenHex);
        return Promise.reject(new Error('unexpected'));
      }),
      broadcast: vi.fn(),
      getAddressHistory: vi.fn().mockResolvedValue([{ txid: brokenTxid, height: 100 }]),
    };

    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);

    const historyButton = await screen.findByRole('button', { name: 'History' }, { timeout: 5000 });
    fireEvent.click(historyButton);

    await waitFor(() => {
      expect(screen.getByText(`lineage broken at ${brokenTxid}`)).toBeInTheDocument();
    });
  });
});

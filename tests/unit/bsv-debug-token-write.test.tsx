import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../../src/data/db';
import { bsvWalletRepo, bsvTokenRepo } from '../../src/data/repositories';
import { BsvDebugScreen } from '../../src/features/bsv-debug/bsv-debug-screen';
import { ChainError } from '../../src/bsv/chain-error';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { BsvWalletKey } from '../../src/contracts/types';
import type { LicenseToken } from '../../src/bsv/license-token';
import wallet from '../fixtures/bsv/license-token-transfer-wallet.json';

const storedKey: BsvWalletKey = {
  id: 'wallet-1',
  kind: 'wif',
  network: 'testnet',
  material: wallet.holderWif,
  address: wallet.holderAddress,
  createdAt: new Date('2026-01-01'),
};

const token: LicenseToken = {
  origin: { txid: wallet.originTx.txid, vout: wallet.originTx.vout },
  current: { txid: wallet.currentTx.txid, vout: wallet.currentTx.vout },
  holderAddress: wallet.holderAddress,
  collectionId: 'spellforge-leaderboard-testnet',
};

function makeProvider(overrides: Partial<ChainProvider> = {}): ChainProvider {
  return {
    getUtxos: vi.fn().mockResolvedValue([
      { txid: wallet.currentTx.txid, vout: wallet.currentTx.vout, satoshis: wallet.currentTx.satoshis },
      { txid: wallet.fundingTx.txid, vout: wallet.fundingTx.vout, satoshis: wallet.fundingTx.satoshis },
    ]),
    getTransactionHex: vi.fn((txid: string) => {
      if (txid === wallet.currentTx.txid) return Promise.resolve(wallet.currentTx.hex);
      if (txid === wallet.fundingTx.txid) return Promise.resolve(wallet.fundingTx.hex);
      return Promise.reject(new Error(`unexpected txid ${txid}`));
    }),
    broadcast: vi.fn().mockResolvedValue('f'.repeat(64)),
    getAddressHistory: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('BsvDebugScreen write with token', () => {
  it('writes a record with a chosen token and shows the txid', async () => {
    await bsvWalletRepo.save(storedKey);
    await bsvTokenRepo.put(token);
    const provider = makeProvider();

    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);

    const textBox = await screen.findByLabelText('Write with token');
    fireEvent.change(textBox, { target: { value: 'level 5 unlocked' } });

    const writeButton = screen.getByRole('button', { name: 'Write with token' });
    await waitFor(() => expect(writeButton).toBeEnabled());

    fireEvent.click(writeButton);

    await waitFor(() => {
      expect(screen.getByText('f'.repeat(64))).toBeInTheDocument();
    });

    expect(provider.broadcast).toHaveBeenCalledTimes(1);
  });

  it('disables Write with token when there is no text', async () => {
    await bsvWalletRepo.save(storedKey);
    await bsvTokenRepo.put(token);
    const provider = makeProvider();

    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);

    await screen.findByLabelText('Write with token');
    const writeButton = screen.getByRole('button', { name: 'Write with token' });

    expect(writeButton).toBeDisabled();
    expect(provider.broadcast).not.toHaveBeenCalled();
  });

  it('shows the readable message when the provider throws a ChainError', async () => {
    await bsvWalletRepo.save(storedKey);
    await bsvTokenRepo.put(token);
    const provider = makeProvider({
      broadcast: vi.fn().mockRejectedValue(new ChainError('Could not reach WhatsOnChain (offline?)')),
    });

    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);

    const textBox = await screen.findByLabelText('Write with token');
    fireEvent.change(textBox, { target: { value: 'level 5 unlocked' } });

    const writeButton = screen.getByRole('button', { name: 'Write with token' });
    await waitFor(() => expect(writeButton).toBeEnabled());

    fireEvent.click(writeButton);

    await waitFor(() => {
      expect(screen.getByText('Could not reach WhatsOnChain (offline?)')).toBeInTheDocument();
    });
  });
});

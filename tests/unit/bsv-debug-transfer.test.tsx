import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { db } from '../../src/data/db';
import { bsvWalletRepo, bsvTokenRepo } from '../../src/data/repositories';
import { BsvDebugScreen } from '../../src/features/bsv-debug/bsv-debug-screen';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { BsvWalletKey } from '../../src/contracts/types';
import type { LicenseToken } from '../../src/bsv/license-token';
import wallet from '../fixtures/bsv/license-token-transfer-wallet.json';

// See tests/unit/bsv-debug-balance.test.tsx: drains the wallet lookup, the balance
// load and TokenPanel's own token-list load without a real-time waitFor deadline.
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await vi.runAllTimersAsync();
    });
  }
}

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
    broadcast: vi.fn().mockResolvedValue('c'.repeat(64)),
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
  vi.useRealTimers();
});

describe('BsvDebugScreen transfer token', () => {
  it('transfers a token to a pasted address and shows the new holder in the list', async () => {
    await bsvWalletRepo.save(storedKey);
    await bsvTokenRepo.put(token);
    const provider = makeProvider();

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    const addressInput = screen.getByLabelText('Transfer to address');
    fireEvent.change(addressInput, { target: { value: wallet.toAddress } });
    await flush();

    const transferButton = screen.getByRole('button', { name: 'Transfer' });
    expect(transferButton).toBeEnabled();

    fireEvent.click(transferButton);
    await flush();

    expect(screen.getByText('c'.repeat(64))).toBeInTheDocument();
    expect(provider.broadcast).toHaveBeenCalledTimes(1);
    expect(screen.getByText(new RegExp(`holder ${wallet.toAddress}`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`current ${'c'.repeat(64)}:0`))).toBeInTheDocument();
  });

  it('disables Transfer when the pasted address is not a valid testnet address', async () => {
    await bsvWalletRepo.save(storedKey);
    await bsvTokenRepo.put(token);
    const provider = makeProvider();

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    const addressInput = screen.getByLabelText('Transfer to address');
    fireEvent.change(addressInput, { target: { value: 'not-a-real-address' } });
    await flush();

    const transferButton = screen.getByRole('button', { name: 'Transfer' });
    expect(transferButton).toBeDisabled();
    expect(provider.broadcast).not.toHaveBeenCalled();
  });
});

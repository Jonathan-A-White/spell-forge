import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { db } from '../../src/data/db';
import { bsvWalletRepo, bsvTokenRepo } from '../../src/data/repositories';
import { BsvDebugScreen } from '../../src/features/bsv-debug/bsv-debug-screen';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { BsvWalletKey } from '../../src/contracts/types';
import type { LicenseToken } from '../../src/bsv/license-token';
import wallet from '../fixtures/bsv/license-token-transfer-wallet.json';

const { transferContractTokenMock } = vi.hoisted(() => ({ transferContractTokenMock: vi.fn() }));

vi.mock('../../src/bsv', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/bsv')>();
  return { ...actual, transferContractToken: transferContractTokenMock };
});

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
  lock: 'p2pkh',
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
  transferContractTokenMock.mockReset();
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

    expect(screen.getByText(/lock p2pkh/)).toBeInTheDocument();

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
    expect(transferContractTokenMock).not.toHaveBeenCalled();
  });

  it('dispatches to the contract transfer builder for a license-locked token, using a pasted public key', async () => {
    await bsvWalletRepo.save(storedKey);
    const licenseToken: LicenseToken = { ...token, lock: 'license', artifact: 'fake-artifact-md5' };
    await bsvTokenRepo.put(licenseToken);
    const provider = makeProvider();
    const buyerPubKey = '0246b2af2c1ff8e4b758b53d803617f6147e03b4322455947ab0edeeb2a6d7ef17';
    transferContractTokenMock.mockResolvedValue({ txid: 'a'.repeat(64) });

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    expect(screen.getByText(/lock license/)).toBeInTheDocument();

    const pubKeyInput = screen.getByLabelText('Transfer to public key');
    fireEvent.change(pubKeyInput, { target: { value: buyerPubKey } });
    await flush();

    const transferButton = screen.getByRole('button', { name: 'Transfer' });
    expect(transferButton).toBeEnabled();

    fireEvent.click(transferButton);
    await flush();

    expect(transferContractTokenMock).toHaveBeenCalledTimes(1);
    const call = transferContractTokenMock.mock.calls[0][0];
    expect(call.token.lock).toBe('license');
    expect(call.toPubKey).toBe(buyerPubKey);
    expect(provider.broadcast).not.toHaveBeenCalled();
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

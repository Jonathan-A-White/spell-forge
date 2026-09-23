import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { db } from '../../src/data/db';
import { bsvWalletRepo } from '../../src/data/repositories';
import { BsvDebugScreen } from '../../src/features/bsv-debug/bsv-debug-screen';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { BsvWalletKey } from '../../src/contracts/types';
import type { LicenseToken } from '../../src/bsv/license-token';
import wallet from '../fixtures/bsv/license-token-mint-wallet.json';

const { mintContractLicenseTokenMock } = vi.hoisted(() => ({ mintContractLicenseTokenMock: vi.fn() }));

vi.mock('../../src/bsv', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/bsv')>();
  return { ...actual, mintContractLicenseToken: mintContractLicenseTokenMock };
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
  material: wallet.issuerWif,
  address: wallet.issuerAddress,
  createdAt: new Date('2026-01-01'),
};

function makeProvider(overrides: Partial<ChainProvider> = {}): ChainProvider {
  return {
    getUtxos: vi.fn().mockResolvedValue([
      { txid: wallet.fundingTx.txid, vout: wallet.fundingTx.vout, satoshis: wallet.fundingTx.satoshis },
    ]),
    getTransactionHex: vi.fn().mockResolvedValue(wallet.fundingTx.hex),
    broadcast: vi.fn().mockResolvedValue('e'.repeat(64)),
    getAddressHistory: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
  mintContractLicenseTokenMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('BsvDebugScreen mint token', () => {
  it('mints to its own address and lists the new token after pressing Mint token', async () => {
    await bsvWalletRepo.save(storedKey);
    const provider = makeProvider();

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    const mintButton = screen.getByRole('button', { name: 'Mint token' });
    expect(mintButton).toBeEnabled();

    fireEvent.click(mintButton);
    await flush();

    expect(screen.getByText('e'.repeat(64))).toBeInTheDocument();
    expect(provider.broadcast).toHaveBeenCalledTimes(1);
    expect(screen.getByText(new RegExp(`origin ${'e'.repeat(64)}:0`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`holder ${wallet.issuerAddress}`))).toBeInTheDocument();
  });

  it('disables Mint token when the wallet has no balance', async () => {
    await bsvWalletRepo.save(storedKey);
    const provider = makeProvider({ getUtxos: vi.fn().mockResolvedValue([]) });

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    expect(screen.getByText('Balance: 0 sat (0 UTXOs)')).toBeInTheDocument();
    const mintButton = screen.getByRole('button', { name: 'Mint token' });
    expect(mintButton).toBeDisabled();
    expect(provider.broadcast).not.toHaveBeenCalled();
  });

  it('defaults the mint lock switch to P2PKH and mints a p2pkh-locked token without calling the contract mint builder', async () => {
    await bsvWalletRepo.save(storedKey);
    const provider = makeProvider();

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    expect(screen.getByRole('radio', { name: 'P2PKH' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'License' })).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Mint token' }));
    await flush();

    expect(screen.getByText('e'.repeat(64))).toBeInTheDocument();
    expect(mintContractLicenseTokenMock).not.toHaveBeenCalled();
    expect(screen.getByText(/lock p2pkh/)).toBeInTheDocument();
  });

  it('mints a License-locked token when License is selected, calling the contract mint builder', async () => {
    await bsvWalletRepo.save(storedKey);
    const provider = makeProvider();
    const licenseOrigin = { txid: 'd'.repeat(64), vout: 0 };
    const licenseToken: LicenseToken = {
      origin: licenseOrigin,
      current: licenseOrigin,
      holderAddress: wallet.issuerAddress,
      collectionId: 'spellforge-leaderboard-testnet',
      lock: 'license',
      artifact: 'fake-artifact-md5',
    };
    mintContractLicenseTokenMock.mockResolvedValue(licenseToken);

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    fireEvent.click(screen.getByRole('radio', { name: 'License' }));
    await flush();

    fireEvent.click(screen.getByRole('button', { name: 'Mint token' }));
    await flush();

    expect(mintContractLicenseTokenMock).toHaveBeenCalledTimes(1);
    const call = mintContractLicenseTokenMock.mock.calls[0][0];
    expect(call.issuerKey).toBe(wallet.issuerWif);
    expect(provider.broadcast).not.toHaveBeenCalled();
    expect(screen.getByText(new RegExp(`origin ${'d'.repeat(64)}:0`))).toBeInTheDocument();
    expect(screen.getByText(/lock license/)).toBeInTheDocument();
    expect(screen.getByText(/artifact fake-artifact-md5/)).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { db } from '../../src/data/db';
import { bsvWalletRepo } from '../../src/data/repositories';
import { BsvDebugScreen } from '../../src/features/bsv-debug/bsv-debug-screen';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { BsvWalletKey } from '../../src/contracts/types';
import wallet from '../fixtures/bsv/license-token-mint-wallet.json';

// See tests/unit/bsv-debug-balance.test.tsx: drains the wallet lookup and the balance
// load without a real-time waitFor deadline.
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
    broadcast: vi.fn().mockResolvedValue('a'.repeat(64)),
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

describe('BsvDebugScreen send sats', () => {
  it('shows the broadcast txid after entering an address and amount and pressing Send', async () => {
    await bsvWalletRepo.save(storedKey);
    const provider = makeProvider();

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    fireEvent.change(screen.getByLabelText('To address'), { target: { value: wallet.holderAddress } });
    fireEvent.change(screen.getByLabelText('Amount (satoshis)'), { target: { value: '1500' } });

    const sendButton = screen.getByRole('button', { name: 'Send' });
    expect(sendButton).toBeEnabled();

    fireEvent.click(sendButton);
    await flush();

    expect(screen.getByTestId('bsv-send-txid')).toHaveTextContent('a'.repeat(64));
    expect(provider.broadcast).toHaveBeenCalledTimes(1);
  });

  it('disables Send when the entered amount is over the spendable balance', async () => {
    await bsvWalletRepo.save(storedKey);
    const provider = makeProvider();

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    fireEvent.change(screen.getByLabelText('To address'), { target: { value: wallet.holderAddress } });
    fireEvent.change(screen.getByLabelText('Amount (satoshis)'), { target: { value: '6000' } });

    const sendButton = screen.getByRole('button', { name: 'Send' });
    expect(sendButton).toBeDisabled();
    expect(provider.broadcast).not.toHaveBeenCalled();
  });

  it('has no Send button when there is no stored key', async () => {
    const provider = makeProvider();

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
  });
});

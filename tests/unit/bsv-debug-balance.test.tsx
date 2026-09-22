import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { db } from '../../src/data/db';
import { bsvWalletRepo } from '../../src/data/repositories';
import { BsvDebugScreen } from '../../src/features/bsv-debug/bsv-debug-screen';
import { ChainError } from '../../src/bsv/chain-error';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { BsvWalletKey } from '../../src/contracts/types';

// Every render's async settle (wallet lookup, then the balance load that
// lookup's state update triggers) resolves through fake-indexeddb, which
// schedules its callbacks with setImmediate. React only queues the next
// effect's setImmediate once the previous act() round has committed, so one
// round of runAllTimersAsync only drains the wallet lookup; a second round is
// needed to drain the balance load it kicks off. Looping a few rounds drains
// any such chain deterministically — no waitFor polling against a real-time
// deadline that contention can blow past.
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
  material: 'cQfJvfEVAsQXCAcxzDBB3kmEwLtiZaGUHL9sXQJF6kjaDwJDvv2V',
  address: 'mpHF9jLctkpJfgBkksYVbdVvhqcYm5MS2b',
  createdAt: new Date('2026-01-01'),
};

function makeProvider(overrides: Partial<ChainProvider> = {}): ChainProvider {
  return {
    getUtxos: vi.fn().mockResolvedValue([]),
    getTransactionHex: vi.fn().mockRejectedValue(new Error('not implemented')),
    broadcast: vi.fn().mockRejectedValue(new Error('not implemented')),
    getAddressHistory: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('BsvDebugScreen balance', () => {
  it('shows no balance section when there is no stored key', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() => {
      throw new Error('must not touch the network');
    });
    const provider = makeProvider();

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    expect(screen.getByRole('button', { name: 'Generate key' })).toBeInTheDocument();
    expect(screen.queryByText(/Balance:/)).not.toBeInTheDocument();
    expect(provider.getUtxos).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('shows the summed balance and UTXO count for a stored key', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() => {
      throw new Error('must not touch the network');
    });
    await bsvWalletRepo.save(storedKey);
    const provider = makeProvider({
      getUtxos: vi.fn().mockResolvedValue([
        { txid: 'a', vout: 0, satoshis: 600, height: 100 },
        { txid: 'b', vout: 1, satoshis: 400, height: 100 },
      ]),
    });

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    expect(screen.getByText('Balance: 1000 sat (2 UTXOs)')).toBeInTheDocument();

    fetchSpy.mockRestore();
  });

  it('shows a readable error and a usable Refresh button when the provider throws a ChainError', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() => {
      throw new Error('must not touch the network');
    });
    await bsvWalletRepo.save(storedKey);
    const provider = makeProvider({
      getUtxos: vi.fn().mockRejectedValue(new ChainError('Could not reach WhatsOnChain (offline?)')),
    });

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    expect(screen.getByText('Could not reach WhatsOnChain (offline?)')).toBeInTheDocument();
    const refreshButton = screen.getByRole('button', { name: 'Refresh' });
    expect(refreshButton).toBeEnabled();

    fetchSpy.mockRestore();
  });

  it('calls getUtxos again when Refresh is pressed', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() => {
      throw new Error('must not touch the network');
    });
    await bsvWalletRepo.save(storedKey);
    const provider = makeProvider({
      getUtxos: vi
        .fn()
        .mockResolvedValueOnce([{ txid: 'a', vout: 0, satoshis: 600, height: 100 }])
        .mockResolvedValueOnce([
          { txid: 'a', vout: 0, satoshis: 600, height: 100 },
          { txid: 'b', vout: 1, satoshis: 400, height: 100 },
        ]),
    });

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    expect(screen.getByText('Balance: 600 sat (1 UTXOs)')).toBeInTheDocument();
    const refreshButton = screen.getByRole('button', { name: 'Refresh' });
    expect(refreshButton).toBeEnabled();

    fireEvent.click(refreshButton);
    await flush();

    expect(screen.getByText('Balance: 1000 sat (2 UTXOs)')).toBeInTheDocument();
    expect(provider.getUtxos).toHaveBeenCalledTimes(2);

    fetchSpy.mockRestore();
  });
});

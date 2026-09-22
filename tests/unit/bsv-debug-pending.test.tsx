import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../../src/data/db';
import { bsvWalletRepo } from '../../src/data/repositories';
import { BsvDebugScreen } from '../../src/features/bsv-debug/bsv-debug-screen';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { BsvWalletKey, Utxo } from '../../src/contracts/types';

const { writeRecordMock } = vi.hoisted(() => ({ writeRecordMock: vi.fn() }));

vi.mock('../../src/bsv', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/bsv')>();
  return { ...actual, writeRecord: writeRecordMock };
});

const storedKey: BsvWalletKey = {
  id: 'wallet-1',
  kind: 'wif',
  network: 'testnet',
  material: 'cQfJvfEVAsQXCAcxzDBB3kmEwLtiZaGUHL9sXQJF6kjaDwJDvv2V',
  address: 'mpHF9jLctkpJfgBkksYVbdVvhqcYm5MS2b',
  createdAt: new Date('2026-01-01'),
};

const x1: Utxo = { txid: 'x', vout: 1, satoshis: 1 };
const x2: Utxo = { txid: 'x', vout: 2, satoshis: 49999 };
const y1: Utxo = { txid: 'y', vout: 1, satoshis: 1 };
const y2: Utxo = { txid: 'y', vout: 2, satoshis: 49997 };

const T1 = '1'.repeat(64);
const T2 = '2'.repeat(64);

function makeProvider(overrides: Partial<ChainProvider> = {}): ChainProvider {
  return {
    getUtxos: vi.fn().mockResolvedValue([]),
    getTransactionHex: vi.fn().mockRejectedValue(new Error('not implemented')),
    broadcast: vi.fn().mockRejectedValue(new Error('not implemented')),
    getAddressHistory: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

async function writeOnce() {
  const writeButton = screen.getByRole('button', { name: 'Write' });
  await waitFor(() => expect(writeButton).toBeEnabled());
  fireEvent.click(writeButton);
  await waitFor(() => expect(writeRecordMock).toHaveBeenCalled());
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  writeRecordMock.mockReset();
  localStorage.clear();
  localStorage.setItem('sf-bsv-anchor', 'mfx7Vdf1UVMZcRbYcjVNTrHbP3tRKSYsXy');
});

afterEach(() => {
  cleanup();
});

describe('BsvDebugScreen pending spend exclusion', () => {
  it('excludes UTXOs spent by a pending write from the balance and the next write', async () => {
    await bsvWalletRepo.save(storedKey);
    const getUtxos = vi
      .fn()
      .mockResolvedValueOnce([x1, x2]) // mount
      .mockResolvedValueOnce([x1, x2]) // fresh list before first write
      .mockResolvedValue([x1, x2, y1, y2]); // still double-listed until confirmed
    const provider = makeProvider({ getUtxos });
    writeRecordMock.mockResolvedValueOnce({ txid: T1 }).mockResolvedValueOnce({ txid: T2 });

    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);

    await screen.findByRole('button', { name: 'Write' });
    fireEvent.change(screen.getByLabelText('Write a record'), { target: { value: 'hello nftgate' } });
    await writeOnce();

    await waitFor(() => {
      expect(screen.getByText('Balance: 49998 sat (2 UTXOs, 2 pending)')).toBeInTheDocument();
    });

    await writeOnce();

    expect(writeRecordMock).toHaveBeenCalledTimes(2);
    expect(writeRecordMock.mock.calls[1][0].utxos).toEqual([y1, y2]);
  });

  it('drops the pending entry and clears the pending count once the spent outpoints no longer appear', async () => {
    await bsvWalletRepo.save(storedKey);
    const getUtxos = vi
      .fn()
      .mockResolvedValueOnce([x1, x2]) // mount
      .mockResolvedValueOnce([x1, x2]) // fresh list before write
      .mockResolvedValueOnce([x1, x2, y1, y2]) // loadBalance right after broadcast: still double-listed
      .mockResolvedValueOnce([y1, y2]); // confirmed: x1/x2 no longer unspent
    const provider = makeProvider({ getUtxos });
    writeRecordMock.mockResolvedValueOnce({ txid: T1 });

    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);

    await screen.findByRole('button', { name: 'Write' });
    fireEvent.change(screen.getByLabelText('Write a record'), { target: { value: 'hello nftgate' } });
    await writeOnce();

    await waitFor(() => {
      expect(screen.getByText('Balance: 49998 sat (2 UTXOs, 2 pending)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      expect(screen.getByText('Balance: 49998 sat (2 UTXOs)')).toBeInTheDocument();
    });
    expect(screen.queryByText(/pending/)).not.toBeInTheDocument();
  });

  it('keeps applying the pending exclusion after a fresh mount against the same database', async () => {
    await bsvWalletRepo.save(storedKey);
    const getUtxos = vi
      .fn()
      .mockResolvedValueOnce([x1, x2]) // mount
      .mockResolvedValueOnce([x1, x2]) // fresh list before write
      .mockResolvedValue([x1, x2, y1, y2]); // still double-listed after broadcast and on the next mount
    const provider = makeProvider({ getUtxos });
    writeRecordMock.mockResolvedValueOnce({ txid: T1 });

    const { unmount } = render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);

    await screen.findByRole('button', { name: 'Write' });
    fireEvent.change(screen.getByLabelText('Write a record'), { target: { value: 'hello nftgate' } });
    await writeOnce();

    await waitFor(() => {
      expect(screen.getByText('Balance: 49998 sat (2 UTXOs, 2 pending)')).toBeInTheDocument();
    });

    unmount();

    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);

    await waitFor(() => {
      expect(screen.getByText('Balance: 49998 sat (2 UTXOs, 2 pending)')).toBeInTheDocument();
    });
  });
});

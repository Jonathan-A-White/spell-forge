import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { db } from '../../src/data/db';
import { bsvWalletRepo, bsvPendingSpendRepo } from '../../src/data/repositories';
import { BsvDebugScreen } from '../../src/features/bsv-debug/bsv-debug-screen';
import { outpointKey, reconcilePendingSpends, filterUtxosExcludingPending } from '../../src/bsv';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { BsvWalletKey, Utxo } from '../../src/contracts/types';

// See tests/unit/bsv-debug-balance.test.tsx: drains the wallet lookup and the
// balance load without a real-time waitFor deadline.
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await vi.runAllTimersAsync();
    });
  }
}

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

// Mirrors writeRecord's own pending-spend bookkeeping (mw-b00z.10): writeRecord is mocked
// out here to avoid real signing/broadcast, so the mock must do the reconcile-and-record
// step itself against the real (fake-indexeddb) bsvPendingSpendRepo for the screen's
// balance/pending display to reflect it, the same way the real function would.
async function fakeWriteRecord(utxos: Utxo[], txid: string): Promise<{ txid: string }> {
  const pendingEntries = await bsvPendingSpendRepo.getAll();
  const { remaining, dropped } = reconcilePendingSpends(pendingEntries, utxos, new Date());
  if (dropped.length > 0) {
    await bsvPendingSpendRepo.removeMany(dropped);
  }
  const { utxos: filtered } = filterUtxosExcludingPending(utxos, remaining);
  await bsvPendingSpendRepo.add({ txid, outpoints: filtered.map(outpointKey), createdAt: new Date() });
  return { txid };
}

async function writeOnce() {
  const writeButton = screen.getByRole('button', { name: 'Write' });
  await flush();
  expect(writeButton).toBeEnabled();
  fireEvent.click(writeButton);
  await flush();
  expect(writeRecordMock).toHaveBeenCalled();
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
  vi.useRealTimers();
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
    writeRecordMock
      .mockImplementationOnce((params: { utxos: Utxo[] }) => fakeWriteRecord(params.utxos, T1))
      .mockImplementationOnce((params: { utxos: Utxo[] }) => fakeWriteRecord(params.utxos, T2));

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    fireEvent.change(screen.getByLabelText('Write a record'), { target: { value: 'hello nftgate' } });
    await writeOnce();

    expect(screen.getByText('Balance: 49998 sat (2 UTXOs, 2 pending)')).toBeInTheDocument();

    await writeOnce();

    expect(writeRecordMock).toHaveBeenCalledTimes(2);
    // writeRecord now does its own pending-exclusion internally (mw-b00z.10), so the
    // screen passes the fresh, unfiltered UTXO list straight through.
    expect(writeRecordMock.mock.calls[1][0].utxos).toEqual([x1, x2, y1, y2]);
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
    writeRecordMock.mockImplementationOnce((params: { utxos: Utxo[] }) => fakeWriteRecord(params.utxos, T1));

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    fireEvent.change(screen.getByLabelText('Write a record'), { target: { value: 'hello nftgate' } });
    await writeOnce();

    expect(screen.getByText('Balance: 49998 sat (2 UTXOs, 2 pending)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await flush();

    expect(screen.getByText('Balance: 49998 sat (2 UTXOs)')).toBeInTheDocument();
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
    writeRecordMock.mockImplementationOnce((params: { utxos: Utxo[] }) => fakeWriteRecord(params.utxos, T1));

    vi.useFakeTimers();
    const { unmount } = render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    fireEvent.change(screen.getByLabelText('Write a record'), { target: { value: 'hello nftgate' } });
    await writeOnce();

    expect(screen.getByText('Balance: 49998 sat (2 UTXOs, 2 pending)')).toBeInTheDocument();

    unmount();

    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    expect(screen.getByText('Balance: 49998 sat (2 UTXOs, 2 pending)')).toBeInTheDocument();
  });
});

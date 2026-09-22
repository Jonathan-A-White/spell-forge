import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { db } from '../../src/data/db';
import { bsvWalletRepo } from '../../src/data/repositories';
import { BsvDebugScreen } from '../../src/features/bsv-debug/bsv-debug-screen';
import { ChainError } from '../../src/bsv/chain-error';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { BsvWalletKey } from '../../src/contracts/types';

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

function makeProvider(overrides: Partial<ChainProvider> = {}): ChainProvider {
  return {
    getUtxos: vi.fn().mockResolvedValue([{ txid: 'a', vout: 0, satoshis: 600, height: 100 }]),
    getTransactionHex: vi.fn().mockRejectedValue(new Error('not implemented')),
    broadcast: vi.fn().mockRejectedValue(new Error('not implemented')),
    getAddressHistory: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  writeRecordMock.mockReset();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('BsvDebugScreen write record', () => {
  it('shows the txid returned by writeRecord after entering text and pressing Write', async () => {
    await bsvWalletRepo.save(storedKey);
    localStorage.setItem('sf-bsv-anchor', 'mfx7Vdf1UVMZcRbYcjVNTrHbP3tRKSYsXy');
    writeRecordMock.mockResolvedValue({ txid: 'a'.repeat(64) });
    const provider = makeProvider();

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    const writeButton = screen.getByRole('button', { name: 'Write' });
    expect(writeButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Write a record'), { target: { value: 'hello nftgate' } });
    await flush();

    expect(writeButton).toBeEnabled();
    fireEvent.click(writeButton);
    await flush();

    expect(screen.getByText('a'.repeat(64))).toBeInTheDocument();
    expect(writeRecordMock).toHaveBeenCalledTimes(1);
    const call = writeRecordMock.mock.calls[0][0];
    expect(call.key).toBe(storedKey.material);
    expect(call.payload.text).toBe('hello nftgate');
    expect(call.config.anchorAddress).toBe('mfx7Vdf1UVMZcRbYcjVNTrHbP3tRKSYsXy');
  });

  it('shows a readable error when writeRecord rejects', async () => {
    await bsvWalletRepo.save(storedKey);
    localStorage.setItem('sf-bsv-anchor', 'mfx7Vdf1UVMZcRbYcjVNTrHbP3tRKSYsXy');
    writeRecordMock.mockRejectedValue(new Error('No UTXOs available — fund this wallet before writing a record'));
    const provider = makeProvider();

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    const writeButton = screen.getByRole('button', { name: 'Write' });
    fireEvent.change(screen.getByLabelText('Write a record'), { target: { value: 'hello nftgate' } });
    await flush();

    expect(writeButton).toBeEnabled();
    fireEvent.click(writeButton);
    await flush();

    expect(screen.getByText('No UTXOs available — fund this wallet before writing a record')).toBeInTheDocument();
  });

  it('disables Write with no stored key', async () => {
    const provider = makeProvider();

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    expect(screen.getByRole('button', { name: 'Generate key' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Write' })).not.toBeInTheDocument();
  });

  it('disables Write when the wallet has no balance', async () => {
    await bsvWalletRepo.save(storedKey);
    const provider = makeProvider({ getUtxos: vi.fn().mockResolvedValue([]) });

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    const writeButton = screen.getByRole('button', { name: 'Write' });
    fireEvent.change(screen.getByLabelText('Write a record'), { target: { value: 'hello nftgate' } });
    await flush();

    expect(screen.getByText('Balance: 0 sat (0 UTXOs)')).toBeInTheDocument();
    expect(writeButton).toBeDisabled();
    expect(writeRecordMock).not.toHaveBeenCalled();
  });

  it('fetches a fresh UTXO list right before broadcasting, not the list cached from mount', async () => {
    await bsvWalletRepo.save(storedKey);
    localStorage.setItem('sf-bsv-anchor', 'mfx7Vdf1UVMZcRbYcjVNTrHbP3tRKSYsXy');
    writeRecordMock.mockResolvedValue({ txid: 'a'.repeat(64) });
    const mountUtxos = [{ txid: 'first', vout: 0, satoshis: 600, height: 100 }];
    const freshUtxos = [{ txid: 'second', vout: 0, satoshis: 900, height: 101 }];
    const reloadedUtxos = [{ txid: 'third', vout: 0, satoshis: 1200, height: 102 }];
    const getUtxos = vi
      .fn()
      .mockResolvedValueOnce(mountUtxos)
      .mockResolvedValueOnce(freshUtxos)
      .mockResolvedValueOnce(reloadedUtxos);
    const provider = makeProvider({ getUtxos });

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    const writeButton = screen.getByRole('button', { name: 'Write' });
    expect(getUtxos).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Balance: 600 sat (1 UTXOs)')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Write a record'), { target: { value: 'hello nftgate' } });
    await flush();

    expect(writeButton).toBeEnabled();
    fireEvent.click(writeButton);
    await flush();

    expect(writeRecordMock).toHaveBeenCalledTimes(1);
    expect(writeRecordMock.mock.calls[0][0].utxos).toEqual(freshUtxos);
    expect(getUtxos.mock.invocationCallOrder[1]).toBeLessThan(writeRecordMock.mock.invocationCallOrder[0]);
  });

  it('reloads the balance from a fresh getUtxos call after a successful broadcast', async () => {
    await bsvWalletRepo.save(storedKey);
    localStorage.setItem('sf-bsv-anchor', 'mfx7Vdf1UVMZcRbYcjVNTrHbP3tRKSYsXy');
    writeRecordMock.mockResolvedValue({ txid: 'a'.repeat(64) });
    const mountUtxos = [{ txid: 'first', vout: 0, satoshis: 600, height: 100 }];
    const freshUtxos = [{ txid: 'second', vout: 0, satoshis: 900, height: 101 }];
    const reloadedUtxos = [{ txid: 'third', vout: 0, satoshis: 1200, height: 102 }];
    const getUtxos = vi
      .fn()
      .mockResolvedValueOnce(mountUtxos)
      .mockResolvedValueOnce(freshUtxos)
      .mockResolvedValueOnce(reloadedUtxos);
    const provider = makeProvider({ getUtxos });

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    const writeButton = screen.getByRole('button', { name: 'Write' });
    expect(getUtxos).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Write a record'), { target: { value: 'hello nftgate' } });
    await flush();

    expect(writeButton).toBeEnabled();
    fireEvent.click(writeButton);
    await flush();

    expect(getUtxos).toHaveBeenCalledTimes(3);
    expect(screen.getByText('Balance: 1200 sat (1 UTXOs)')).toBeInTheDocument();
  });

  it('shows the whole ChainError message, including the WhatsOnChain-reported reason, when the write fails', async () => {
    await bsvWalletRepo.save(storedKey);
    localStorage.setItem('sf-bsv-anchor', 'mfx7Vdf1UVMZcRbYcjVNTrHbP3tRKSYsXy');
    writeRecordMock.mockRejectedValue(
      new ChainError('WhatsOnChain said 400: bad-txns-inputs-missingorspent'),
    );
    const provider = makeProvider();

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    const writeButton = screen.getByRole('button', { name: 'Write' });
    fireEvent.change(screen.getByLabelText('Write a record'), { target: { value: 'hello nftgate' } });
    await flush();

    expect(writeButton).toBeEnabled();
    fireEvent.click(writeButton);
    await flush();

    expect(
      screen.getByText('WhatsOnChain said 400: bad-txns-inputs-missingorspent'),
    ).toBeInTheDocument();
  });
});

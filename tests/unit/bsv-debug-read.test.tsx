import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../../src/data/db';
import { bsvWalletRepo } from '../../src/data/repositories';
import { BsvDebugScreen } from '../../src/features/bsv-debug/bsv-debug-screen';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { BsvWalletKey } from '../../src/contracts/types';
import txFixture from '../fixtures/bsv/record-transaction.json';

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
    getTransactionHex: vi.fn().mockResolvedValue(txFixture.mixedTxHex),
    broadcast: vi.fn().mockRejectedValue(new Error('not implemented')),
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

describe('BsvDebugScreen read by txid', () => {
  it('shows the record text and ts after entering a txid and pressing Read', async () => {
    await bsvWalletRepo.save(storedKey);
    const provider = makeProvider();

    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);

    const txidInput = await screen.findByLabelText('Read by txid');
    fireEvent.change(txidInput, { target: { value: 'a'.repeat(64) } });
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));

    await waitFor(() => {
      expect(screen.getByText(txFixture.payload.text)).toBeInTheDocument();
    });
    expect(screen.getByText(txFixture.payload.ts)).toBeInTheDocument();
    expect(provider.getTransactionHex).toHaveBeenCalledWith('a'.repeat(64));
  });

  it('shows "no nftgate record in this transaction" for a transaction with no record', async () => {
    await bsvWalletRepo.save(storedKey);
    const provider = makeProvider({ getTransactionHex: vi.fn().mockResolvedValue(txFixture.noRecordTxHex) });

    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);

    const txidInput = await screen.findByLabelText('Read by txid');
    fireEvent.change(txidInput, { target: { value: 'b'.repeat(64) } });
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));

    await waitFor(() => {
      expect(screen.getByText('no nftgate record in this transaction')).toBeInTheDocument();
    });
  });

  it('shows a readable error when the txid is not valid', async () => {
    const provider = makeProvider();

    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);

    const txidInput = await screen.findByLabelText('Read by txid');
    fireEvent.change(txidInput, { target: { value: 'not-a-txid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));

    await waitFor(() => {
      expect(screen.getByText(/transaction id/i)).toBeInTheDocument();
    });
    expect(provider.getTransactionHex).not.toHaveBeenCalled();
  });

  it('works with no wallet key stored, since reading needs no key', async () => {
    const provider = makeProvider();

    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);

    const txidInput = await screen.findByLabelText('Read by txid');
    fireEvent.change(txidInput, { target: { value: 'a'.repeat(64) } });
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));

    await waitFor(() => {
      expect(screen.getByText(txFixture.payload.text)).toBeInTheDocument();
    });
  });
});

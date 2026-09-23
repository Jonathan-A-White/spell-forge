import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../../src/data/db';
import { BsvDebugScreen } from '../../src/features/bsv-debug/bsv-debug-screen';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { AddressHistoryEntry } from '../../src/contracts/types';
import fixture from '../fixtures/bsv/scan-history.json';

const ANCHOR_ADDRESS_STORAGE_KEY = 'sf-bsv-anchor';

function makeProvider(overrides: Partial<ChainProvider> = {}): ChainProvider {
  return {
    getUtxos: vi.fn().mockResolvedValue([]),
    getTransactionHex: vi.fn(),
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

describe('BsvDebugScreen scan by anchor', () => {
  it('disables Scan with a one-line reason when no anchor address is set', () => {
    const provider = makeProvider();

    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);

    const scanButton = screen.getByRole('button', { name: 'Scan' });
    expect(scanButton).toBeDisabled();
    expect(screen.getByText('Set an anchor address above before scanning')).toBeInTheDocument();
  });

  it('lists the two texts newest first after pressing Scan', async () => {
    localStorage.setItem(ANCHOR_ADDRESS_STORAGE_KEY, fixture.anchorAddress);
    const txHexByTxid: Record<string, string> = {
      [fixture.recordNewestTxid]: fixture.recordNewestTxHex,
      [fixture.recordOldestTxid]: fixture.recordOldestTxHex,
    };
    const history: AddressHistoryEntry[] = [
      { txid: fixture.recordOldestTxid, height: 200000 },
      { txid: fixture.recordNewestTxid, height: 500000 },
    ];
    const provider = makeProvider({
      getAddressHistory: vi.fn().mockResolvedValue(history),
      getTransactionHex: vi.fn((txid: string) => Promise.resolve(txHexByTxid[txid])),
    });

    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);

    const scanButton = screen.getByRole('button', { name: 'Scan' });
    expect(scanButton).not.toBeDisabled();
    fireEvent.click(scanButton);

    await waitFor(() => {
      expect(screen.getByText(fixture.recordNewestPayload.text)).toBeInTheDocument();
    });
    expect(screen.getByText(fixture.recordOldestPayload.text)).toBeInTheDocument();

    const texts = screen.getAllByText(/record$/).map((el) => el.textContent);
    expect(texts).toEqual([fixture.recordNewestPayload.text, fixture.recordOldestPayload.text]);
  });

  it('renders a plain payment to the anchor as sats received, not a record', async () => {
    localStorage.setItem(ANCHOR_ADDRESS_STORAGE_KEY, fixture.anchorAddress);
    const history: AddressHistoryEntry[] = [{ txid: fixture.plainPaymentTxid, height: 100000 }];
    const provider = makeProvider({
      getAddressHistory: vi.fn().mockResolvedValue(history),
      getTransactionHex: vi.fn().mockResolvedValue(fixture.plainPaymentTxHex),
    });

    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);

    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));

    await waitFor(() => {
      expect(screen.getByText('5,000 sat received, not a record')).toBeInTheDocument();
    });
  });

  it('keeps "could not read" (with a reason) for a data output the reader cannot decode', async () => {
    localStorage.setItem(ANCHOR_ADDRESS_STORAGE_KEY, fixture.anchorAddress);
    const history: AddressHistoryEntry[] = [{ txid: fixture.foreignOpReturnTxid, height: 300000 }];
    const provider = makeProvider({
      getAddressHistory: vi.fn().mockResolvedValue(history),
      getTransactionHex: vi.fn().mockResolvedValue(fixture.foreignOpReturnTxHex),
    });

    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);

    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));

    await waitFor(() => {
      expect(screen.getByText(`could not read (${fixture.foreignOpReturnReason})`)).toBeInTheDocument();
    });
  });

  it('shows "no records yet at this anchor" for an empty history', async () => {
    localStorage.setItem(ANCHOR_ADDRESS_STORAGE_KEY, fixture.anchorAddress);
    const provider = makeProvider({ getAddressHistory: vi.fn().mockResolvedValue([]) });

    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);

    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));

    await waitFor(() => {
      expect(screen.getByText('no records yet at this anchor')).toBeInTheDocument();
    });
    expect(provider.getTransactionHex).not.toHaveBeenCalled();
  });
});

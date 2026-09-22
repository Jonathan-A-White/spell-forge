import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { db } from '../../src/data/db';
import { bsvWalletRepo } from '../../src/data/repositories';
import { BsvDebugScreen } from '../../src/features/bsv-debug/bsv-debug-screen';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(() => {
  cleanup();
});

describe('BsvDebugScreen wallet', () => {
  it('shows Generate key and no address when no key is stored', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');

    render(<BsvDebugScreen onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Generate key' })).toBeInTheDocument();
    });
    expect(screen.queryByText(/^m[a-zA-Z0-9]{20,}/)).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('generates a key, shows the address and a QR svg, and persists it in the repository', async () => {
    render(<BsvDebugScreen onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Generate key' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Generate key' }));

    await waitFor(async () => {
      const stored = await bsvWalletRepo.getCurrent();
      expect(stored).toBeDefined();
    });

    const stored = await bsvWalletRepo.getCurrent();
    expect(stored?.kind).toBe('wif');
    expect(stored?.network).toBe('testnet');

    await waitFor(() => {
      expect(screen.getByText(stored!.address)).toBeInTheDocument();
    });

    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('wipes the key after Wipe key is pressed and confirmed', async () => {
    render(<BsvDebugScreen onBack={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Generate key' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate key' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Wipe key' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Wipe key' }));

    const confirmButton = await screen.findByRole('button', { name: 'Confirm wipe' });
    fireEvent.click(confirmButton);

    await waitFor(async () => {
      expect(await bsvWalletRepo.getCurrent()).toBeUndefined();
    });
    expect(screen.getByRole('button', { name: 'Generate key' })).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { db } from '../../src/data/db';
import { bsvWalletRepo } from '../../src/data/repositories';
import { BsvDebugScreen } from '../../src/features/bsv-debug/bsv-debug-screen';

// See tests/unit/bsv-debug-balance.test.tsx: drains the wallet lookup and the
// balance load without a real-time waitFor deadline.
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await vi.runAllTimersAsync();
    });
  }
}

// Reads through fake-indexeddb, which also schedules its callbacks with the
// (now fake) setImmediate — draining timers here is what lets the promise settle.
async function getStoredWallet() {
  const pending = bsvWalletRepo.getCurrent();
  await flush();
  return pending;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('BsvDebugScreen wallet', () => {
  it('shows Generate key and no address when no key is stored', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} />);
    await flush();

    expect(screen.getByRole('button', { name: 'Generate key' })).toBeInTheDocument();
    expect(screen.queryByText(/^m[a-zA-Z0-9]{20,}/)).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('generates a key, shows the address and a QR svg, and persists it in the repository', async () => {
    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} />);
    await flush();

    expect(screen.getByRole('button', { name: 'Generate key' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Generate key' }));
    await flush();

    const stored = await getStoredWallet();
    expect(stored).toBeDefined();
    expect(stored?.kind).toBe('wif');
    expect(stored?.network).toBe('testnet');
    expect(screen.getByText(stored!.address)).toBeInTheDocument();

    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('wipes the key after Wipe key is pressed and confirmed', async () => {
    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} />);
    await flush();

    expect(screen.getByRole('button', { name: 'Generate key' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Generate key' }));
    await flush();

    expect(screen.getByRole('button', { name: 'Wipe key' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Wipe key' }));
    await flush();

    const confirmButton = screen.getByRole('button', { name: 'Confirm wipe' });
    fireEvent.click(confirmButton);
    await flush();

    expect(await getStoredWallet()).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Generate key' })).toBeInTheDocument();
  });
});

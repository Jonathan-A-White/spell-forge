// tests/unit/bsv-debug-token-fuel.test.tsx — A License-locked token's row shows its live
// Fuel(C) value and writes-left range, read from the chain; offline, the last value seen
// with its age; a step 2 token shows 'stand-in' (mw-yo97u.4).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { LockingScript, P2PKH, PrivateKey, Transaction } from '@bsv/sdk';
import { db } from '../../src/data/db';
import { bsvWalletRepo, bsvTokenRepo } from '../../src/data/repositories';
import { BsvDebugScreen } from '../../src/features/bsv-debug/bsv-debug-screen';
import { MEASURED_WRITE_SIZE_BYTES } from '../../src/bsv/fuel-status';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { BsvWalletKey } from '../../src/contracts/types';
import type { LicenseToken } from '../../src/bsv/license-token';

const HOLDER_WIF = 'cRRKfjqDywEvtsG6Xoy4r8RmQPsjeGrETd4ghagSsWRmiKXggB6b';
const holderAddress = PrivateKey.fromWif(HOLDER_WIF).toAddress('testnet');

const storedKey: BsvWalletKey = {
  id: 'wallet-1',
  kind: 'wif',
  network: 'testnet',
  material: HOLDER_WIF,
  address: holderAddress,
  createdAt: new Date('2026-01-01'),
};

function tokenTx(script: LockingScript, satoshis: number): { txid: string; hex: string } {
  const tx = new Transaction();
  tx.addOutput({ lockingScript: new P2PKH().lock(holderAddress), satoshis: 1 }); // output 0: the License
  tx.addOutput({ lockingScript: script, satoshis }); // output 1: the Fuel or its stand-in
  return { txid: tx.id('hex'), hex: tx.toHex() };
}

function makeProvider(overrides: Partial<ChainProvider> = {}): ChainProvider {
  return {
    getUtxos: vi.fn().mockResolvedValue([]),
    getTransactionHex: vi.fn().mockRejectedValue(new Error('unexpected txid')),
    broadcast: vi.fn(),
    getAddressHistory: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await vi.runAllTimersAsync();
    });
  }
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

describe('BsvDebugScreen token fuel display', () => {
  it("shows a License + Fuel token's live fuel value and writes-left range when online", async () => {
    const fuelScript = new LockingScript().writeBin(new Array(1200).fill(0xab));
    const current = tokenTx(fuelScript, 10000);
    const token: LicenseToken = {
      origin: { txid: current.txid, vout: 0 },
      current: { txid: current.txid, vout: 0 },
      holderAddress,
      collectionId: 'spellforge-leaderboard-testnet',
      lock: 'license',
      artifact: 'fake-license-artifact-md5',
      fuelArtifact: 'fake-fuel-artifact-md5',
    };
    await bsvWalletRepo.save(storedKey);
    await bsvTokenRepo.put(token);
    const provider = makeProvider({
      getTransactionHex: vi.fn().mockResolvedValue(current.hex),
    });

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    const feePerWrite = Math.ceil((MEASURED_WRITE_SIZE_BYTES / 1000) * 1);
    const estimate = Math.floor(10000 / feePerWrite);
    expect(
      screen.getByText(`fuel 10000 sat (>= 5 writes at cap, ~ ${estimate} at the current rate)`),
    ).toBeInTheDocument();
  });

  it("shows the last fuel value with its age when a refresh can't reach the chain", async () => {
    const fuelScript = new LockingScript().writeBin(new Array(1200).fill(0xab));
    const current = tokenTx(fuelScript, 8000);
    const token: LicenseToken = {
      origin: { txid: current.txid, vout: 0 },
      current: { txid: current.txid, vout: 0 },
      holderAddress,
      collectionId: 'spellforge-leaderboard-testnet',
      lock: 'license',
      artifact: 'fake-license-artifact-md5',
      fuelArtifact: 'fake-fuel-artifact-md5',
    };
    await bsvWalletRepo.save(storedKey);
    await bsvTokenRepo.put(token);
    const getTransactionHex = vi.fn().mockResolvedValue(current.hex);
    const provider = makeProvider({ getTransactionHex });

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    expect(screen.getByText(/^fuel 8000 sat \(/)).toBeInTheDocument();

    getTransactionHex.mockRejectedValue(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh fuel' }));
    await flush();

    expect(screen.getByText(/^fuel 8000 sat as of \d{2}:\d{2} \(/)).toBeInTheDocument();
  });

  it("shows 'stand-in' for a step 2 token", async () => {
    const standIn = new P2PKH().lock(holderAddress);
    const current = tokenTx(standIn, 1);
    const token: LicenseToken = {
      origin: { txid: current.txid, vout: 0 },
      current: { txid: current.txid, vout: 0 },
      holderAddress,
      collectionId: 'spellforge-leaderboard-testnet',
      lock: 'license',
      artifact: 'fake-license-artifact-md5',
    };
    await bsvWalletRepo.save(storedKey);
    await bsvTokenRepo.put(token);
    const provider = makeProvider({
      getTransactionHex: vi.fn().mockResolvedValue(current.hex),
    });

    vi.useFakeTimers();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await flush();

    expect(screen.getByText('fuel: stand-in')).toBeInTheDocument();
  });
});

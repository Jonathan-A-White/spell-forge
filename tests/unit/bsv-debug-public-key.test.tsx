import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { PrivateKey } from '@bsv/sdk';
import { db } from '../../src/data/db';
import { bsvWalletRepo } from '../../src/data/repositories';
import { generateTestnetKey } from '../../src/bsv';
import { BsvDebugScreen } from '../../src/features/bsv-debug/bsv-debug-screen';
import type { BsvWalletKey } from '../../src/contracts/types';
import type { ChainProvider } from '../../src/bsv';

const provider: ChainProvider = {
  getUtxos: async () => [],
  getTransactionHex: async () => '',
  broadcast: async () => '',
  getTransactionHistory: async () => [],
} as unknown as ChainProvider;

async function seedWallet(): Promise<{ wallet: BsvWalletKey; publicKeyHex: string }> {
  const generated = generateTestnetKey();
  const wallet: BsvWalletKey = {
    id: 'wallet-1',
    kind: 'wif',
    network: generated.network,
    material: generated.material,
    address: generated.address,
    createdAt: new Date(),
  };
  await bsvWalletRepo.save(wallet);
  return { wallet, publicKeyHex: PrivateKey.fromWif(wallet.material).toPublicKey().toString() };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BsvDebugScreen: this device's public key", () => {
  it('shows no public key block until a key exists', async () => {
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await screen.findByRole('button', { name: 'Generate key' });
    expect(screen.queryByText("This device's public key")).not.toBeInTheDocument();
  });

  it("renders the wallet's compressed public key hex, a Copy button and a QR image", async () => {
    const { publicKeyHex } = await seedWallet();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);

    expect(await screen.findByText("This device's public key")).toBeInTheDocument();
    const shown = await screen.findByTestId('bsv-device-public-key');
    expect(shown.textContent).toBe(publicKeyHex);
    expect(shown.textContent).toMatch(/^0[23][0-9a-f]{64}$/);

    const qr = await screen.findByRole('img', { name: "QR code of this device's public key" });
    expect(qr.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
  });

  it('Copy writes exactly the hex to the clipboard and says Copied', async () => {
    const { publicKeyHex } = await seedWallet();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    await screen.findByTestId('bsv-device-public-key');

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(publicKeyHex);
  });
});

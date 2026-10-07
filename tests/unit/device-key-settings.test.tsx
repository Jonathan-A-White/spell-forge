import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { PrivateKey } from '@bsv/sdk';
import { db } from '../../src/data/db';
import { bsvWalletRepo } from '../../src/data/repositories';
import { chainConfig, generateTestnetKey } from '../../src/bsv';
import { SettingsPanel } from '../../src/features/settings/settings-panel';
import { BsvDebugScreen } from '../../src/features/bsv-debug/bsv-debug-screen';
import { createDeviceKey } from '../../src/features/device-key';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import type { BsvWalletKey } from '../../src/contracts/types';
import type { ChainProvider } from '../../src/bsv';

const baseProps = {
  profile: { name: 'Rowan', themeId: 'dragon-forge' },
  settings: DEFAULT_SETTINGS,
  onContrastModeChange: vi.fn(),
  onPresetApply: vi.fn(),
  onOpenBsvDebug: vi.fn(),
  onBack: vi.fn(),
};

const provider = {
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
  // Creating a key calls GET /api/me in the background; tests never touch the network.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
  localStorage.clear();
  await db.delete();
  await db.open();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createDeviceKey", () => {
  it('saves one testnet wif wallet row and returns it', async () => {
    const key = await createDeviceKey();

    expect(key.kind).toBe('wif');
    expect(key.network).toBe(chainConfig.network);
    expect(key.createdAt).toBeInstanceOf(Date);
    const rows = await db.bsvWallet.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(key.id);
    expect(rows[0].material).toBe(key.material);
    expect(rows[0].address).toBe(PrivateKey.fromWif(key.material).toAddress([0x6f]));
  });
});

describe("Settings: This device's key (debug mode off)", () => {
  it("shows the current wallet's compressed public key, why, Copy and a QR image", async () => {
    const { publicKeyHex } = await seedWallet();
    render(<SettingsPanel {...baseProps} />);

    expect(await screen.findByRole('heading', { name: "This device's key" })).toBeInTheDocument();
    expect(screen.getByText('Give this to whoever issues your licence')).toBeInTheDocument();
    const shown = await screen.findByTestId('bsv-device-public-key');
    expect(shown.textContent).toBe(publicKeyHex);
    expect(shown.textContent).toMatch(/^0[23][0-9a-f]{64}$/);
    const qr = await screen.findByRole('img', { name: "QR code of this device's public key" });
    expect(qr.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(screen.queryByRole('button', { name: "Create this device's key" })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'BSV Debug' })).not.toBeInTheDocument();
  });

  it('Copy writes exactly the hex and says Copied', async () => {
    const { publicKeyHex } = await seedWallet();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<SettingsPanel {...baseProps} />);
    await screen.findByTestId('bsv-device-public-key');

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(publicKeyHex);
  });

  it("with no wallet shows 'Create this device's key'; a tap saves one wallet row and shows its key", async () => {
    render(<SettingsPanel {...baseProps} />);

    const create = await screen.findByRole('button', { name: "Create this device's key" });
    expect(screen.queryByTestId('bsv-device-public-key')).not.toBeInTheDocument();
    expect(await db.bsvWallet.count()).toBe(0);

    fireEvent.click(create);

    const shown = await screen.findByTestId('bsv-device-public-key');
    const rows = await db.bsvWallet.toArray();
    expect(rows).toHaveLength(1);
    expect(shown.textContent).toBe(PrivateKey.fromWif(rows[0].material).toPublicKey().toString());
    expect(shown.textContent).toMatch(/^0[23][0-9a-f]{64}$/);
    expect(screen.queryByRole('button', { name: "Create this device's key" })).not.toBeInTheDocument();
  });

  it('never shows the private key (WIF)', async () => {
    const { wallet } = await seedWallet();
    const { container } = render(<SettingsPanel {...baseProps} />);
    await screen.findByTestId('bsv-device-public-key');
    expect(container.innerHTML).not.toContain(wallet.material);
    expect(screen.queryByRole('button', { name: /private key/i })).not.toBeInTheDocument();

    cleanup();
    await bsvWalletRepo.wipe();
    const second = render(<SettingsPanel {...baseProps} />);
    fireEvent.click(await screen.findByRole('button', { name: "Create this device's key" }));
    await screen.findByTestId('bsv-device-public-key');
    const [row] = await db.bsvWallet.toArray();
    expect(second.container.innerHTML).not.toContain(row.material);
  });
});

describe('BSV Debug and Settings show the same key', () => {
  it('BSV Debug renders the same hex Settings does', async () => {
    const { publicKeyHex } = await seedWallet();
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    expect((await screen.findByTestId('bsv-device-public-key')).textContent).toBe(publicKeyHex);
  });

  it("BSV Debug's Generate key saves one wallet row and shows its key", async () => {
    render(<BsvDebugScreen onBack={vi.fn()} chainProvider={provider} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Generate key' }));

    const shown = await screen.findByTestId('bsv-device-public-key');
    const rows = await db.bsvWallet.toArray();
    expect(rows).toHaveLength(1);
    expect(shown.textContent).toBe(PrivateKey.fromWif(rows[0].material).toPublicKey().toString());
  });
});

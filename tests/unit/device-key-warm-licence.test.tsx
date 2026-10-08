import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { PrivateKey } from '@bsv/sdk';
import { db } from '../../src/data/db';
import { SettingsPanel } from '../../src/features/settings/settings-panel';
import { createDeviceKey } from '../../src/features/device-key';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { makeServer } from '../fixtures/grist/fake-postern';

const baseProps = {
  profile: { name: 'Rowan', themeId: 'dragon-forge' },
  settings: DEFAULT_SETTINGS,
  onContrastModeChange: vi.fn(),
  onPresetApply: vi.fn(),
  onOpenBsvDebug: vi.fn(),
  onBack: vi.fn(),
};

const meCalls = (server: ReturnType<typeof makeServer>) =>
  server.calls.filter((call) => call.method === 'GET' && call.path === '/api/me');

beforeEach(async () => {
  localStorage.clear();
  await db.delete();
  await db.open();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Creating the device key warms the factory licence walk', () => {
  it('makes exactly one signed GET /api/me, as the new key', async () => {
    const server = makeServer(PrivateKey.fromRandom());
    const key = await createDeviceKey(server.fetch);

    await waitFor(() => expect(meCalls(server)).toHaveLength(1), { timeout: 5000 });
    expect(server.authorizations).toHaveLength(1);
    expect(server.authorizations[0]).toContain(`Postern2 ${PrivateKey.fromWif(key.material).toPublicKey().toString()}:`);
    // Give a stray second call time to show itself.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(meCalls(server)).toHaveLength(1);
  });

  it('the Create button in Settings makes that one call, and shows the key as before', async () => {
    const server = makeServer(PrivateKey.fromRandom());
    vi.stubGlobal('fetch', server.fetch);
    render(<SettingsPanel {...baseProps} />);

    fireEvent.click(await screen.findByRole('button', { name: "Create this device's key" }, { timeout: 5000 }));

    const shown = await screen.findByTestId('bsv-device-public-key', {}, { timeout: 5000 });
    const [row] = await db.bsvWallet.toArray();
    expect(shown.textContent).toBe(PrivateKey.fromWif(row.material).toPublicKey().toString());
    await waitFor(() => expect(meCalls(server)).toHaveLength(1), { timeout: 5000 });
  });

  it.each([
    ['offline', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a refusal (401 no licence)', undefined],
  ])('a failing call (%s) changes nothing visible and raises nothing', async (_name, failingFetch) => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const server = makeServer(PrivateKey.fromRandom());
      server.licensed = false;
      const fetchImpl = (failingFetch ?? server.fetch) as typeof fetch;
      vi.stubGlobal('fetch', fetchImpl);
      render(<SettingsPanel {...baseProps} />);

      fireEvent.click(await screen.findByRole('button', { name: "Create this device's key" }, { timeout: 5000 }));

      const shown = await screen.findByTestId('bsv-device-public-key', {}, { timeout: 5000 });
      expect(shown.textContent).toMatch(/^0[23][0-9a-f]{64}$/);
      expect(await db.bsvWallet.count()).toBe(1);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

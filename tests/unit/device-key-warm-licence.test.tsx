import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { PrivateKey } from '@bsv/sdk';
import { db } from '../../src/data/db';
import { SettingsPanel } from '../../src/features/settings/settings-panel';
import { createDeviceKey } from '../../src/features/device-key';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { gristConfig } from '../../src/grist';
import { fakePostern } from 'bsv-kit/testing';
import type { FakePostern } from 'bsv-kit/testing';

const baseProps = {
  profile: { name: 'Rowan', themeId: 'dragon-forge' },
  settings: DEFAULT_SETTINGS,
  onContrastModeChange: vi.fn(),
  onPresetApply: vi.fn(),
  onOpenBsvDebug: vi.fn(),
  onBack: vi.fn(),
};

const makeServer = (): FakePostern => fakePostern({ base: gristConfig.backendUrl });
const meCalls = (server: FakePostern) => server.seen.filter((call) => call.method === 'GET' && call.path === '/me');

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
    const server = makeServer();
    await createDeviceKey(server.fetch);

    await waitFor(() => expect(meCalls(server)).toHaveLength(1), { timeout: 5000 });
    // Give a stray second call time to show itself.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(meCalls(server)).toHaveLength(1);
  });

  it('the Create button in Settings makes that one call, and shows the key as before', async () => {
    const server = makeServer();
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
    ['a refusal (401 no licence)', () => Promise.resolve(new Response(JSON.stringify({ reason: 'no_licence' }), { status: 401 }))],
  ])('a failing call (%s) changes nothing visible and raises nothing', async (_name, failingFetch) => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      vi.stubGlobal('fetch', failingFetch);
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

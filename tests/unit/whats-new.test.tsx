// What's new (mw-vmx5cb.3): public/changelog.json read by pwa-kit's useChangelog from BASE_URL, the sheet shown once
// after a version change on the grown-up screens only, and About's What's new and Check for updates rows.
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseChangelog, useChangelog, versionsSince, type StorageLike } from 'pwa-kit/whats-new';
import { APP_VERSION } from '../../src/version';
import { AboutScreen } from '../../src/features/about';
import {
  WHATS_NEW_STORAGE_KEY,
  WhatsNewOnUpdate,
  whatsNewShownOn,
} from '../../src/features/about';

const changelogJson = readFileSync(join(__dirname, '..', '..', 'public', 'changelog.json'), 'utf8');
const ENTRIES = parseChangelog(JSON.parse(changelogJson));

function changelogFetch(): typeof fetch {
  return vi.fn(async () => new Response(changelogJson, { status: 200 })) as unknown as typeof fetch;
}

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

afterEach(cleanup);

describe('public/changelog.json', () => {
  it('lists the current version and the one before it', () => {
    const versions = new Set(ENTRIES.map((e) => e.version));
    expect(versions.has(APP_VERSION)).toBe(true);
    expect(versions.size).toBeGreaterThanOrEqual(2);
    expect(ENTRIES.length).toBe((JSON.parse(changelogJson) as unknown[]).length); // every entry is well formed
  });

  it('is read by useChangelog from BASE_URL, and versionsSince picks the entries newer than a stored version', async () => {
    const fetchFn = changelogFetch();
    const { result } = renderHook(() => useChangelog('/spell-forge/', fetchFn));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/spell-forge/changelog.json');
    const groups = versionsSince(result.current ?? [], '0.1.160');
    // Releases are added at the top as the app ships, so the two this was written for are the oldest groups.
    expect(groups.map((g) => g.version).slice(-2)).toEqual(['0.1.162', '0.1.161']);
    expect(groups.map((g) => g.version)).not.toContain('0.1.160');
    expect(versionsSince(result.current ?? [], APP_VERSION)).toEqual([]);
  });

  it('is fetched from the app BASE_URL by the grown-up wiring', async () => {
    const fetchFn = changelogFetch();
    render(<WhatsNewOnUpdate view="about" storage={memoryStorage({ [WHATS_NEW_STORAGE_KEY]: '0.1.160' })} fetchFn={fetchFn} />);
    await screen.findByRole('dialog');
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(`${import.meta.env.BASE_URL}changelog.json`);
  });
});

describe('the sheet once after an update', () => {
  let storage: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    storage = memoryStorage({ [WHATS_NEW_STORAGE_KEY]: '0.1.160' });
  });

  it('opens once after a version change, lists the versions since, and not again once closed', async () => {
    const fetchFn = changelogFetch();
    const first = render(<WhatsNewOnUpdate view="settings" storage={storage} fetchFn={fetchFn} />);
    const sheet = await screen.findByRole('dialog');
    expect(sheet.textContent).toContain("What's new");
    expect(sheet.textContent).toContain('0.1.162');
    expect(sheet.textContent).toContain('0.1.161');
    expect(sheet.textContent).not.toContain('0.1.160');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(storage.data[WHATS_NEW_STORAGE_KEY]).toBe(APP_VERSION);
    first.unmount();

    render(<WhatsNewOnUpdate view="settings" storage={storage} fetchFn={fetchFn} />);
    await waitFor(() => expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('on a first install only remembers the version and shows nothing', async () => {
    const fresh = memoryStorage();
    render(<WhatsNewOnUpdate view="about" storage={fresh} fetchFn={changelogFetch()} />);
    await waitFor(() => expect(fresh.data[WHATS_NEW_STORAGE_KEY]).toBe(APP_VERSION));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('never on a child screen', () => {
  const GROWN_UP = ['about', 'settings', 'feedback'];
  const CHILD = ['tutor', 'practice', 'practice-games', 'quiz', 'learning', 'home', 'progress', 'profile-select', 'onboarding', 'loading', 'monster-stable'];

  it.each(GROWN_UP)('whatsNewShownOn(%s) is true', (view) => {
    expect(whatsNewShownOn(view)).toBe(true);
  });

  it.each(CHILD)('whatsNewShownOn(%s) is false and nothing is fetched, shown or stored there', async (view) => {
    const fetchFn = changelogFetch();
    const storage = memoryStorage({ [WHATS_NEW_STORAGE_KEY]: '0.1.160' });
    const { container } = render(<WhatsNewOnUpdate view={view} storage={storage} fetchFn={fetchFn} />);
    expect(whatsNewShownOn(view)).toBe(false);
    await Promise.resolve();
    expect(container.innerHTML).toBe('');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(storage.data[WHATS_NEW_STORAGE_KEY]).toBe('0.1.160');
  });
});

describe('About', () => {
  it("shows a What's new button that opens the sheet with every version, and Close shuts it", async () => {
    render(<AboutScreen onBack={() => {}} fetchFn={changelogFetch()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: "What's new" })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: "What's new" }));
    const sheet = screen.getByRole('dialog');
    expect(sheet.textContent).toContain('0.1.160');
    expect(sheet.textContent).toContain('0.1.162');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a Check for updates row that asks the service worker registration and says Up to date', async () => {
    const registration = { update: vi.fn(async () => undefined), waiting: null, active: null, installing: null };
    render(<AboutScreen onBack={() => {}} fetchFn={changelogFetch()} registration={registration} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Up to date'));
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('says Update ready when the check finds a build waiting', async () => {
    const registration = { update: vi.fn(async () => undefined), waiting: {}, active: null, installing: null };
    render(<AboutScreen onBack={() => {}} fetchFn={changelogFetch()} registration={registration} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Update ready'));
  });
});

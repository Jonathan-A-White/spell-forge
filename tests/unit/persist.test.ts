// M11 (story 12c, mw-79en7t.34): ask the phone to keep SpellForge's storage (navigator.storage.persist()) once, after the
// first learner exists and never before: a refusal at first launch teaches Chrome the app is not engaged.
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistStorage, usePersistStorage } from '../../src/shell/persist';
import { Shell } from '../../src/shell/Shell';
import { AppProvider } from '../../src/shell/app-context';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';

let persist: ReturnType<typeof vi.fn>;

function installStorage(value: unknown): void {
  Object.defineProperty(navigator, 'storage', { configurable: true, value });
}

beforeEach(() => {
  persist = vi.fn().mockResolvedValue(true);
  installStorage({ persist });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'storage');
});

describe('persistStorage', () => {
  it('asks the phone and says whether it was granted', async () => {
    await expect(persistStorage()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('is false, and silent, for a browser without it or one that throws', async () => {
    installStorage(undefined);
    await expect(persistStorage()).resolves.toBe(false);
    installStorage({ persist: () => Promise.reject(new Error('no')) });
    await expect(persistStorage()).resolves.toBe(false);
  });
});

describe('usePersistStorage', () => {
  it('asks once, when the first learner exists, and never before', () => {
    const { rerender } = renderHook(({ learner }) => usePersistStorage(learner), { initialProps: { learner: false } });
    rerender({ learner: false });
    expect(persist).not.toHaveBeenCalled();

    rerender({ learner: true });
    expect(persist).toHaveBeenCalledTimes(1);

    rerender({ learner: false });
    rerender({ learner: true });
    expect(persist).toHaveBeenCalledTimes(1);
  });
});

describe('the Shell at boot', () => {
  beforeEach(async () => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
    await db.delete();
    await db.open();
  });

  it('does not ask while there is no learner (the welcome screen)', async () => {
    render(createElement(AppProvider, null, createElement(Shell)));
    await screen.findByText(/Welcome to SpellForge/);
    expect(persist).not.toHaveBeenCalled();
  });

  it('asks once when a learner is there', async () => {
    await profileRepo.create({
      name: 'Rowan',
      avatar: 'dragon-forge-1',
      themeId: 'dragon-forge',
      createdAt: new Date(),
      settings: { ...DEFAULT_SETTINGS },
      status: 'active',
    });
    render(createElement(AppProvider, null, createElement(Shell)));
    await screen.findByText(/Hey, Rowan!/);
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
  });
});

// The update offer: startAppUpdates is started with the app's version, the state goes 'none' -> 'ready' when the
// registration finds a waiting worker, and the banner is a quiet in-flow bar that never sits on a child's screen.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  applyUpdate,
  getUpdateState,
  type UpdateContainer,
  type UpdateRegistration,
  type WorkerLike,
} from 'pwa-kit/app-update';
import { APP_VERSION } from '../../src/version';
import type { ChangelogEntry, ReadChangelog } from 'pwa-kit/whats-new';
import { UpdateBanner, startUpdates, updateBarShownOn } from '../../src/features/update';

const startSpy = vi.hoisted(() => vi.fn());
vi.mock('pwa-kit/app-update', async (importActual) => {
  const actual = await importActual<typeof import('pwa-kit/app-update')>();
  return {
    ...actual,
    startAppUpdates: (...args: Parameters<typeof actual.startAppUpdates>) => {
      startSpy(...args);
      return actual.startAppUpdates(...args);
    },
  };
});

class FakeWorker implements WorkerLike {
  state: ServiceWorkerState = 'installed';
  messages: unknown[] = [];
  postMessage(message: unknown): void {
    this.messages.push(message);
  }
  private listeners: Array<() => void> = [];
  addEventListener(_type: 'statechange', listener: () => void): void {
    this.listeners.push(listener);
  }
  become(state: ServiceWorkerState): void {
    this.state = state;
    for (const l of [...this.listeners]) l();
  }
}

class FakeContainer implements UpdateContainer {
  controller: unknown = {};
  private listeners = new Set<() => void>();
  addEventListener(_type: 'controllerchange', listener: () => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'controllerchange', listener: () => void): void {
    this.listeners.delete(listener);
  }
  takeOver(): void {
    for (const l of [...this.listeners]) l();
  }
}

class FakeRegistration implements UpdateRegistration {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  private found = new Set<() => void>();
  update(): Promise<unknown> {
    return Promise.resolve();
  }
  addEventListener(_type: 'updatefound', listener: () => void): void {
    this.found.add(listener);
  }
  removeEventListener(_type: 'updatefound', listener: () => void): void {
    this.found.delete(listener);
  }
  // The browser finds a new build: updatefound, then the installing worker reaches 'installed' and waits.
  install(worker: FakeWorker): void {
    this.installing = worker;
    for (const l of [...this.found]) l();
    this.waiting = worker;
    this.installing = null;
    worker.become('installed');
  }
}

// A changelog line after the running version, and one at it: the first is news for this build, the second is not.
const line = (version: string): ChangelogEntry => ({ version, date: '2026-11-13', story: 'mw-x', kind: 'fixed', text: 'A fix.' });
const [major, minor, patch] = APP_VERSION.split('.').map(Number);
const AFTER = `${major}.${minor}.${patch + 1}`;
const withNews: ReadChangelog = async () => [line(AFTER), line(APP_VERSION)];
const withoutNews: ReadChangelog = async () => [line(APP_VERSION)];
const settle = () => act(async () => {});

let container: FakeContainer;
let registration: FakeRegistration;
let reload: Mock<() => void>;
let stop: () => void;

beforeEach(() => {
  startSpy.mockClear();
  container = new FakeContainer();
  registration = new FakeRegistration();
  reload = vi.fn<() => void>();
});

afterEach(() => {
  cleanup();
  stop?.();
});

describe('startUpdates', () => {
  it("starts startAppUpdates with the app's version and the browser's registration", () => {
    ({ stop } = startUpdates(registration, { container, reload, read: withNews }));
    expect(startSpy).toHaveBeenCalledTimes(1);
    const [deps, options] = startSpy.mock.calls[0];
    expect(deps).toEqual({ container, registration, reload });
    expect(options).toMatchObject({ version: APP_VERSION, hasNewsSince: expect.any(Function) });
  });

  it("goes 'none' -> 'ready' when the registration finds a waiting worker", async () => {
    ({ stop } = startUpdates(registration, { container, reload, read: withNews }));
    expect(getUpdateState()).toBe('none');
    act(() => registration.install(new FakeWorker()));
    await settle();
    expect(getUpdateState()).toBe('ready');
  });

  it('applyUpdate asks the waiting worker to skip waiting, then reloads when it has taken over', async () => {
    const worker = new FakeWorker();
    registration.waiting = worker;
    ({ stop } = startUpdates(registration, { container, reload, read: withNews }));
    await settle();
    expect(getUpdateState()).toBe('ready');
    act(() => applyUpdate());
    expect(worker.messages).toEqual([{ type: 'SKIP_WAITING' }]);
    expect(getUpdateState()).toBe('updating');
    expect(reload).not.toHaveBeenCalled();
    container.takeOver();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('offers no first install: with no controller the worker has nothing to wait behind', () => {
    container.controller = null;
    registration.waiting = new FakeWorker();
    ({ stop } = startUpdates(registration, { container, reload, read: withNews }));
    expect(getUpdateState()).toBe('none');
  });
});

// The judge is pwa-kit/whats-new's hasNewsSince over the waiting build's changelog (mw-6ww.175.47).
describe('startUpdates: a build with no news', () => {
  it('raises no banner and is taken quietly when the changelog has no line after the running version', async () => {
    const worker = new FakeWorker();
    registration.waiting = worker;
    ({ stop } = startUpdates(registration, { container, reload, read: withoutNews }));
    await settle();
    expect(getUpdateState()).toBe('none');
    expect(worker.messages).toEqual([{ type: 'SKIP_WAITING' }]);
    const { container: out } = render(<UpdateBanner view="home" />);
    expect(out).toBeEmptyDOMElement();
  });

  it('raises the banner and waits for the tap when the changelog has a line after the running version', async () => {
    const worker = new FakeWorker();
    registration.waiting = worker;
    ({ stop } = startUpdates(registration, { container, reload, read: withNews }));
    await settle();
    expect(getUpdateState()).toBe('ready');
    expect(worker.messages).toEqual([]);
  });

  it('offers the build, and takes nothing quietly, when the changelog cannot be read', async () => {
    const worker = new FakeWorker();
    registration.waiting = worker;
    ({ stop } = startUpdates(registration, { container, reload, read: async () => null }));
    await settle();
    expect(getUpdateState()).toBe('ready');
    expect(worker.messages).toEqual([]);
  });

  it("reads the changelog from the page's base when no reader is given", async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify([line(APP_VERSION)])));
    vi.stubGlobal('fetch', fetchSpy);
    try {
      registration.waiting = new FakeWorker();
      ({ stop } = startUpdates(registration, { container, reload }));
      await settle();
      expect(fetchSpy).toHaveBeenCalledWith(expect.stringMatching(/changelog\.json$/), { cache: 'no-store' });
      expect(getUpdateState()).toBe('none');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('UpdateBanner', () => {
  const waitingBuild = async () => {
    registration.waiting = new FakeWorker();
    ({ stop } = startUpdates(registration, { container, reload, read: withNews }));
    await settle();
  };

  it("renders nothing in the 'none' state", () => {
    ({ stop } = startUpdates(registration, { container, reload, read: withNews }));
    const { container: out } = render(<UpdateBanner view="home" />);
    expect(out).toBeEmptyDOMElement();
  });

  it("renders in the 'ready' state, with Update now that applies the update", async () => {
    await waitingBuild();
    render(<UpdateBanner view="home" />);
    expect(screen.getByRole('status')).toHaveTextContent(/new version of Kestrel/i);
    fireEvent.click(screen.getByRole('button', { name: 'Update now' }));
    expect((registration.waiting as FakeWorker).messages).toEqual([{ type: 'SKIP_WAITING' }]);
    expect(screen.getByRole('button', { name: 'Updating…' })).toBeDisabled();
  });

  it('is dismissible', async () => {
    await waitingBuild();
    render(<UpdateBanner view="home" />);
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  // jsdom has no layout, so elementFromPoint cannot say what covers what. The assertion is on layout
  // instead: the bar is a plain block in the document flow (never fixed, absolute or sticky, no z-index), so it
  // takes its own room above the screen and covers none of it; and it is not mounted at all on a child's screens.
  it('is a block in the flow, not an overlay', async () => {
    await waitingBuild();
    render(<UpdateBanner view="home" />);
    const bar = screen.getByRole('status');
    expect(bar.className).not.toMatch(/\b(fixed|absolute|sticky|z-\d+)\b/);
  });

  it.each(['tutor', 'practice', 'practice-games', 'quiz', 'learning', 'record-test-results', 'qr-import', 'loading', 'onboarding'])(
    'is not mounted on %s, the child screens',
    async (view) => {
      await waitingBuild();
      expect(updateBarShownOn(view)).toBe(false);
      const { container: out } = render(<UpdateBanner view={view} />);
      expect(out).toBeEmptyDOMElement();
    },
  );

  it.each(['home', 'settings', 'about', 'progress'])('is mounted on %s, the grown-up screens', async (view) => {
    await waitingBuild();
    expect(updateBarShownOn(view)).toBe(true);
    render(<UpdateBanner view={view} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

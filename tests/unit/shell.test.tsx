// The Shell and the WorldSwitch (story 12b, mw-79en7t.33): a route picks a world, a world picks its screen,
// and the tutor's "go" opens a screen by its id through the one table (src/shell/worlds.ts).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ComponentType } from 'react';
import { WorldSwitch } from '../../src/shell/WorldSwitch';
import type { WorldScreens } from '../../src/shell/world-screens';
import { Shell } from '../../src/shell/Shell';
import { AppProvider } from '../../src/shell/app-context';
import { useApp } from '../../src/shell/app-state';
import { WORLDS, VIEWS, viewRoute, type ViewId, type WorldId } from '../../src/shell/worlds';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';

const stub = (world: WorldId): ComponentType<{ view: ViewId | null }> =>
  function Stub({ view }) {
    return <div data-testid={`world-${world}`}>{`${world}:${view ?? 'none'}`}</div>;
  };
const stubs = Object.fromEntries(WORLDS.map((w) => [w.id, stub(w.id)])) as unknown as WorldScreens;

afterEach(cleanup);

describe('WorldSwitch', () => {
  it('shows the world of each route, with the screen the route names', () => {
    for (const v of VIEWS) {
      const { unmount } = render(<WorldSwitch route={v.route} worlds={stubs} />);
      expect(screen.getByTestId(`world-${v.world}`)).toHaveTextContent(`${v.world}:${v.id}`);
      unmount();
    }
  });

  it("shows Maths' placeholder, since Maths has no screen yet", () => {
    render(<WorldSwitch route="/maths" />);
    expect(screen.getByRole('heading', { name: 'Maths is coming' })).toBeInTheDocument();
  });

  it('falls back to the front door for a route that does not exist', () => {
    render(<WorldSwitch route="/spelling/a-screen-that-was-dropped" worlds={stubs} />);
    expect(screen.getByTestId('world-front-door')).toHaveTextContent('front-door:home');
  });
});

describe('Shell', () => {
  beforeEach(async () => {
    cleanup();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
    await db.delete();
    await db.open();
    await profileRepo.create({
      name: 'Rowan',
      avatar: 'dragon-forge-1',
      themeId: 'dragon-forge',
      createdAt: new Date(),
      settings: { ...DEFAULT_SETTINGS },
      status: 'active',
    });
  });

  // A tutor "go" answer reaches the shell as an id; this stands in for the tutor.
  function Go({ id }: { id: string }) {
    const { go } = useApp();
    return <button onClick={() => go(id)}>{`go ${id}`}</button>;
  }

  it("opens on Home and switches the view when the tutor says go, by id or by route", async () => {
    render(
      <AppProvider>
        <Shell />
        <Go id="about" />
        <Go id={viewRoute('settings')} />
        <Go id="no-such-screen" />
      </AppProvider>,
    );
    expect(await screen.findByText(/Hey, Rowan!/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('go about'));
    expect(await screen.findByRole('heading', { name: /about/i })).toBeInTheDocument();

    fireEvent.click(screen.getByText(`go ${viewRoute('settings')}`));
    await screen.findByRole('heading', { name: 'Settings' });
    expect(screen.queryByRole('heading', { name: /about & credits/i })).not.toBeInTheDocument();

    // An id that is not a screen opens nothing.
    fireEvent.click(screen.getByText('go no-such-screen'));
    expect(screen.queryByText(/Hey, Rowan!/)).not.toBeInTheDocument();
  });

  it('reopens on the screen he was on', async () => {
    const first = render(
      <AppProvider>
        <Shell />
        <Go id="about" />
      </AppProvider>,
    );
    await screen.findByText(/Hey, Rowan!/);
    fireEvent.click(screen.getByText('go about'));
    await screen.findByRole('heading', { name: /about/i });
    first.unmount();

    // a new page life: the browser's history is gone, localStorage is not
    window.history.replaceState(null, '', '/');
    render(createElement(AppProvider, null, createElement(Shell)));
    expect(await screen.findByRole('heading', { name: /about/i })).toBeInTheDocument();
  });
});

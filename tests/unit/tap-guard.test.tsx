// M29 (story 12c, mw-79en7t.34): one guard in the Shell swallows taps for a moment after any screen change and after
// any dialog opens or closes, so the second tap of a double tap reaches nothing. No screen has code of its own for it.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TAP_GUARD_MS, tapGuard, useTapGuard } from '../../src/shell/tap-guard';
import { Shell } from '../../src/shell/Shell';
import { AppProvider } from '../../src/shell/app-context';
import { useApp } from '../../src/shell/app-state';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';

// tests/setup.ts turns the moment off (0) so every other test may tap the instant a screen is drawn; this one puts it back.
let before: number;
beforeEach(() => {
  before = tapGuard.ms;
  tapGuard.ms = TAP_GUARD_MS;
  vi.useFakeTimers();
});
afterEach(() => {
  tapGuard.ms = before;
  vi.useRealTimers();
  cleanup();
});

function Harness({ onNavigate }: { onNavigate: (to: string) => void }) {
  const [view, setView] = useState('a');
  const [dialog, setDialog] = useState(false);
  useTapGuard(view);
  const go = (to: string) => () => {
    onNavigate(to);
    setView(to);
  };
  return (
    <div>
      <p>on {view}</p>
      <button onClick={go('b')}>to b</button>
      <button onClick={go('c')}>to c</button>
      <button onClick={() => setDialog((d) => !d)}>toggle dialog</button>
      <button onClick={() => onNavigate('under-the-dialog')}>row</button>
      {dialog && <div role="dialog" aria-label="sheet">sheet</div>}
    </div>
  );
}

const flush = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe('the tap guard', () => {
  it('two taps within the guard window navigate once', async () => {
    const navigate = vi.fn();
    render(<Harness onNavigate={navigate} />);
    await flush(TAP_GUARD_MS + 100); // the first screen has settled

    fireEvent.click(screen.getByText('to b'));
    await flush(120); // a double tap is about this far apart
    fireEvent.click(screen.getByText('to c'));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('b');
    expect(screen.getByText('on b')).toBeInTheDocument();
  });

  it('takes the next tap once the moment is over', async () => {
    const navigate = vi.fn();
    render(<Harness onNavigate={navigate} />);
    await flush(TAP_GUARD_MS + 100);
    fireEvent.click(screen.getByText('to b'));
    await flush(TAP_GUARD_MS + 100);
    fireEvent.click(screen.getByText('to c'));
    expect(navigate.mock.calls).toEqual([['b'], ['c']]);
  });

  it('also swallows the tap after a dialog opens and after it closes', async () => {
    const navigate = vi.fn();
    render(<Harness onNavigate={navigate} />);
    await flush(TAP_GUARD_MS + 100);

    fireEvent.click(screen.getByText('toggle dialog'));
    await flush(50);
    fireEvent.click(screen.getByText('row'));
    expect(navigate).not.toHaveBeenCalled();

    await flush(TAP_GUARD_MS + 100);
    fireEvent.click(screen.getByText('row'));
    expect(navigate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('toggle dialog')); // closed
    await flush(50);
    fireEvent.click(screen.getByText('row'));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the moment is 0', async () => {
    tapGuard.ms = 0;
    const navigate = vi.fn();
    render(<Harness onNavigate={navigate} />);
    fireEvent.click(screen.getByText('to b'));
    fireEvent.click(screen.getByText('to c'));
    expect(navigate).toHaveBeenCalledTimes(2);
  });
});

describe('the tap guard in the Shell', () => {
  function Go({ id }: { id: string }) {
    const { go } = useApp();
    return <button onClick={() => go(id)}>{`go ${id}`}</button>;
  }

  it('lets one of two quick navigations through', async () => {
    vi.useRealTimers();
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
    render(
      <AppProvider>
        <Shell />
        <Go id="about" />
        <Go id="settings" />
      </AppProvider>,
    );
    await screen.findByText(/Hey, Rowan!/);
    await new Promise((r) => setTimeout(r, TAP_GUARD_MS + 100));

    fireEvent.click(screen.getByText('go about'));
    fireEvent.click(screen.getByText('go settings'));
    expect(await screen.findByRole('heading', { name: /about/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();

    await new Promise((r) => setTimeout(r, TAP_GUARD_MS + 100));
    fireEvent.click(screen.getByText('go settings'));
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });
});

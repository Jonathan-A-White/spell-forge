// M10 (story 12c, mw-79en7t.34): a timer that sleeps while the page is hidden and catches up once it is back (pageshow
// or visibilitychange). The helper only: the callers move onto it in 12d.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setVisibleInterval, useVisibleInterval } from '../../src/shell/visible-interval';

let hidden = false;
function setHidden(value: boolean, event: 'visibilitychange' | 'none' = 'visibilitychange'): void {
  hidden = value;
  if (event === 'visibilitychange') document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  hidden = false;
});

describe('setVisibleInterval', () => {
  it('ticks every interval while the page is visible', () => {
    const tick = vi.fn();
    const stop = setVisibleInterval(tick, 1000);
    vi.advanceTimersByTime(3500);
    expect(tick).toHaveBeenCalledTimes(3);
    stop();
  });

  it('stops on visibilitychange hidden', () => {
    const tick = vi.fn();
    const stop = setVisibleInterval(tick, 1000);
    vi.advanceTimersByTime(1000);
    expect(tick).toHaveBeenCalledTimes(1);

    setHidden(true);
    vi.advanceTimersByTime(60_000);
    expect(tick).toHaveBeenCalledTimes(1);
    stop();
  });

  it('resumes and catches up at once on pageshow', () => {
    const tick = vi.fn();
    const stop = setVisibleInterval(tick, 1000);
    setHidden(true);
    vi.advanceTimersByTime(60_000);
    expect(tick).not.toHaveBeenCalled();

    // back from the bfcache: the page is visible again and only pageshow is said
    setHidden(false, 'none');
    window.dispatchEvent(new Event('pageshow'));
    expect(tick).toHaveBeenCalledTimes(1); // the catch-up, before any interval has passed

    vi.advanceTimersByTime(2000);
    expect(tick).toHaveBeenCalledTimes(3);
    stop();
  });

  it('catches up on visibilitychange visible too, and the two events of one return are one catch-up', () => {
    const tick = vi.fn();
    const stop = setVisibleInterval(tick, 1000);
    setHidden(true);
    setHidden(false);
    window.dispatchEvent(new Event('pageshow'));
    expect(tick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(tick).toHaveBeenCalledTimes(2);
    stop();
  });

  it('does not catch up on pageshow when the page never slept', () => {
    const tick = vi.fn();
    const stop = setVisibleInterval(tick, 1000);
    window.dispatchEvent(new Event('pageshow'));
    expect(tick).not.toHaveBeenCalled();
    stop();
  });

  it('starts asleep when the page is hidden, and the stop ends it all', () => {
    setHidden(true, 'none');
    const tick = vi.fn();
    const stop = setVisibleInterval(tick, 1000);
    vi.advanceTimersByTime(5000);
    expect(tick).not.toHaveBeenCalled();

    stop();
    setHidden(false);
    vi.advanceTimersByTime(5000);
    expect(tick).not.toHaveBeenCalled();
  });
});

describe('useVisibleInterval', () => {
  it('ticks with the latest callback, sleeps while hidden, and stops on unmount', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(({ fn }) => useVisibleInterval(fn, 1000), { initialProps: { fn: first } });
    vi.advanceTimersByTime(1000);
    expect(first).toHaveBeenCalledTimes(1);

    rerender({ fn: second });
    vi.advanceTimersByTime(1000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    act(() => setHidden(true));
    vi.advanceTimersByTime(10_000);
    expect(second).toHaveBeenCalledTimes(1);

    act(() => {
      setHidden(false, 'none');
      window.dispatchEvent(new Event('pageshow'));
    });
    expect(second).toHaveBeenCalledTimes(2);

    unmount();
    vi.advanceTimersByTime(10_000);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('does not tick while the interval is null', () => {
    const tick = vi.fn();
    const { rerender } = renderHook(({ ms }) => useVisibleInterval(tick, ms), { initialProps: { ms: null as number | null } });
    vi.advanceTimersByTime(10_000);
    expect(tick).not.toHaveBeenCalled();
    rerender({ ms: 1000 });
    vi.advanceTimersByTime(1000);
    expect(tick).toHaveBeenCalledTimes(1);
  });
});

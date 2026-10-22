// src/shell/visible-interval.ts: a timer that sleeps while the page is hidden and fires once on return. A phone page
// spends most of its life hidden, and a bare setInterval keeps the radio and the CPU awake for nothing (pwa best practices,
// topic 11). It catches up on visibilitychange and on pageshow (the bfcache), and the two events of one return are one
// catch-up. The callers move onto it in story 12d; this is the only file in src that may call setInterval.
import { useEffect, useRef } from 'react';

/** Calls `fn` every `ms` while the page is visible, and once more the moment it is back. Returns the stop. */
export function setVisibleInterval(fn: () => void, ms: number): () => void {
  let id: number | undefined;
  const start = (): void => {
    id ??= window.setInterval(fn, ms);
  };
  const stop = (): void => {
    if (id === undefined) return;
    window.clearInterval(id);
    id = undefined;
  };
  // visibilitychange and pageshow both say "back": the first one that finds the timer asleep catches up, the second finds it running.
  const wake = (): void => {
    if (document.hidden || id !== undefined) return;
    fn();
    start();
  };
  const onVisibility = (): void => (document.hidden ? stop() : wake());
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', wake);
  if (!document.hidden) start();
  return () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pageshow', wake);
  };
}

/** setVisibleInterval for a component: the latest `fn` is called, and a null `ms` pauses the timer. */
export function useVisibleInterval(fn: () => void, ms: number | null): void {
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  useEffect(() => {
    if (ms === null) return;
    return setVisibleInterval(() => latest.current(), ms);
  }, [ms]);
}

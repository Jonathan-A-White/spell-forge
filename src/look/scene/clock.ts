// src/look/scene/clock.ts — the one seam on frames and time for anything that moves with script (docs/motion.md, Pause when hidden).
// The app uses the browser's; a test puts its own hand-turned clock in place by assigning to `clock`'s members (Legend's
// src/globe/clock.ts is the model). `animate()` is the app's one requestAnimationFrame loop: it asks for no frame while the page
// is hidden (vault topic 11), and tests/unit/scene-fallback.test.tsx fails on a loop anywhere else under src/.

export interface Clock {
  /** Milliseconds, for measuring steps. */
  now(): number;
  frame(callback: (time: number) => void): number;
  cancelFrame(id: number): void;
}

export const clock: Clock = {
  now: () => performance.now(),
  frame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
};

const pageHidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/**
 * Calls `step` once a frame while the page shows, with the frame's time and the milliseconds since the last step (0 for the first
 * step, and for the first after the page shows again: the hidden time is not a step). Asks for no frame while the page is hidden.
 * Returns the stop.
 */
export function animate(step: (time: number, dt: number) => void): () => void {
  let id: number | null = null;
  let last: number | null = null;
  let stopped = false;

  const tick = (): void => {
    id = null;
    const time = clock.now();
    const dt = last === null ? 0 : time - last;
    last = time;
    step(time, dt);
    if (!stopped && !pageHidden()) id = clock.frame(tick);
  };
  const start = (): void => {
    if (id === null && !stopped) id = clock.frame(tick);
  };
  const pause = (): void => {
    if (id !== null) clock.cancelFrame(id);
    id = null;
    last = null;
  };
  const onVisibility = (): void => (pageHidden() ? pause() : start());

  document.addEventListener('visibilitychange', onVisibility);
  if (!pageHidden()) start();

  return () => {
    stopped = true;
    pause();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/** The performance mark set when the door's backdrop first shows, still or live (tests/e2e/front-door-scene.spec.ts reads it). */
export const SCENE_PAINTED_MARK = 'sf-scene-painted';

/** Marks the first paint of the door's backdrop, once a page. */
export function markScenePainted(): void {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
  if (typeof performance.getEntriesByName === 'function' && performance.getEntriesByName(SCENE_PAINTED_MARK).length > 0) return;
  performance.mark(SCENE_PAINTED_MARK);
}

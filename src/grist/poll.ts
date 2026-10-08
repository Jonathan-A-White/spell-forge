// src/grist/poll.ts — The poll loop shared by GristInFlight and ParentAskInFlight: a pass on load, on `online`, and
// on a timer that runs fast while anything is in flight and slow when nothing is.

/** How often a pass runs when nothing is in flight. Such a pass reads Dexie only and asks the network nothing. */
export const TUTOR_POLL_INTERVAL_MS = 5_000;
/** How often a pass runs while a tutor turn or parent ask is waiting for its answer. */
export const TUTOR_POLL_IN_FLIGHT_MS = 1_000;

/**
 * Starts the loop. With `fixedMs` the timer never changes (tests, and the old fixed cadence); without it, the timer
 * is TUTOR_POLL_IN_FLIGHT_MS while the last pass found something waiting and TUTOR_POLL_INTERVAL_MS otherwise.
 * Returns the function that stops the timer and the `online` listener.
 */
export function startPolling(pass: () => Promise<void>, inFlight: () => boolean, fixedMs?: number): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let period = fixedMs ?? TUTOR_POLL_INTERVAL_MS;

  const run = () => {
    void pass().then(() => {
      if (stopped || fixedMs !== undefined) return;
      const wanted = inFlight() ? TUTOR_POLL_IN_FLIGHT_MS : TUTOR_POLL_INTERVAL_MS;
      if (wanted === period) return;
      period = wanted;
      clearInterval(timer);
      timer = setInterval(run, period);
    });
  };
  run();
  timer = setInterval(run, period);
  window.addEventListener('online', run);
  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener('online', run);
  };
}

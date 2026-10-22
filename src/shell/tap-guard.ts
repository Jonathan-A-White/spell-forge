// src/shell/tap-guard.ts: a double tap lands on nothing. One guard, started once by the Shell, swallows taps for a moment
// after any screen change and after any dialog opens or closes, so the second tap of a double tap does not reach what the
// first brought up (a row of the next screen, the sheet beneath). No screen or sheet has code of its own for it, and every
// modal carries a dialog role so the guard sees it.
import { useEffect } from 'react';

/** How long taps are swallowed after a change. A double tap is about 120 ms apart; reading a screen takes longer than this. PROVISIONAL */
export const TAP_GUARD_MS = 300;

/** The moment, a test seam: tests/setup.ts sets 0 so a test may tap the instant a screen is drawn, the guard's own test puts it back. */
export const tapGuard = { ms: readStored() };

function readStored(): number {
  try {
    const raw = globalThis.localStorage?.getItem('sf-tap-guard-ms') ?? null;
    const ms = Number(raw);
    return raw !== null && Number.isFinite(ms) && ms >= 0 ? ms : TAP_GUARD_MS;
  } catch {
    return TAP_GUARD_MS;
  }
}

// performance.now(), not Date.now(): a clock that steps back must not stretch the moment
let swallowUntil = 0;

/** Swallows every tap for the next `ms` (the guard's moment by default). */
export function swallowTaps(ms: number = tapGuard.ms): void {
  if (ms > 0) swallowUntil = Math.max(swallowUntil, performance.now() + ms);
}

const DIALOG = '[role="dialog"], [role="alertdialog"]';

const holdsDialog = (node: Node): boolean =>
  node instanceof Element && (node.matches(DIALOG) || node.querySelector(DIALOG) !== null);

/** Starts the guard: `screen` is the open screen (a change of it swallows taps), and a dialog put in or taken out of the page does too. */
export function useTapGuard(screen: string): void {
  useEffect(() => {
    const swallow = (event: Event) => {
      if (performance.now() >= swallowUntil) return;
      event.stopImmediatePropagation();
      event.preventDefault();
    };
    document.addEventListener('click', swallow, true);
    document.addEventListener('pointerdown', swallow, true);
    const dialogs = new MutationObserver((records) => {
      if (records.some((r) => [...r.addedNodes, ...r.removedNodes].some(holdsDialog))) swallowTaps();
    });
    dialogs.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener('click', swallow, true);
      document.removeEventListener('pointerdown', swallow, true);
      dialogs.disconnect();
      swallowUntil = 0;
    };
  }, []);

  useEffect(() => {
    swallowTaps();
  }, [screen]);
}

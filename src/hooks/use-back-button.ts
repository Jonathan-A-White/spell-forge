// src/hooks/use-back-button.ts — Sync app view state with browser history
// Prevents the OS/browser back button from closing the app when on the home screen.

import { useEffect, useRef, useCallback } from 'react';

/**
 * Maps the app's state-based navigation to `window.history` so
 * the browser / OS back button navigates within the app instead
 * of leaving it entirely.
 *
 * When the user is on the home screen and presses back, the hook
 * re-pushes a history entry so the app stays open.
 */
export function useBackButton<V extends string>(
  view: V,
  setView: (v: V) => void,
  homeView: V,
) {
  // Track whether the current navigation was triggered by popstate
  // so we don't double-push history entries.
  const isPopstateNav = useRef(false);

  // Push a history entry whenever the view changes (unless it was
  // triggered by the browser back button itself).
  useEffect(() => {
    if (isPopstateNav.current) {
      isPopstateNav.current = false;
      return;
    }

    // Always ensure there's at least one entry with our state.
    // Replace the current entry if we're on the home view for the
    // first time (initial load), otherwise push a new entry.
    const currentState = window.history.state as { sfView?: string } | null;
    if (!currentState?.sfView) {
      // First mount — seed history with a guard entry so that pressing
      // back on the home screen triggers popstate instead of leaving the app.
      window.history.replaceState({ sfView: '__guard__' }, '');
      window.history.pushState({ sfView: view }, '');
    } else if (currentState.sfView !== view) {
      window.history.pushState({ sfView: view }, '');
    }
  }, [view]);

  // Listen for the browser back button (popstate event).
  const handlePopstate = useCallback(
    (event: PopStateEvent) => {
      const state = event.state as { sfView?: V } | null;

      if (state?.sfView && state.sfView !== '__guard__') {
        // Navigate to the view stored in this history entry
        isPopstateNav.current = true;
        setView(state.sfView);
      } else {
        // Hit the guard entry (or no app state) — user is at the start
        // of the history stack. Stay on the home screen and re-push the
        // guard so another back press is caught again.
        isPopstateNav.current = true;
        setView(homeView);
        window.history.pushState({ sfView: homeView }, '');
      }
    },
    [setView, homeView],
  );

  useEffect(() => {
    window.addEventListener('popstate', handlePopstate);
    return () => window.removeEventListener('popstate', handlePopstate);
  }, [handlePopstate]);
}

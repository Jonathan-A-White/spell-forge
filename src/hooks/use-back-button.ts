// src/hooks/use-back-button.ts — Sync app view state with browser history
// Prevents the OS/browser back button from closing the app when on the home screen.

import { useEffect, useRef, useCallback } from 'react';

/**
 * Maps the app's state-based navigation to `window.history` so
 * the browser / OS back button navigates within the app instead
 * of leaving it entirely.
 *
 * Views listed in `transientViews` (e.g. loading screens) are never
 * pushed to history so the back button skips over them.
 *
 * When the user is on the home screen and presses back, the hook
 * re-pushes a history entry so the app stays open.
 */
export function useBackButton<V extends string>(
  view: V,
  setView: (v: V) => void,
  homeView: V,
  transientViews: V[] = [],
) {
  const isPopstateNav = useRef(false);
  const historySeeded = useRef(false);

  useEffect(() => {
    if (isPopstateNav.current) {
      isPopstateNav.current = false;
      return;
    }

    // Don't push transient views (loading, db-blocked, etc.) into history.
    if (transientViews.includes(view)) {
      return;
    }

    if (!historySeeded.current) {
      // First real (non-transient) view — seed history with a guard entry
      // underneath so that pressing back on the home screen triggers
      // popstate instead of navigating away from the app.
      window.history.replaceState({ sfView: '__guard__' }, '');
      window.history.pushState({ sfView: view }, '');
      historySeeded.current = true;
    } else {
      const currentState = window.history.state as { sfView?: string } | null;
      if (currentState?.sfView !== view) {
        window.history.pushState({ sfView: view }, '');
      }
    }
  }, [view, transientViews]);

  const handlePopstate = useCallback(
    (event: PopStateEvent) => {
      const state = event.state as { sfView?: V } | null;

      if (state?.sfView && state.sfView !== '__guard__') {
        isPopstateNav.current = true;
        setView(state.sfView);
      } else {
        // Hit the guard entry or left the app's history — stay on home
        // and re-push so subsequent back presses are caught too.
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

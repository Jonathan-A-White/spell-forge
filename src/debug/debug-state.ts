// src/debug/debug-state.ts — Shared debug mode state helpers.

import { useState, useCallback } from 'react';

export const DEBUG_MODE_STORAGE_KEY = 'sf-debug-mode';

/** Read the persisted debug mode enabled state. */
export function isDebugModeEnabled(): boolean {
  try {
    return localStorage.getItem(DEBUG_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persist the debug mode enabled state. */
export function setDebugModeEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(DEBUG_MODE_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // localStorage may be unavailable in some contexts
  }
}

/** Hook that returns [enabled, toggle] for debug mode state. */
export function useDebugMode(): [boolean, () => void] {
  const [enabled, setEnabled] = useState(isDebugModeEnabled);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      setDebugModeEnabled(next);
      return next;
    });
  }, []);

  return [enabled, toggle];
}

export const TUTOR_FLAG_STORAGE_KEY = 'sf-tutor';

/** Read the persisted Tutor flag; off unless it was switched on. */
export function isTutorFlagOn(): boolean {
  try {
    return localStorage.getItem(TUTOR_FLAG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Hook that returns whether the Tutor flag (sf-tutor) is on. */
export function useTutorFlag(): boolean {
  const [on] = useState(isTutorFlagOn);
  return on;
}

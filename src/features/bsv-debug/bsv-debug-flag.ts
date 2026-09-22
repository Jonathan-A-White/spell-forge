// src/features/bsv-debug/bsv-debug-flag.ts — Shared BSV debug mode state helpers.

import { useState, useCallback } from 'react';

export const BSV_DEBUG_STORAGE_KEY = 'sf-bsv-debug';

/** Read the persisted BSV debug enabled state. */
export function isBsvDebugEnabled(): boolean {
  try {
    return localStorage.getItem(BSV_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persist the BSV debug enabled state. */
export function setBsvDebugEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(BSV_DEBUG_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // localStorage may be unavailable in some contexts
  }
}

/** Hook that returns [enabled, toggle] for BSV debug state. */
export function useBsvDebugMode(): [boolean, () => void] {
  const [enabled, setEnabled] = useState(isBsvDebugEnabled);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      setBsvDebugEnabled(next);
      return next;
    });
  }, []);

  return [enabled, toggle];
}

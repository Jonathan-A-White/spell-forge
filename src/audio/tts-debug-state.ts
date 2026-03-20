// src/audio/tts-debug-state.ts — Shared TTS debug state helpers.
// Separated from the overlay component for fast-refresh compatibility.

import { useState, useCallback } from 'react';

export const TTS_DEBUG_STORAGE_KEY = 'sf-tts-debug';

/** Read the persisted TTS debug enabled state. */
export function isTtsDebugEnabled(): boolean {
  try {
    return localStorage.getItem(TTS_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persist the TTS debug enabled state. */
export function setTtsDebugEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(TTS_DEBUG_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // localStorage may be unavailable in some contexts
  }
}

/** Hook that returns [enabled, toggle] for TTS debug state. */
export function useTtsDebug(): [boolean, () => void] {
  const [enabled, setEnabled] = useState(isTtsDebugEnabled);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      setTtsDebugEnabled(next);
      return next;
    });
  }, []);

  return [enabled, toggle];
}

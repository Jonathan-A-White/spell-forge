// src/audio/use-audio-busy.ts — React hook to track AudioManager busy state

import { useCallback, useSyncExternalStore } from 'react';
import type { AudioManager } from './manager';

/**
 * Subscribe to an AudioManager's busy state so the component re-renders
 * when audio starts or stops playing.
 */
export function useAudioBusy(audioManager: AudioManager): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => audioManager.onBusyChange(onStoreChange),
    [audioManager],
  );
  const getSnapshot = useCallback(() => audioManager.isBusy(), [audioManager]);

  return useSyncExternalStore(subscribe, getSnapshot);
}

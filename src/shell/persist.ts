// src/shell/persist.ts: ask the phone to keep SpellForge's storage (navigator.storage.persist()), so a low-storage phone
// does not evict the children's words and progress. Asked once, after the first learner exists: a refusal at first launch,
// before there is anything worth keeping, teaches Chrome the app is not engaged.
import { useEffect, useRef } from 'react';

/** Asks the phone to keep the storage; true when it does. A browser without the call, or one that throws, is false. */
export async function persistStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** Asks once, the first time `hasLearner` is true. */
export function usePersistStorage(hasLearner: boolean): void {
  const asked = useRef(false);
  useEffect(() => {
    if (!hasLearner || asked.current) return;
    asked.current = true;
    void persistStorage();
  }, [hasLearner]);
}

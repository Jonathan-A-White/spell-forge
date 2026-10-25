// src/features/tutor/use-draft.ts: text being typed, kept on the device (M14, topic 16). Written 500 ms after the last
// key and whenever the screen goes away or the app is hidden, so a reload or a screen lock loses nothing; cleared
// when the text is sent. The key is fixed for the life of the component.

import { useCallback, useEffect, useRef, useState } from 'react';

export const DRAFT_DELAY_MS = 500;

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function write(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // storage full or refused: the draft is only a convenience
  }
}

export function useDraft(key: string): [string, (value: string) => void, () => void] {
  const [draft, setDraftState] = useState(() => read(key));
  const latest = useRef(draft);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    write(key, latest.current);
  }, [key]);

  const setDraft = useCallback(
    (value: string) => {
      latest.current = value;
      dirty.current = true;
      setDraftState(value);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, DRAFT_DELAY_MS);
    },
    [flush],
  );

  const clearDraft = useCallback(() => {
    clearTimeout(timer.current);
    latest.current = '';
    dirty.current = false;
    setDraftState('');
    write(key, '');
  }, [key]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  return [draft, setDraft, clearDraft];
}

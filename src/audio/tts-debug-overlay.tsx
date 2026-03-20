// src/audio/tts-debug-overlay.tsx — Toggleable on-screen TTS debug log.
// Persists the enabled/disabled state in localStorage so it survives reloads.
// Mount once at the app root — it intercepts console.log globally.

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'sf-tts-debug';

const TAG_PATTERN = /\[TTS |\[AudioMgr\]|\[HearIt\]|\[Audio\]/;

export function TtsDebugOverlay() {
  const [enabled, setEnabled] = useState(
    () => localStorage.getItem(STORAGE_KEY) === '1',
  );
  const [lines, setLines] = useState<string[]>([]);

  // Intercept console.log when enabled.
  useEffect(() => {
    if (!enabled) return;

    const orig = console.log.bind(console);
    console.log = (...args: unknown[]) => {
      orig(...args);
      const line = args
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ');
      if (TAG_PATTERN.test(line)) {
        setLines((prev) => [...prev.slice(-29), line]);
      }
    };
    return () => {
      console.log = orig;
    };
  }, [enabled]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      if (!next) setLines([]);
      return next;
    });
  }, []);

  return (
    <>
      {/* Toggle button — always visible, small and unobtrusive */}
      <button
        onClick={toggle}
        className="fixed top-1 right-1 z-[60] bg-black/70 text-[10px] font-mono px-2 py-0.5 rounded"
        style={{ color: enabled ? '#4ade80' : '#6b7280' }}
        aria-label={enabled ? 'Disable TTS debug overlay' : 'Enable TTS debug overlay'}
      >
        TTS {enabled ? 'ON' : 'OFF'}
      </button>

      {/* Log overlay */}
      {enabled && lines.length > 0 && (
        <div
          onClick={() => setLines([])}
          className="fixed bottom-0 left-0 right-0 z-50 bg-black/90 text-green-400 text-[10px] leading-tight font-mono p-2 max-h-[40vh] overflow-y-auto"
        >
          {lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
          <div className="text-gray-500 mt-1">tap to clear</div>
        </div>
      )}
    </>
  );
}

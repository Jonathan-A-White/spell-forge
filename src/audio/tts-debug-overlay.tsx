// src/audio/tts-debug-overlay.tsx — On-screen TTS debug log panel.
// Enable/disable is controlled externally (settings panel).  This component
// only renders the log overlay when enabled.

import { useState, useEffect } from 'react';

const TAG_PATTERN = /\[TTS |\[AudioMgr\]|\[HearIt\]|\[Audio\]/;

/** Log overlay — renders only when enabled.  Mount once at app root. */
export function TtsDebugOverlay({ enabled }: { enabled: boolean }) {
  // Lines are only collected while enabled.  When disabled → enabled, we
  // start fresh because the effect cleanup restores console.log and the
  // state initialiser provides an empty array.
  return enabled ? <TtsDebugLog /> : null;
}

function TtsDebugLog() {
  const [lines, setLines] = useState<string[]>([]);

  // Intercept console.log while mounted.
  useEffect(() => {
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
  }, []);

  if (lines.length === 0) return null;

  return (
    <div
      onClick={() => setLines([])}
      className="fixed bottom-0 left-0 right-0 z-50 bg-black/90 text-green-400 text-[10px] leading-tight font-mono p-2 max-h-[40vh] overflow-y-auto"
    >
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
      <div className="text-gray-500 mt-1">tap to clear</div>
    </div>
  );
}

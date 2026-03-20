// src/debug/debug-overlay.tsx — On-screen debug overlay that logs tap/click
// events and highlights interactive elements.  Helps diagnose click-target
// issues (z-index, pointer-events, overlapping elements).

import { useState, useEffect, useCallback } from 'react';

interface TapLogEntry {
  timestamp: number;
  tag: string;
  classes: string;
  text: string;
  rect: { x: number; y: number; w: number; h: number };
  clientX: number;
  clientY: number;
  pointerEvents: string;
  zIndex: string;
  position: string;
  interactive: boolean;
}

/** Debug overlay — renders only when enabled. Mount once at app root. */
export function DebugOverlay({ enabled }: { enabled: boolean }) {
  return enabled ? <DebugOverlayInner /> : null;
}

function DebugOverlayInner() {
  const [tapLog, setTapLog] = useState<TapLogEntry[]>([]);
  const [highlightMode, setHighlightMode] = useState(true);

  // Capture all click/tap events at the document level
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      const rect = target.getBoundingClientRect();
      const computed = window.getComputedStyle(target);
      const isInteractive =
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.getAttribute('role') === 'button' ||
        target.hasAttribute('onclick') ||
        target.closest('button') !== null ||
        target.closest('a') !== null;

      const entry: TapLogEntry = {
        timestamp: Date.now(),
        tag: target.tagName.toLowerCase(),
        classes: target.className?.toString().slice(0, 80) || '',
        text: (target.textContent || '').slice(0, 30).trim(),
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        },
        clientX: Math.round(e.clientX),
        clientY: Math.round(e.clientY),
        pointerEvents: computed.pointerEvents,
        zIndex: computed.zIndex,
        position: computed.position,
        interactive: isInteractive,
      };

      setTapLog((prev) => [...prev.slice(-19), entry]);
    };

    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, []);

  const clearLog = useCallback(() => setTapLog([]), []);

  return (
    <>
      {/* Highlight all buttons/links with colored outlines */}
      {highlightMode && <HighlightStyles />}

      {/* Tap log panel */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[9999] bg-black/90 text-green-400 text-[10px] leading-tight font-mono p-2 max-h-[40vh] overflow-y-auto"
        style={{ pointerEvents: 'auto' }}
      >
        <div className="flex items-center justify-between mb-1 text-gray-400">
          <span>Debug: Tap Log ({tapLog.length})</span>
          <div className="flex gap-2">
            <button
              onClick={() => setHighlightMode((h) => !h)}
              className="text-yellow-400 underline"
            >
              {highlightMode ? 'hide outlines' : 'show outlines'}
            </button>
            <button onClick={clearLog} className="text-gray-500 underline">
              clear
            </button>
          </div>
        </div>

        {tapLog.length === 0 && (
          <div className="text-gray-500">Tap anywhere to see event details...</div>
        )}

        {tapLog.map((entry, i) => (
          <div
            key={i}
            className={`border-b border-gray-800 py-0.5 ${
              entry.interactive ? 'text-green-400' : 'text-red-400'
            }`}
          >
            <div>
              {entry.interactive ? 'OK' : 'NO'} &lt;{entry.tag}&gt; "{entry.text}"
              @ ({entry.clientX},{entry.clientY})
            </div>
            <div className="text-gray-500">
              pos:{entry.position} z:{entry.zIndex} ptr:{entry.pointerEvents}
              rect:[{entry.rect.x},{entry.rect.y} {entry.rect.w}x{entry.rect.h}]
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** Inject a <style> tag that highlights all interactive elements */
function HighlightStyles() {
  useEffect(() => {
    const style = document.createElement('style');
    style.setAttribute('data-sf-debug', 'true');
    style.textContent = `
      button, a, [role="button"], input, select, textarea {
        outline: 2px solid rgba(0, 255, 0, 0.5) !important;
        outline-offset: 1px !important;
      }
      [style*="pointer-events: none"], .pointer-events-none {
        outline: 2px dashed rgba(255, 0, 0, 0.5) !important;
        outline-offset: 1px !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return null;
}

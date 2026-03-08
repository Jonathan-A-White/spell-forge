// src/features/word-lists/qr-share.tsx — Show a QR code for sharing a word list

import { useState, useEffect } from 'react';
import { encodeWordListToQr } from './qr-codec';

interface QrShareProps {
  listName: string;
  words: string[];
  testDate?: Date | null;
  onClose: () => void;
}

export function QrShare({ listName, words, testDate, onClose }: QrShareProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    encodeWordListToQr(listName, words, testDate)
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to generate QR code'); });
    return () => { cancelled = true; };
  }, [listName, words, testDate]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-sf-surface rounded-xl border border-sf-border p-6 max-w-sm w-full shadow-xl">
        <h2 className="text-lg font-bold text-sf-heading mb-1">Share Word List</h2>
        <p className="text-sm text-sf-muted mb-4">
          Have someone scan this QR code to import <strong className="text-sf-heading">{listName}</strong> ({words.length} word{words.length !== 1 ? 's' : ''})
        </p>

        {error && (
          <div className="bg-red-500/10 text-red-600 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        {!error && !qrDataUrl && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-sf-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {qrDataUrl && (
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white rounded-xl p-3">
              <img
                src={qrDataUrl}
                alt={`QR code for word list: ${listName}`}
                className="w-64 h-64"
                data-testid="qr-code-image"
              />
            </div>
            <p className="text-xs text-sf-muted text-center">
              Open SpellForge on another device and use &quot;Import via QR&quot; to scan
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-4 px-4 py-2.5 rounded-lg text-sm font-bold text-sf-heading bg-sf-track hover:bg-sf-surface-hover transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

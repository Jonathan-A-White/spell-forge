// src/features/settings/share-panel.tsx — Share the app via clipboard, native share, or QR code

import { useState, useCallback } from 'react';
import { generateQrSvg } from './qr-code';

const APP_URL = 'https://jonathan-a-white.github.io/spell-forge/';

interface SharePanelProps {
  onBack: () => void;
}

export function SharePanel({ onBack }: SharePanelProps) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(APP_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select + copy via input
      const input = document.createElement('input');
      input.value = APP_URL;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  const handleNativeShare = useCallback(async () => {
    try {
      await navigator.share({
        title: 'SpellForge',
        text: 'Check out SpellForge — a fun spelling practice app for kids!',
        url: APP_URL,
      });
    } catch {
      // User cancelled or share failed — no action needed
    }
  }, []);

  const qrSvg = generateQrSvg(APP_URL, 220);

  return (
    <div className="min-h-screen bg-sf-bg">
      {/* Header */}
      <div className="bg-sf-surface border-b border-sf-border px-4 py-4">
        <div className="max-w-lg md:max-w-4xl lg:max-w-6xl mx-auto flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover transition-all"
            aria-label="Go back"
          >
            <BackArrowIcon />
          </button>
          <h1 className="text-xl font-bold text-sf-heading">Share SpellForge</h1>
        </div>
      </div>

      <div className="max-w-lg md:max-w-4xl lg:max-w-6xl mx-auto px-4 py-6 space-y-6">
        <p className="text-sf-text text-sm">
          Share SpellForge with other parents, teachers, or kids so they can practice spelling too!
        </p>

        {/* Copy to clipboard */}
        <button
          onClick={handleCopy}
          className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-sf-border bg-sf-surface hover:border-sf-border-strong hover:bg-sf-surface-hover transition-all active:scale-[0.98]"
        >
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-sf-track text-sf-muted">
            <ClipboardIcon />
          </div>
          <div className="text-left flex-1">
            <p className="font-bold text-sm text-sf-text">
              {copied ? 'Copied!' : 'Copy Link'}
            </p>
            <p className="text-xs text-sf-muted">Copy the app link to your clipboard</p>
          </div>
          {copied && (
            <div className="text-green-500">
              <CheckIcon />
            </div>
          )}
        </button>

        {/* Native share (mobile) */}
        {canNativeShare && (
          <button
            onClick={handleNativeShare}
            className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-sf-border bg-sf-surface hover:border-sf-border-strong hover:bg-sf-surface-hover transition-all active:scale-[0.98]"
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-sf-track text-sf-muted">
              <ShareIcon />
            </div>
            <div className="text-left flex-1">
              <p className="font-bold text-sm text-sf-text">Share via...</p>
              <p className="text-xs text-sf-muted">Text, email, or any app on your device</p>
            </div>
          </button>
        )}

        {/* QR Code toggle */}
        <button
          onClick={() => setShowQr(!showQr)}
          className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-sf-border bg-sf-surface hover:border-sf-border-strong hover:bg-sf-surface-hover transition-all active:scale-[0.98]"
        >
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-sf-track text-sf-muted">
            <QrIcon />
          </div>
          <div className="text-left flex-1">
            <p className="font-bold text-sm text-sf-text">Show QR Code</p>
            <p className="text-xs text-sf-muted">Let someone nearby scan to open the app</p>
          </div>
          <div className={`text-sf-muted transition-transform ${showQr ? 'rotate-180' : ''}`}>
            <ChevronIcon />
          </div>
        </button>

        {/* QR Code display */}
        {showQr && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div
              className="bg-white rounded-2xl p-4 shadow-lg"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="text-xs text-sf-muted text-center">
              Scan this code with any camera app
            </p>
          </div>
        )}

        {/* Direct link display */}
        <div className="bg-sf-surface rounded-xl border border-sf-border p-4">
          <p className="text-xs text-sf-muted mb-1">App link</p>
          <p className="text-sm text-sf-text font-mono break-all select-all">{APP_URL}</p>
        </div>
      </div>
    </div>
  );
}

// ─── SVG Icons ───────────────────────────────────────────────

function BackArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function QrIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="3" height="3" />
      <line x1="21" y1="14" x2="21" y2="14.01" />
      <line x1="21" y1="18" x2="21" y2="21" />
      <line x1="17" y1="21" x2="17" y2="21.01" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

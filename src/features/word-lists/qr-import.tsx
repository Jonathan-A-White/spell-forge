// src/features/word-lists/qr-import.tsx — Scan a QR code to import a word list

import { useState, useRef, useEffect, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { decodeQrPayload, type QrWordListPayload } from './qr-codec';

interface QrImportProps {
  onImport: (payload: QrWordListPayload) => void;
  onCancel: () => void;
}

type ScanStatus = 'scanning' | 'preview' | 'error' | 'no-camera';

export function QrImport({ onImport, onCancel }: QrImportProps) {
  const [status, setStatus] = useState<ScanStatus>('scanning');
  const [payload, setPayload] = useState<QrWordListPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (scanner) {
      try {
        const state = scanner.getState();
        // Html5QrcodeScannerState: 1 = NOT_STARTED, 2 = SCANNING, 3 = PAUSED
        if (state === 2 || state === 3) {
          await scanner.stop();
        }
      } catch {
        // Ignore stop errors during cleanup
      }
      scannerRef.current = null;
    }
  }, []);

  const handleScanSuccess = useCallback((decodedText: string) => {
    const decoded = decodeQrPayload(decodedText);
    if (!decoded) {
      setStatus('error');
      setErrorMessage('This QR code is not a SpellForge word list.');
      stopScanner();
      return;
    }
    setPayload(decoded);
    setStatus('preview');
    stopScanner();
  }, [stopScanner]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const scannerId = 'sf-qr-reader';
    const scanner = new Html5Qrcode(scannerId);
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      handleScanSuccess,
      () => { /* ignore scan failures — expected while aiming */ },
    ).catch(() => {
      setStatus('no-camera');
    });

    return () => { stopScanner(); };
  }, [handleScanSuccess, stopScanner]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const scanner = new Html5Qrcode('sf-qr-file-reader');
      const result = await scanner.scanFile(file, true);
      handleScanSuccess(result);
    } catch {
      setStatus('error');
      setErrorMessage('Could not read a QR code from that image.');
    }
  }, [handleScanSuccess]);

  const handleRetry = useCallback(() => {
    setStatus('scanning');
    setPayload(null);
    setErrorMessage('');
    startedRef.current = false;
  }, []);

  return (
    <div className="min-h-screen bg-sf-bg p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => { stopScanner(); onCancel(); }}
          className="text-sf-muted hover:text-sf-secondary"
        >
          Cancel
        </button>
        <h1 className="text-xl font-bold text-sf-heading">Import via QR</h1>
        <div className="w-14" />
      </div>

      {status === 'scanning' && (
        <div className="space-y-4">
          <div className="rounded-xl overflow-hidden border border-sf-border bg-black">
            <div id="sf-qr-reader" ref={containerRef} style={{ width: '100%' }} />
          </div>
          <p className="text-sf-muted text-sm text-center">
            Point your camera at a SpellForge QR code
          </p>
        </div>
      )}

      {status === 'no-camera' && (
        <div className="text-center py-8 space-y-4">
          <div className="text-5xl mb-4">📷</div>
          <p className="text-sf-heading font-bold text-lg">Camera not available</p>
          <p className="text-sf-muted text-sm">
            You can upload a photo of the QR code instead.
          </p>
          {/* Hidden container for the file-based scanner */}
          <div id="sf-qr-file-reader" style={{ display: 'none' }} />
          <label className="inline-block bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-8 rounded-xl transition-colors shadow-md cursor-pointer">
            Choose Photo
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
              data-testid="qr-file-input"
            />
          </label>
        </div>
      )}

      {status === 'error' && (
        <div className="text-center py-12 space-y-4">
          <div className="text-5xl mb-4">⚠️</div>
          <p className="text-sf-heading font-bold text-lg">Couldn&apos;t import</p>
          <p className="text-sf-muted text-sm">{errorMessage}</p>
          {/* Hidden container for the file-based scanner */}
          <div id="sf-qr-file-reader" style={{ display: 'none' }} />
          <div className="flex flex-col gap-3 mt-6">
            <button
              onClick={handleRetry}
              className="bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-8 rounded-xl transition-colors shadow-md"
            >
              Try Again
            </button>
            <button
              onClick={() => { stopScanner(); onCancel(); }}
              className="text-sf-muted hover:text-sf-secondary py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {status === 'preview' && payload && (
        <div className="space-y-4">
          <div className="bg-sf-surface rounded-xl border border-sf-border p-4">
            <p className="font-bold text-sf-heading text-lg mb-1">{payload.n}</p>
            <p className="text-sm text-sf-muted mb-3">
              {payload.w.length} word{payload.w.length !== 1 ? 's' : ''}
              {payload.t && <> · Test: {payload.t}</>}
            </p>
            <div className="flex flex-wrap gap-2">
              {payload.w.map((word) => (
                <span
                  key={word}
                  className="px-3 py-1.5 rounded-full text-sm font-medium bg-sf-primary/10 text-sf-heading"
                >
                  {word}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 mt-4">
            <button
              onClick={() => onImport(payload)}
              className="bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-8 rounded-xl transition-colors shadow-md"
              data-testid="qr-import-confirm"
            >
              Import {payload.w.length} Word{payload.w.length !== 1 ? 's' : ''}
            </button>
            <button
              onClick={() => { stopScanner(); onCancel(); }}
              className="text-sf-muted hover:text-sf-secondary py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

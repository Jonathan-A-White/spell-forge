// src/features/word-lists/camera-import.tsx — Camera / photo import for word lists

import { useState, useRef, useCallback } from 'react';
import type { OcrManager } from '../../ocr';
import { filterImportWords } from '../../ocr';
import type { OcrResult } from '../../contracts/types';

type CameraImportStatus = 'idle' | 'processing' | 'preview' | 'error';

interface CameraImportProps {
  ocrManager: OcrManager;
  importFilterPhrases?: string[];
  onWordsAccepted: (words: string[]) => void;
  onCancel: () => void;
}

export function CameraImport({ ocrManager, importFilterPhrases, onWordsAccepted, onCancel }: CameraImportProps) {
  const [status, setStatus] = useState<CameraImportStatus>('idle');
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = useCallback(async (file: File) => {
    setStatus('processing');
    setErrorMessage('');

    try {
      const result = await ocrManager.extractWords(file);

      // Apply import filter to auto-exclude heading words
      const filteredWords = importFilterPhrases?.length
        ? filterImportWords(result.words, importFilterPhrases)
        : result.words;
      const filteredResult: OcrResult = { ...result, words: filteredWords };

      if (filteredResult.words.length === 0) {
        setStatus('error');
        setErrorMessage('No words found in the image. Try a clearer photo.');
        return;
      }

      setOcrResult(filteredResult);
      setSelectedWords(new Set(filteredResult.words));
      setStatus('preview');
    } catch (err) {
      setStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to process image',
      );
    }
  }, [ocrManager, importFilterPhrases]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelected(file);
      }
    },
    [handleFileSelected],
  );

  const toggleWord = useCallback((word: string) => {
    setSelectedWords((prev) => {
      const next = new Set(prev);
      if (next.has(word)) {
        next.delete(word);
      } else {
        next.add(word);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (ocrResult) {
      setSelectedWords(new Set(ocrResult.words));
    }
  }, [ocrResult]);

  const deselectAll = useCallback(() => {
    setSelectedWords(new Set());
  }, []);

  const handleAccept = useCallback(() => {
    onWordsAccepted(Array.from(selectedWords));
  }, [selectedWords, onWordsAccepted]);

  const handleRetry = useCallback(() => {
    setStatus('idle');
    setOcrResult(null);
    setSelectedWords(new Set());
    setErrorMessage('');
    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  return (
    <div className="min-h-screen bg-sf-bg p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onCancel}
          className="text-sf-muted hover:text-sf-secondary"
        >
          Cancel
        </button>
        <h1 className="text-xl font-bold text-sf-heading">Import from Photo</h1>
        <div className="w-14" /> {/* spacer for centering */}
      </div>

      {status === 'idle' && (
        <div className="text-center py-12 space-y-6">
          <div className="text-5xl mb-4">📸</div>
          <p className="text-sf-heading font-bold text-lg">
            Take a photo or choose an image
          </p>
          <p className="text-sf-muted text-sm">
            Snap a picture of a spelling word list and we'll extract the words automatically.
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-8 rounded-xl transition-colors shadow-md"
            >
              Choose Photo
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleInputChange}
            className="hidden"
            data-testid="camera-file-input"
          />
        </div>
      )}

      {status === 'processing' && (
        <div className="text-center py-12 space-y-4">
          <div className="inline-block w-10 h-10 border-4 border-sf-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sf-heading font-bold">Reading words from image...</p>
          <p className="text-sf-muted text-sm">This may take a few seconds</p>
        </div>
      )}

      {status === 'error' && (
        <div className="text-center py-12 space-y-4">
          <div className="text-5xl mb-4">⚠️</div>
          <p className="text-sf-heading font-bold text-lg">Something went wrong</p>
          <p className="text-sf-muted text-sm">{errorMessage}</p>
          <div className="flex flex-col gap-3 mt-6">
            <button
              onClick={handleRetry}
              className="bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-8 rounded-xl transition-colors shadow-md"
            >
              Try Again
            </button>
            <button
              onClick={onCancel}
              className="text-sf-muted hover:text-sf-secondary py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {status === 'preview' && ocrResult && (
        <div className="space-y-4">
          <div className="bg-sf-surface rounded-xl border border-sf-border p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-sf-heading">
                Found {ocrResult.words.length} word{ocrResult.words.length !== 1 ? 's' : ''}
              </p>
              <span className="text-xs text-sf-muted">
                Confidence: {Math.round(ocrResult.confidence * 100)}%
              </span>
            </div>

            <div className="flex gap-2 mb-3">
              <button
                onClick={selectAll}
                className="text-xs text-sf-primary hover:underline"
              >
                Select all
              </button>
              <span className="text-sf-muted">·</span>
              <button
                onClick={deselectAll}
                className="text-xs text-sf-primary hover:underline"
              >
                Deselect all
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {ocrResult.words.map((word) => {
                const isSelected = selectedWords.has(word);
                return (
                  <button
                    key={word}
                    onClick={() => toggleWord(word)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      isSelected
                        ? 'bg-sf-primary text-sf-primary-text'
                        : 'bg-sf-track text-sf-muted line-through'
                    }`}
                  >
                    {word}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-sm text-sf-muted text-center">
            Tap words to include or exclude them.{' '}
            {selectedWords.size} of {ocrResult.words.length} selected.
          </p>

          <div className="flex flex-col gap-3 mt-4">
            <button
              onClick={handleAccept}
              disabled={selectedWords.size === 0}
              className="bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-8 rounded-xl transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add {selectedWords.size} Word{selectedWords.size !== 1 ? 's' : ''}
            </button>
            <button
              onClick={handleRetry}
              className="text-sf-muted hover:text-sf-secondary py-2 text-sm"
            >
              Retake Photo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

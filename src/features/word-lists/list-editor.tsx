// src/features/word-lists/list-editor.tsx — Word list CRUD UI

import { useState, useCallback, useRef } from 'react';
import type { WordList } from '../../contracts/types';
import type { OcrManager } from '../../ocr';
import { filterImportWords } from '../../ocr';

interface ListEditorProps {
  list?: WordList | null;
  existingWords: string[];
  ocrManager?: OcrManager | null;
  importFilterPhrases?: string[];
  onSave: (name: string, words: string[], testDate: Date | null, source?: WordList['source']) => void;
  onCancel: () => void;
}

export function ListEditor({ list, existingWords, ocrManager, importFilterPhrases, onSave, onCancel }: ListEditorProps) {
  const [name, setName] = useState(list?.name ?? '');
  const [wordsText, setWordsText] = useState(existingWords.join('\n'));
  const [testDate, setTestDate] = useState(
    list?.testDate ? formatDate(list.testDate) : '',
  );
  const [usedCamera, setUsedCamera] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'processing' | 'error'>('idle');
  const [ocrError, setOcrError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = useCallback(() => {
    const words = wordsText
      .split(/[\n,]+/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length > 0);

    if (name.trim() === '' || words.length === 0) return;

    const source = usedCamera ? 'camera' as const : undefined;
    onSave(name.trim(), words, testDate ? new Date(testDate) : null, source);
  }, [name, wordsText, testDate, usedCamera, onSave]);

  const handlePhotoSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ocrManager) return;

    setOcrStatus('processing');
    setOcrError('');

    try {
      const result = await ocrManager.extractWords(file);

      if (result.words.length === 0) {
        setOcrStatus('error');
        setOcrError('No words found. Try a clearer photo.');
        return;
      }

      // Apply import filter to auto-exclude heading words
      const filteredWords = importFilterPhrases?.length
        ? filterImportWords(result.words, importFilterPhrases)
        : result.words;

      if (filteredWords.length === 0) {
        setOcrStatus('error');
        setOcrError('No words found after filtering. Try a clearer photo.');
        return;
      }

      // Append OCR words to existing text
      const existing = wordsText.trim();
      const newWords = filteredWords.join('\n');
      setWordsText(existing ? `${existing}\n${newWords}` : newWords);
      setUsedCamera(true);
      setOcrStatus('idle');
    } catch (err) {
      setOcrStatus('error');
      setOcrError(err instanceof Error ? err.message : 'Failed to read image');
    }

    // Reset input so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [ocrManager, wordsText, importFilterPhrases]);

  const wordCount = wordsText
    .split(/[\n,]+/)
    .filter((w) => w.trim().length > 0).length;

  return (
    <div className="min-h-screen bg-sf-bg p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onCancel} className="text-sf-muted hover:text-sf-secondary">
          Cancel
        </button>
        <h1 className="text-xl font-bold text-sf-heading">
          {list ? 'Edit List' : 'New Word List'}
        </h1>
        <button
          onClick={handleSave}
          className="text-sf-muted hover:text-sf-secondary font-bold"
          disabled={name.trim() === '' || wordCount === 0}
        >
          Save
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-sf-secondary mb-1">
            List Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Week 12"
            className="w-full border border-sf-input-border rounded-lg px-4 py-3 text-sf-heading bg-sf-input-bg focus:outline-none focus:ring-2 focus:ring-sf-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-sf-secondary mb-1">
            Test Date (optional)
          </label>
          <input
            type="date"
            value={testDate}
            onChange={(e) => setTestDate(e.target.value)}
            className="w-full border border-sf-input-border rounded-lg px-4 py-3 text-sf-heading bg-sf-input-bg focus:outline-none focus:ring-2 focus:ring-sf-primary"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-sf-secondary">
              Words (one per line or comma-separated)
            </label>
            {ocrManager && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={ocrStatus === 'processing'}
                className="inline-flex items-center gap-1.5 text-sm text-sf-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="camera-import-btn"
              >
                <CameraIcon />
                {ocrStatus === 'processing' ? 'Reading...' : 'Import from camera'}
              </button>
            )}
          </div>

          {ocrStatus === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2 text-sm text-red-700">
              {ocrError}
            </div>
          )}

          <textarea
            value={wordsText}
            onChange={(e) => setWordsText(e.target.value)}
            rows={10}
            placeholder="knight&#10;bridge&#10;light&#10;because"
            className="w-full border border-sf-input-border rounded-lg px-4 py-3 text-sf-heading bg-sf-input-bg focus:outline-none focus:ring-2 focus:ring-sf-primary font-mono"
          />
          <p className="text-sm text-sf-muted mt-1">{wordCount} words</p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoSelected}
            className="hidden"
            data-testid="camera-file-input"
          />
        </div>
      </div>
    </div>
  );
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

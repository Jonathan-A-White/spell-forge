// src/features/word-lists/list-editor.tsx — Word list CRUD UI with multilingual support

import { useState, useCallback, useRef } from 'react';
import type { WordList } from '../../contracts/types';
import type { OcrManager } from '../../ocr';
import { filterImportWords } from '../../ocr';
import { getAllLanguages, getLanguageConfig, DEFAULT_LANGUAGE } from '../../i18n/language-registry.ts';

interface ListEditorProps {
  list?: WordList | null;
  existingWords: string[];
  ocrManager?: OcrManager | null;
  importFilterPhrases?: string[];
  onSave: (name: string, words: string[], testDate: Date | null, source?: WordList['source'], language?: string) => void;
  onCancel: () => void;
}

export function ListEditor({ list, existingWords, ocrManager, importFilterPhrases, onSave, onCancel }: ListEditorProps) {
  const [name, setName] = useState(list?.name ?? '');
  const [language, setLanguage] = useState<string>(list?.language ?? DEFAULT_LANGUAGE);
  const [wordsText, setWordsText] = useState(existingWords.join('\n'));
  const [testDate, setTestDate] = useState(
    list?.testDate ? formatDate(list.testDate) : '',
  );
  const [usedCamera, setUsedCamera] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'processing' | 'error'>('idle');
  const [ocrError, setOcrError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const langConfig = getLanguageConfig(language);
  const ocrAvailable = ocrManager && langConfig.hasOCR;

  const handleSave = useCallback(() => {
    const words = wordsText
      .split(/[\n,]+/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length > 0);

    if (name.trim() === '' || words.length === 0) return;

    const source = usedCamera ? 'camera' as const : undefined;
    onSave(name.trim(), words, testDate ? new Date(testDate) : null, source, language);
  }, [name, wordsText, testDate, usedCamera, language, onSave]);

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

  const allLanguages = getAllLanguages();

  return (
    <div className="min-h-screen bg-sf-bg p-4 max-w-lg md:max-w-4xl lg:max-w-6xl mx-auto">
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

        {/* Language selector */}
        <div>
          <label className="block text-sm font-medium text-sf-secondary mb-1">
            Language
          </label>
          <div className="flex gap-2 flex-wrap">
            {allLanguages.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => setLanguage(lang.code)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  language === lang.code
                    ? 'bg-sf-primary text-sf-primary-text border-sf-primary'
                    : 'bg-sf-surface text-sf-heading border-sf-border hover:border-sf-primary'
                }`}
              >
                {lang.displayName}
                {lang.code !== 'en' && (
                  <span className="ml-1 text-xs opacity-70">({lang.nativeName})</span>
                )}
              </button>
            ))}
          </div>

          {/* Language feature notes */}
          {language !== 'en' && (
            <div className="mt-2 text-xs text-sf-muted space-y-0.5">
              {langConfig.hasPhonics ? (
                <p className="text-green-600">Phonics patterns available for {langConfig.displayName}.</p>
              ) : (
                <p>Note: Phonics patterns not yet available for {langConfig.displayName}. Words can still be practiced.</p>
              )}
              {!langConfig.hasOCR && (
                <p>Note: Camera import not yet available for {langConfig.displayName}.</p>
              )}
              {langConfig.strictAccents && (
                <p>Accents are required for correct spelling (e.g., caf&eacute; not cafe).</p>
              )}
            </div>
          )}
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
            {/* Camera import button — greyed out when OCR not available for this language */}
            {ocrManager && (
              <button
                type="button"
                onClick={() => ocrAvailable && fileInputRef.current?.click()}
                disabled={ocrStatus === 'processing' || !ocrAvailable}
                className={`inline-flex items-center gap-1.5 text-sm disabled:cursor-not-allowed ${
                  ocrAvailable
                    ? 'text-sf-primary hover:underline disabled:opacity-50'
                    : 'text-sf-muted opacity-40'
                }`}
                title={ocrAvailable ? 'Import words from a photo' : `Camera import not available for ${langConfig.displayName}`}
                data-testid="camera-import-btn"
              >
                <CameraIcon />
                {ocrStatus === 'processing'
                  ? 'Reading...'
                  : ocrAvailable
                    ? 'Import from photo'
                    : 'Camera (not available)'}
              </button>
            )}
          </div>

          {ocrAvailable && ocrStatus === 'idle' && (
            <p className="text-xs text-sf-muted mb-2">
              Tip: Lay the list flat in good light and fill the frame with the words — any rotation is fine.
            </p>
          )}

          {ocrStatus === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2 text-sm text-red-700">
              {ocrError}
            </div>
          )}

          <textarea
            value={wordsText}
            onChange={(e) => setWordsText(e.target.value)}
            rows={10}
            placeholder={language === 'es'
              ? "casa\nmonta\u00f1a\nfamilia\ncaf\u00e9"
              : "knight\nbridge\nlight\nbecause"}
            className="w-full border border-sf-input-border rounded-lg px-4 py-3 text-sf-heading bg-sf-input-bg focus:outline-none focus:ring-2 focus:ring-sf-primary font-mono"
          />
          <p className="text-sm text-sf-muted mt-1">{wordCount} words</p>

          {/* No `capture` attribute: the OS picker offers both camera and
              existing photos, so users can re-import a saved photo. */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
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

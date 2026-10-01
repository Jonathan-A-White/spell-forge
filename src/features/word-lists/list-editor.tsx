// src/features/word-lists/list-editor.tsx — Word list CRUD UI with multilingual support

import { useState, useCallback, useEffect, useRef } from 'react';
import type { WordList } from '../../contracts/types';
import { wordRepo } from '../../data/repositories';
import type { OcrManager } from '../../ocr';
import { getAllLanguages, getLanguageConfig, DEFAULT_LANGUAGE } from '../../i18n/language-registry.ts';
import { normalizeWords } from './add-words';
import { startPhotoImport, usePhotoImportStatus } from './photo-import';

interface ListEditorProps {
  list?: WordList | null;
  existingWords: string[];
  ocrManager?: OcrManager | null;
  /** Whose list this is; a photo import needs it. */
  profileId?: string;
  /** Saves a new list with no words yet, so a photo has a list to fill; the editor goes on editing it. */
  onCreateList?: (name: string, testDate: Date | null, language: string) => Promise<WordList>;
  onSave: (name: string, words: string[], testDate: Date | null, source?: WordList['source'], language?: string) => void;
  onCancel: () => void;
}

export function ListEditor({ list, existingWords, ocrManager, profileId, onCreateList, onSave, onCancel }: ListEditorProps) {
  const [name, setName] = useState(list?.name ?? '');
  const [language, setLanguage] = useState<string>(list?.language ?? DEFAULT_LANGUAGE);
  const [wordsText, setWordsText] = useState(existingWords.join('\n'));
  const [testDate, setTestDate] = useState(
    list?.testDate ? formatDate(list.testDate) : '',
  );
  const [usedCamera, setUsedCamera] = useState(false);
  const [starting, setStarting] = useState(false);
  const [importError, setImportError] = useState('');
  const [createdList, setCreatedList] = useState<WordList | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The list a photo fills: this one, or the one saved for the first photo of a new list.
  const savedList = list ?? createdList;
  const importStatus = usePhotoImportStatus(savedList?.id);
  const reading = starting || importStatus === 'reading';
  // Words the editor has shown: what it opened with, then each word it appended from an import.
  const seenWords = useRef(new Set(normalizeWords(existingWords)));
  // A failed read is told only to the parent who just picked the photo, not to one who comes back later.
  const [pickedPhoto, setPickedPhoto] = useState(false);

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

  /** Appends the words an import has landed in the saved list, once each, after whatever the parent has typed. */
  const absorbLandedWords = useCallback(async (listId: string) => {
    const rows = await wordRepo.getByListId(listId);
    rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.text.localeCompare(b.text));
    const landed = rows.map((w) => w.text).filter((text) => !seenWords.current.has(text));
    if (landed.length === 0) return;
    landed.forEach((text) => seenWords.current.add(text));
    setWordsText((current) => {
      const typed = new Set(normalizeWords(current.split(/[\n,]+/)));
      const fresh = landed.filter((text) => !typed.has(text));
      if (fresh.length === 0) return current;
      const existing = current.trim();
      return existing ? `${existing}\n${fresh.join('\n')}` : fresh.join('\n');
    });
  }, []);

  const handlePhotoSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const input = e.target;
    if (!file || !ocrManager || !profileId) return;

    setStarting(true);
    setImportError('');
    setPickedPhoto(true);

    try {
      // A new list is saved first, so there is something for the words to land in.
      let target = savedList;
      if (!target) {
        if (!onCreateList) return;
        target = await onCreateList(name.trim() || photoListName(new Date()), testDate ? new Date(testDate) : null, language);
        setCreatedList(target);
        // The field shows the name the list was saved under, so Save works once the words land.
        setName(target.name);
      }
      setUsedCamera(true);
      await startPhotoImport({ listId: target.id, profileId, file, language }, { ocrManager });
      await absorbLandedWords(target.id);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to read image');
    } finally {
      setStarting(false);
      // Reset input so the same file can be re-selected
      input.value = '';
    }
  }, [ocrManager, profileId, savedList, onCreateList, name, testDate, language, absorbLandedWords]);

  // Words that land while the editor is open, once the import stops reading.
  const wasReading = useRef(false);
  useEffect(() => {
    const isReading = importStatus === 'reading';
    if (wasReading.current && !isReading && savedList) void absorbLandedWords(savedList.id);
    wasReading.current = isReading;
  }, [importStatus, savedList, absorbLandedWords]);

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
                disabled={reading || !ocrAvailable}
                className={`inline-flex items-center gap-1.5 text-sm disabled:cursor-not-allowed ${
                  ocrAvailable
                    ? 'text-sf-primary hover:underline disabled:opacity-50'
                    : 'text-sf-muted opacity-40'
                }`}
                title={ocrAvailable ? 'Import words from a photo' : `Camera import not available for ${langConfig.displayName}`}
                data-testid="camera-import-btn"
              >
                <CameraIcon />
                {reading
                  ? 'Reading...'
                  : ocrAvailable
                    ? 'Import from photo'
                    : 'Camera (not available)'}
              </button>
            )}
          </div>

          {ocrAvailable && !reading && (
            <p className="text-xs text-sf-muted mb-2">
              Tip: Lay the list flat in good light and fill the frame with the words — any rotation is fine.
            </p>
          )}

          {reading && (
            <p role="status" className="bg-sf-surface border border-sf-border rounded-lg px-3 py-2 mb-2 text-sm text-sf-secondary">
              Reading your photo...
            </p>
          )}

          {importStatus === 'device' && !reading && (
            <p role="status" className="text-xs text-sf-muted mb-2">
              Read on this device
            </p>
          )}

          {(importError || (importStatus === 'failed' && pickedPhoto)) && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2 text-sm text-red-700">
              {importError || 'No words found. Try a clearer photo.'}
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The name a list gets when the parent picks a photo before typing one, e.g. 'Photo list 1 Oct'. */
function photoListName(date: Date): string {
  return `Photo list ${date.getDate()} ${MONTHS[date.getMonth()]}`;
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

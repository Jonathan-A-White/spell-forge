// src/features/word-lists/record-test-results.tsx — Record real-world spelling test results

import { useState } from 'react';
import type { Word, WordList, TestWordResult } from '../../contracts/types';

interface RecordTestResultsProps {
  list: WordList;
  words: Word[];
  onSave: (wordResults: TestWordResult[], overridePercent: number | null) => void;
  onCancel: () => void;
}

export function RecordTestResults({
  list,
  words,
  onSave,
  onCancel,
}: RecordTestResultsProps) {
  // Initialize all words as unmarked (null = not yet marked)
  const [results, setResults] = useState<Map<string, boolean | null>>(
    () => new Map(words.map((w) => [w.id, null]))
  );
  const [useOverride, setUseOverride] = useState(false);
  const [overrideValue, setOverrideValue] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const markedCount = Array.from(results.values()).filter((v) => v !== null).length;
  const correctCount = Array.from(results.values()).filter((v) => v === true).length;
  const wrongCount = Array.from(results.values()).filter((v) => v === false).length;
  const allMarked = markedCount === words.length;
  const calculatedPercent = words.length > 0
    ? Math.round((correctCount / words.length) * 100)
    : 0;

  const toggleWord = (wordId: string) => {
    setResults((prev) => {
      const next = new Map(prev);
      const current = next.get(wordId);
      if (current === null) {
        next.set(wordId, true); // first tap = correct
      } else if (current === true) {
        next.set(wordId, false); // second tap = wrong
      } else {
        next.set(wordId, null); // third tap = unmarked
      }
      return next;
    });
  };

  const markAllCorrect = () => {
    setResults(new Map(words.map((w) => [w.id, true])));
  };

  const markAllWrong = () => {
    setResults(new Map(words.map((w) => [w.id, false])));
  };

  const handleSave = () => {
    const wordResults: TestWordResult[] = words.map((w) => ({
      wordId: w.id,
      word: w.text,
      correct: results.get(w.id) === true,
    }));

    const override = useOverride && overrideValue !== ''
      ? Math.min(100, Math.max(0, parseInt(overrideValue, 10)))
      : null;

    onSave(wordResults, isNaN(override as number) ? null : override);
  };

  return (
    <div className="min-h-screen bg-sf-bg">
      {/* Header */}
      <div className="bg-sf-surface border-b border-sf-border px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="p-2 -ml-2 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover transition-all"
              aria-label="Cancel"
            >
              <BackArrowIcon />
            </button>
            <div>
              <h1 className="text-xl font-bold text-sf-heading">Record Test Results</h1>
              <p className="text-xs text-sf-muted">{list.name}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Instructions */}
        <div className="bg-sf-surface rounded-xl border border-sf-border p-4">
          <p className="text-sm text-sf-heading font-medium mb-1">Tap each word to mark it:</p>
          <div className="flex items-center gap-4 text-xs text-sf-muted">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-green-500" /> Correct
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500" /> Wrong
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-sf-track" /> Unmarked
            </span>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2">
          <button
            onClick={markAllCorrect}
            className="flex-1 px-3 py-2 rounded-lg bg-green-500/10 text-green-700 text-xs font-bold hover:bg-green-500/20 transition-colors"
          >
            All Correct
          </button>
          <button
            onClick={markAllWrong}
            className="flex-1 px-3 py-2 rounded-lg bg-red-500/10 text-red-700 text-xs font-bold hover:bg-red-500/20 transition-colors"
          >
            All Wrong
          </button>
        </div>

        {/* Word list */}
        <div className="space-y-1">
          {words.map((word) => {
            const status = results.get(word.id);
            return (
              <button
                key={word.id}
                onClick={() => toggleWord(word.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all ${
                  status === true
                    ? 'bg-green-500/10 border-green-500/30 text-green-700'
                    : status === false
                    ? 'bg-red-500/10 border-red-500/30 text-red-700'
                    : 'bg-sf-surface border-sf-border text-sf-heading hover:border-sf-border-strong'
                }`}
                data-testid={`word-result-${word.id}`}
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  status === true
                    ? 'bg-green-500 text-white'
                    : status === false
                    ? 'bg-red-500 text-white'
                    : 'bg-sf-track text-sf-muted'
                }`}>
                  {status === true ? '\u2713' : status === false ? '\u2717' : '?'}
                </span>
                <span className="text-sm font-medium">{word.text}</span>
              </button>
            );
          })}
        </div>

        {/* Score summary */}
        <div className="bg-sf-surface rounded-xl border border-sf-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-sf-heading">Score</span>
            <span className="text-2xl font-bold text-sf-heading">{calculatedPercent}%</span>
          </div>
          <div className="flex gap-4 text-xs text-sf-muted">
            <span>{correctCount} correct</span>
            <span>{wrongCount} wrong</span>
            <span>{words.length - markedCount} unmarked</span>
          </div>

          {/* Override toggle */}
          <div className="border-t border-sf-border pt-3">
            <label className="flex items-center gap-2 text-sm text-sf-heading cursor-pointer">
              <input
                type="checkbox"
                checked={useOverride}
                onChange={(e) => setUseOverride(e.target.checked)}
                className="rounded"
              />
              <span>Teacher gave a different grade</span>
            </label>
            {useOverride && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={overrideValue}
                  onChange={(e) => setOverrideValue(e.target.value)}
                  placeholder="Enter %"
                  className="w-24 px-3 py-2 rounded-lg bg-sf-bg border border-sf-border text-sf-heading text-sm focus:outline-none focus:border-sf-primary"
                />
                <span className="text-sm text-sf-muted">%</span>
              </div>
            )}
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={() => {
            if (!allMarked) {
              setShowConfirm(true);
            } else {
              handleSave();
            }
          }}
          className="w-full py-3 rounded-xl bg-sf-primary text-sf-primary-text font-bold text-sm hover:bg-sf-primary-hover transition-colors shadow-md"
          data-testid="save-test-results-btn"
        >
          Save Results
        </button>
      </div>

      {/* Confirmation dialog for unmarked words */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-sf-surface rounded-xl border border-sf-border p-6 max-w-sm w-full shadow-xl">
            <h2 className="text-lg font-bold text-sf-heading mb-2">Unmarked Words</h2>
            <p className="text-sm text-sf-muted mb-6">
              {words.length - markedCount} word{words.length - markedCount !== 1 ? 's are' : ' is'} still unmarked.
              Unmarked words will be counted as wrong.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-sf-heading bg-sf-track hover:bg-sf-surface-hover transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  handleSave();
                }}
                className="px-4 py-2 rounded-lg text-sm font-bold text-sf-primary-text bg-sf-primary hover:bg-sf-primary-hover transition-colors"
              >
                Save Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BackArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

// src/features/word-lists/test-result-detail.tsx — Detail view for a single test result

import type { TestResult, WordList } from '../../contracts/types';

interface TestResultDetailProps {
  testResult: TestResult;
  list: WordList | null;
  onPracticeMissed: (wordIds: string[]) => void;
  onBack: () => void;
}

export function TestResultDetail({
  testResult,
  list,
  onPracticeMissed,
  onBack,
}: TestResultDetailProps) {
  const correct = testResult.wordResults.filter((w) => w.correct);
  const missed = testResult.wordResults.filter((w) => !w.correct);

  return (
    <div className="min-h-screen bg-sf-bg">
      {/* Header */}
      <div className="bg-sf-surface border-b border-sf-border px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover transition-all"
            aria-label="Go back"
          >
            <BackArrowIcon />
          </button>
          <div>
            <h1 className="text-xl font-bold text-sf-heading">
              {list?.name ?? 'Test Result'}
            </h1>
            <p className="text-xs text-sf-muted">
              {new Date(testResult.testDate).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Score card */}
        <div className="bg-sf-surface rounded-xl border border-sf-border p-4 text-center">
          <p className={`text-4xl font-bold ${getScoreColor(testResult.finalPercent)}`}>
            {testResult.finalPercent}%
          </p>
          <p className="text-sm text-sf-muted mt-1">
            {correct.length}/{testResult.wordResults.length} words correct
          </p>
          {testResult.overridePercent !== null && (
            <p className="text-xs text-sf-muted mt-1">
              Teacher grade: {testResult.overridePercent}% · Calculated: {testResult.calculatedPercent}%
            </p>
          )}
        </div>

        {/* Missed words section */}
        {missed.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-red-600">
                Missed Words ({missed.length})
              </h2>
              <button
                onClick={() => onPracticeMissed(missed.map((w) => w.wordId))}
                className="px-3 py-1.5 rounded-lg bg-sf-primary text-sf-primary-text text-xs font-bold hover:bg-sf-primary-hover transition-colors"
                data-testid="practice-missed-btn"
              >
                Practice These
              </button>
            </div>
            <div className="space-y-1">
              {missed.map((wr) => (
                <div
                  key={wr.wordId}
                  className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 flex items-center gap-3"
                >
                  <span className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {'\u2717'}
                  </span>
                  <span className="text-sm font-medium text-red-700">{wr.word}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Correct words section */}
        {correct.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-green-600">
              Correct Words ({correct.length})
            </h2>
            <div className="space-y-1">
              {correct.map((wr) => (
                <div
                  key={wr.wordId}
                  className="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2.5 flex items-center gap-3"
                >
                  <span className="w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {'\u2713'}
                  </span>
                  <span className="text-sm font-medium text-green-700">{wr.word}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getScoreColor(pct: number): string {
  if (pct >= 90) return 'text-green-600';
  if (pct >= 70) return 'text-yellow-600';
  return 'text-red-600';
}

function BackArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

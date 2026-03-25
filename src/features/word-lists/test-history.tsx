// src/features/word-lists/test-history.tsx — Test history trend view across all tests

import type { TestResult, WordList } from '../../contracts/types';

interface TestHistoryProps {
  testResults: TestResult[];
  wordLists: WordList[];
  onViewDetail: (testResult: TestResult) => void;
  onViewTroubleWords: () => void;
  onBack: () => void;
}

export function TestHistory({
  testResults,
  wordLists,
  onViewDetail,
  onViewTroubleWords,
  onBack,
}: TestHistoryProps) {
  const listMap = new Map(wordLists.map((l) => [l.id, l]));
  const sorted = [...testResults].sort(
    (a, b) => new Date(b.testDate).getTime() - new Date(a.testDate).getTime()
  );

  const avgScore = testResults.length > 0
    ? Math.round(testResults.reduce((sum, r) => sum + r.finalPercent, 0) / testResults.length)
    : 0;

  // Simple trend: compare last 3 vs previous 3
  const trend = computeTrend(sorted);

  return (
    <div className="min-h-screen bg-sf-bg">
      {/* Header */}
      <div className="bg-sf-surface border-b border-sf-border px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 -ml-2 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover transition-all"
              aria-label="Go back"
            >
              <BackArrowIcon />
            </button>
            <h1 className="text-xl font-bold text-sf-heading">Test History</h1>
          </div>
          <button
            onClick={onViewTroubleWords}
            className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-700 text-xs font-bold hover:bg-red-500/20 transition-colors"
            data-testid="trouble-words-btn"
          >
            Trouble Words
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Summary card */}
        {testResults.length > 0 && (
          <div className="bg-sf-surface rounded-xl border border-sf-border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-sf-muted">Average Score</span>
              <span className={`text-2xl font-bold ${getScoreColor(avgScore)}`}>
                {avgScore}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-sf-muted">Tests Taken</span>
              <span className="text-sm font-bold text-sf-heading">{testResults.length}</span>
            </div>
            {trend !== null && (
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm text-sf-muted">Trend</span>
                <span className={`text-sm font-bold ${
                  trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-600' : 'text-sf-muted'
                }`}>
                  {trend > 0 ? '\u2191' : trend < 0 ? '\u2193' : '\u2192'}{' '}
                  {trend > 0 ? 'Improving' : trend < 0 ? 'Declining' : 'Steady'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Score trend bar chart */}
        {sorted.length > 1 && (
          <div className="bg-sf-surface rounded-xl border border-sf-border p-4">
            <h2 className="text-sm font-bold text-sf-heading mb-3">Score Trend</h2>
            <div className="flex items-end gap-1.5 h-24">
              {sorted.slice(0, 12).reverse().map((result) => (
                <button
                  key={result.id}
                  onClick={() => onViewDetail(result)}
                  className="flex-1 flex flex-col items-center gap-1 group"
                  title={`${listMap.get(result.wordListId)?.name ?? 'Test'}: ${result.finalPercent}%`}
                >
                  <div
                    className={`w-full rounded-t transition-all group-hover:opacity-80 ${getBarColor(result.finalPercent)}`}
                    style={{ height: `${Math.max(4, (result.finalPercent / 100) * 80)}px` }}
                  />
                  <span className="text-[9px] text-sf-muted">
                    {new Date(result.testDate).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Test list */}
        {sorted.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sf-heading font-bold text-lg mb-2">No test results yet</p>
            <p className="text-sf-muted text-sm">
              Record your first test results from a word list.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((result) => {
              const listName = listMap.get(result.wordListId)?.name ?? 'Unknown List';
              const totalWords = result.wordResults.length;
              const correct = result.wordResults.filter((w) => w.correct).length;
              const wrong = totalWords - correct;

              return (
                <button
                  key={result.id}
                  onClick={() => onViewDetail(result)}
                  className="w-full bg-sf-surface rounded-xl border border-sf-border p-4 hover:border-sf-border-strong transition-all text-left"
                  data-testid={`test-result-${result.id}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sf-heading text-sm">{listName}</span>
                    <span className={`text-lg font-bold ${getScoreColor(result.finalPercent)}`}>
                      {result.finalPercent}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-sf-muted">
                    <span>{new Date(result.testDate).toLocaleDateString()}</span>
                    <span>
                      {correct}/{totalWords} correct
                      {wrong > 0 && <> · <span className="text-red-600">{wrong} missed</span></>}
                    </span>
                  </div>
                  {result.overridePercent !== null && (
                    <p className="text-[10px] text-sf-muted mt-1">
                      Teacher grade: {result.overridePercent}% (calculated: {result.calculatedPercent}%)
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function computeTrend(sortedResults: TestResult[]): number | null {
  if (sortedResults.length < 2) return null;
  const recent = sortedResults.slice(0, Math.min(3, sortedResults.length));
  const older = sortedResults.slice(
    Math.min(3, sortedResults.length),
    Math.min(6, sortedResults.length),
  );
  if (older.length === 0) return null;

  const recentAvg = recent.reduce((s, r) => s + r.finalPercent, 0) / recent.length;
  const olderAvg = older.reduce((s, r) => s + r.finalPercent, 0) / older.length;
  const diff = recentAvg - olderAvg;
  if (diff > 3) return 1;
  if (diff < -3) return -1;
  return 0;
}

function getScoreColor(pct: number): string {
  if (pct >= 90) return 'text-green-600';
  if (pct >= 70) return 'text-yellow-600';
  return 'text-red-600';
}

function getBarColor(pct: number): string {
  if (pct >= 90) return 'bg-green-500';
  if (pct >= 70) return 'bg-yellow-500';
  return 'bg-red-500';
}

function BackArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

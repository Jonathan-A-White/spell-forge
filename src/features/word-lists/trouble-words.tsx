// src/features/word-lists/trouble-words.tsx — Words missed across multiple tests

interface TroubleWord {
  word: string;
  wordId: string;
  missedCount: number;
  testDates: Date[];
}

interface TroubleWordsProps {
  troubleWords: TroubleWord[];
  onPracticeWords: (wordIds: string[]) => void;
  onBack: () => void;
}

export function TroubleWords({
  troubleWords,
  onPracticeWords,
  onBack,
}: TroubleWordsProps) {
  // Words missed on 2+ tests are "repeat offenders"
  const repeatOffenders = troubleWords.filter((w) => w.missedCount >= 2);
  const singleMisses = troubleWords.filter((w) => w.missedCount === 1);

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
            <h1 className="text-xl font-bold text-sf-heading">Trouble Words</h1>
          </div>
          {troubleWords.length > 0 && (
            <button
              onClick={() => onPracticeWords(troubleWords.map((w) => w.wordId))}
              className="px-3 py-1.5 rounded-lg bg-sf-primary text-sf-primary-text text-xs font-bold hover:bg-sf-primary-hover transition-colors"
              data-testid="practice-all-trouble-btn"
            >
              Practice All
            </button>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {troubleWords.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sf-heading font-bold text-lg mb-2">No trouble words!</p>
            <p className="text-sf-muted text-sm">
              Words you miss on tests will appear here.
            </p>
          </div>
        ) : (
          <>
            {/* Repeat offenders */}
            {repeatOffenders.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-bold text-red-600 uppercase tracking-wider">
                    Missed on Multiple Tests ({repeatOffenders.length})
                  </h2>
                  <button
                    onClick={() => onPracticeWords(repeatOffenders.map((w) => w.wordId))}
                    className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-700 text-xs font-bold hover:bg-red-500/20 transition-colors"
                  >
                    Practice
                  </button>
                </div>
                <div className="space-y-1">
                  {repeatOffenders.map((tw) => (
                    <div
                      key={tw.wordId}
                      className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 flex items-center justify-between"
                    >
                      <span className="text-sm font-medium text-red-700">{tw.word}</span>
                      <span className="text-xs font-bold text-red-600 bg-red-500/20 px-2 py-0.5 rounded-full">
                        {tw.missedCount}x missed
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Single misses */}
            {singleMisses.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-sf-muted uppercase tracking-wider mb-2">
                  Missed Once ({singleMisses.length})
                </h2>
                <div className="space-y-1">
                  {singleMisses.map((tw) => (
                    <div
                      key={tw.wordId}
                      className="bg-sf-surface border border-sf-border rounded-lg px-4 py-3 flex items-center justify-between"
                    >
                      <span className="text-sm font-medium text-sf-heading">{tw.word}</span>
                      <span className="text-xs text-sf-muted">
                        {new Date(tw.testDates[0]).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
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

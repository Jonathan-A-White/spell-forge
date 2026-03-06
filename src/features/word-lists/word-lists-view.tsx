// src/features/word-lists/word-lists-view.tsx — Per-profile word list overview

import type { WordList, Word, WordStats } from '../../contracts/types';

interface WordListsViewProps {
  wordLists: WordList[];
  allWords: Word[];
  allStats: WordStats[];
  onAddList: () => void;
  onImportFromCamera?: () => void;
  onBack: () => void;
}

export function WordListsView({
  wordLists,
  allWords,
  allStats,
  onAddList,
  onImportFromCamera,
  onBack,
}: WordListsViewProps) {
  const statsMap = new Map(allStats.map((s) => [s.wordId, s]));
  const activeLists = wordLists.filter((l) => !l.archived);
  const archivedLists = wordLists.filter((l) => l.archived);

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
            <h1 className="text-xl font-bold text-sf-heading">Word Lists</h1>
          </div>
          <div className="flex items-center gap-2">
            {onImportFromCamera && (
              <button
                onClick={onImportFromCamera}
                className="p-2 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover transition-all"
                aria-label="Import from camera"
                title="Import from photo"
              >
                <CameraIcon />
              </button>
            )}
            <button
              onClick={onAddList}
              className="px-3 py-1.5 rounded-lg bg-sf-primary text-sf-primary-text text-sm font-bold hover:bg-sf-primary-hover transition-colors"
            >
              + New
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {activeLists.length === 0 && archivedLists.length === 0 && (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">📚</div>
            <p className="text-sf-heading font-bold text-lg mb-2">No word lists yet</p>
            <p className="text-sf-muted text-sm mb-6">
              Create your first list to start practicing!
            </p>
            <button
              onClick={onAddList}
              className="bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-8 rounded-xl transition-colors shadow-md"
            >
              Create Word List
            </button>
          </div>
        )}

        {activeLists.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-sf-muted uppercase tracking-wider mb-3">
              Active Lists
            </h2>
            <div className="space-y-2">
              {activeLists.map((list) => {
                const words = allWords.filter((w) => w.listId === list.id);
                const mastered = words.filter((w) => {
                  const s = statsMap.get(w.id);
                  return s && (s.currentBucket === 'mastered' || s.currentBucket === 'review');
                }).length;
                const pct = words.length > 0 ? Math.round((mastered / words.length) * 100) : 0;

                return (
                  <div
                    key={list.id}
                    className="bg-sf-surface rounded-xl border border-sf-border p-4 hover:border-sf-border-strong transition-all"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-bold text-sf-heading">{list.name}</p>
                        <p className="text-xs text-sf-muted mt-0.5">
                          {words.length} word{words.length !== 1 ? 's' : ''}
                          {list.testDate && (
                            <> · Test: {list.testDate.toLocaleDateString()}</>
                          )}
                        </p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                        pct >= 90 ? 'bg-green-500/20 text-green-700' :
                        pct >= 50 ? 'bg-yellow-500/20 text-yellow-700' :
                        'bg-sf-track text-sf-muted'
                      }`}>
                        {pct}%
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full bg-sf-track rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-sf-primary to-sf-track-fill h-2 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {/* Word preview */}
                    {words.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {words.slice(0, 8).map((w) => {
                          const stat = statsMap.get(w.id);
                          const bucket = stat?.currentBucket ?? 'new';
                          return (
                            <span
                              key={w.id}
                              className={`text-xs px-2 py-0.5 rounded-full ${getBucketStyle(bucket)}`}
                            >
                              {w.text}
                            </span>
                          );
                        })}
                        {words.length > 8 && (
                          <span className="text-xs text-sf-muted px-2 py-0.5">
                            +{words.length - 8} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {archivedLists.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-sf-muted uppercase tracking-wider mb-3">
              Archived
            </h2>
            <div className="space-y-2 opacity-60">
              {archivedLists.map((list) => {
                const words = allWords.filter((w) => w.listId === list.id);
                return (
                  <div
                    key={list.id}
                    className="bg-sf-surface rounded-xl border border-sf-border p-4"
                  >
                    <p className="font-bold text-sf-heading">{list.name}</p>
                    <p className="text-xs text-sf-muted mt-0.5">
                      {words.length} word{words.length !== 1 ? 's' : ''} · Archived
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function getBucketStyle(bucket: string): string {
  switch (bucket) {
    case 'mastered':
    case 'review':
      return 'bg-green-500/20 text-green-700';
    case 'familiar':
      return 'bg-yellow-500/20 text-yellow-700';
    case 'learning':
      return 'bg-orange-500/20 text-orange-700';
    default:
      return 'bg-sf-track text-sf-muted';
  }
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
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

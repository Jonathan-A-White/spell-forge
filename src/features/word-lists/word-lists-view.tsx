// src/features/word-lists/word-lists-view.tsx — Per-profile word list overview

import { useState, useRef, useEffect, useCallback } from 'react';
import type { WordList, Word, WordStats, WordLearningProgress } from '../../contracts/types';
import { QrShare } from './qr-share';

interface WordListsViewProps {
  wordLists: WordList[];
  allWords: Word[];
  allStats: WordStats[];
  learningProgress: WordLearningProgress[];
  onAddList: () => void;
  onViewList?: (list: WordList) => void;
  onEditList: (list: WordList) => void;
  onDeleteList: (listId: string) => void;
  onArchiveList?: (listId: string) => void;
  onUnarchiveList?: (listId: string) => void;
  onImportFromCamera?: () => void;
  onImportFromQr?: () => void;
  onBack: () => void;
}

export function WordListsView({
  wordLists,
  allWords,
  allStats,
  learningProgress,
  onAddList,
  onViewList,
  onEditList,
  onDeleteList,
  onArchiveList,
  onUnarchiveList,
  onImportFromCamera,
  onImportFromQr,
  onBack,
}: WordListsViewProps) {
  const statsMap = new Map(allStats.map((s) => [s.wordId, s]));
  const learningMap = new Map(learningProgress.map((lp) => [lp.wordId, lp]));
  const activeLists = wordLists.filter((l) => !l.archived);
  const archivedLists = wordLists.filter((l) => l.archived);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [shareListId, setShareListId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setOpenMenuId(null), []);

  // Close menu when clicking outside
  useEffect(() => {
    if (!openMenuId) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openMenuId, closeMenu]);

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
            {onImportFromQr && (
              <button
                onClick={onImportFromQr}
                className="p-2 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover transition-all"
                aria-label="Import via QR code"
                title="Import via QR"
                data-testid="import-qr-btn"
              >
                <QrIcon />
              </button>
            )}
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
                  return getWordCategory(w.id, statsMap, learningMap) === 'mastered';
                }).length;
                const pct = words.length > 0 ? Math.round((mastered / words.length) * 100) : 0;

                return (
                  <div
                    key={list.id}
                    className="bg-sf-surface rounded-xl border border-sf-border p-4 hover:border-sf-border-strong transition-all cursor-pointer"
                    onClick={() => onViewList?.(list)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onViewList?.(list); }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sf-heading">{list.name}</p>
                        <p className="text-xs text-sf-muted mt-0.5">
                          {words.length} word{words.length !== 1 ? 's' : ''}
                          {list.testDate && (
                            <> · Test: {list.testDate.toLocaleDateString()}</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                          pct >= 90 ? 'bg-green-500/20 text-green-700' :
                          pct >= 50 ? 'bg-yellow-500/20 text-yellow-700' :
                          'bg-sf-track text-sf-muted'
                        }`}>
                          {pct}%
                        </span>
                        <div className="relative" ref={openMenuId === list.id ? menuRef : undefined}>
                          <button
                            onClick={() => setOpenMenuId(openMenuId === list.id ? null : list.id)}
                            className="p-1.5 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover transition-all"
                            aria-label={`Actions for ${list.name}`}
                            data-testid={`list-menu-${list.id}`}
                          >
                            <MoreIcon />
                          </button>
                          {openMenuId === list.id && (
                            <div className="absolute right-0 top-full mt-1 w-36 bg-sf-surface border border-sf-border rounded-lg shadow-lg z-10 py-1" data-testid={`list-dropdown-${list.id}`}>
                              <button
                                onClick={() => { closeMenu(); setShareListId(list.id); }}
                                className="w-full text-left px-3 py-2 text-sm text-sf-heading hover:bg-sf-surface-hover transition-colors"
                                data-testid={`share-list-${list.id}`}
                              >
                                Share QR
                              </button>
                              <button
                                onClick={() => { closeMenu(); onEditList(list); }}
                                className="w-full text-left px-3 py-2 text-sm text-sf-heading hover:bg-sf-surface-hover transition-colors"
                                data-testid={`edit-list-${list.id}`}
                              >
                                Edit
                              </button>
                              {onArchiveList && (
                                <button
                                  onClick={() => { closeMenu(); onArchiveList(list.id); }}
                                  className="w-full text-left px-3 py-2 text-sm text-sf-heading hover:bg-sf-surface-hover transition-colors"
                                  data-testid={`archive-list-${list.id}`}
                                >
                                  Archive
                                </button>
                              )}
                              <button
                                onClick={() => { closeMenu(); setConfirmDeleteId(list.id); }}
                                className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-sf-surface-hover transition-colors"
                                data-testid={`delete-list-${list.id}`}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
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
                          const bucket = getWordCategory(w.id, statsMap, learningMap);
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
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sf-heading">{list.name}</p>
                        <p className="text-xs text-sf-muted mt-0.5">
                          {words.length} word{words.length !== 1 ? 's' : ''} · Archived
                        </p>
                      </div>
                      <div className="relative" ref={openMenuId === list.id ? menuRef : undefined}>
                        <button
                          onClick={() => setOpenMenuId(openMenuId === list.id ? null : list.id)}
                          className="p-1.5 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover transition-all"
                          aria-label={`Actions for ${list.name}`}
                          data-testid={`list-menu-${list.id}`}
                        >
                          <MoreIcon />
                        </button>
                        {openMenuId === list.id && (
                          <div className="absolute right-0 top-full mt-1 w-36 bg-sf-surface border border-sf-border rounded-lg shadow-lg z-10 py-1" data-testid={`list-dropdown-${list.id}`}>
                            {onUnarchiveList && (
                              <button
                                onClick={() => { closeMenu(); onUnarchiveList(list.id); }}
                                className="w-full text-left px-3 py-2 text-sm text-sf-heading hover:bg-sf-surface-hover transition-colors"
                                data-testid={`unarchive-list-${list.id}`}
                              >
                                Unarchive
                              </button>
                            )}
                            <button
                              onClick={() => { closeMenu(); setConfirmDeleteId(list.id); }}
                              className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-sf-surface-hover transition-colors"
                              data-testid={`delete-list-${list.id}`}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* QR Share dialog */}
      {shareListId && (() => {
        const shareList = wordLists.find((l) => l.id === shareListId);
        const shareWords = allWords.filter((w) => w.listId === shareListId);
        if (!shareList || shareWords.length === 0) return null;
        return (
          <QrShare
            listName={shareList.name}
            words={shareWords.map((w) => w.text)}
            testDate={shareList.testDate}
            onClose={() => setShareListId(null)}
          />
        );
      })()}

      {/* Delete confirmation dialog */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-testid="delete-confirm-dialog">
          <div className="bg-sf-surface rounded-xl border border-sf-border p-6 max-w-sm w-full shadow-xl">
            <h2 className="text-lg font-bold text-sf-heading mb-2">Delete Word List?</h2>
            <p className="text-sm text-sf-muted mb-6">
              This will permanently delete the list and all its words. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-sf-heading bg-sf-track hover:bg-sf-surface-hover transition-colors"
                data-testid="delete-cancel-btn"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteList(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors"
                data-testid="delete-confirm-btn"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type HealthCategory = 'mastered' | 'familiar' | 'learning' | 'new';

function getWordCategory(
  wordId: string,
  statsMap: Map<string, WordStats>,
  learningMap: Map<string, WordLearningProgress>,
): HealthCategory {
  const stat = statsMap.get(wordId);
  const lp = learningMap.get(wordId);

  if (stat && stat.timesAsked > 0) {
    if (stat.currentBucket === 'mastered' || stat.currentBucket === 'review') return 'mastered';
    if (stat.currentBucket === 'familiar') return 'familiar';
    if (stat.currentBucket === 'learning') return 'learning';
  }

  if (lp) {
    if (lp.mastered) return 'mastered';
    if (lp.stage >= 2) return 'familiar';
    if (lp.stage >= 1 || lp.totalAttempts > 0) return 'learning';
  }

  return 'new';
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

function QrIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="3" height="3" />
      <line x1="21" y1="14" x2="21" y2="17" />
      <line x1="14" y1="21" x2="17" y2="21" />
      <line x1="21" y1="21" x2="21" y2="21" />
    </svg>
  );
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

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}

// src/features/word-lists/word-list-detail.tsx — Detail view for a word list with inline word editing

import { useState } from 'react';
import type { WordList, Word, WordStats, WordLearningProgress } from '../../contracts/types';
import { QrShare } from './qr-share';

interface WordListDetailProps {
  list: WordList;
  words: Word[];
  stats: WordStats[];
  learningProgress: WordLearningProgress[];
  onUpdateWord: (wordId: string, newText: string) => void;
  onDeleteWord: (wordId: string) => void;
  onAddWord: (text: string) => void;
  onBack: () => void;
  onEditList: (list: WordList) => void;
}

export function WordListDetail({
  list,
  words,
  stats,
  learningProgress,
  onUpdateWord,
  onDeleteWord,
  onAddWord,
  onBack,
  onEditList,
}: WordListDetailProps) {
  const statsMap = new Map(stats.map((s) => [s.wordId, s]));
  const learningMap = new Map(learningProgress.map((lp) => [lp.wordId, lp]));
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [newWordText, setNewWordText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showQrShare, setShowQrShare] = useState(false);

  const startEditing = (word: Word) => {
    setEditingWordId(word.id);
    setEditText(word.text);
  };

  const saveEdit = () => {
    if (!editingWordId) return;
    const trimmed = editText.trim().toLowerCase();
    if (trimmed && trimmed !== words.find((w) => w.id === editingWordId)?.text) {
      onUpdateWord(editingWordId, trimmed);
    }
    setEditingWordId(null);
    setEditText('');
  };

  const cancelEdit = () => {
    setEditingWordId(null);
    setEditText('');
  };

  const handleAddWord = () => {
    const trimmed = newWordText.trim().toLowerCase();
    if (!trimmed) return;
    // Check for duplicate
    if (words.some((w) => w.text === trimmed)) {
      setNewWordText('');
      return;
    }
    onAddWord(trimmed);
    setNewWordText('');
  };

  const mastered = words.filter((w) => {
    const cat = getWordCategory(w.id, statsMap, learningMap);
    return cat === 'mastered';
  }).length;
  const pct = words.length > 0 ? Math.round((mastered / words.length) * 100) : 0;

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
            <div>
              <h1 className="text-xl font-bold text-sf-heading">{list.name}</h1>
              <p className="text-xs text-sf-muted">
                {words.length} word{words.length !== 1 ? 's' : ''}
                {list.testDate && (
                  <> · Test: {list.testDate.toLocaleDateString()}</>
                )}
                {' · '}{pct}% mastered
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowQrShare(true)}
              className="p-2 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover transition-all"
              aria-label="Share list via QR code"
              title="Share via QR"
              data-testid="share-qr-btn"
            >
              <QrIcon />
            </button>
            <button
              onClick={() => onEditList(list)}
              className="p-2 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover transition-all"
              aria-label="Edit list settings"
              title="Edit list"
            >
              <EditIcon />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-3">
        {/* Progress bar */}
        <div className="w-full bg-sf-track rounded-full h-2">
          <div
            className="bg-gradient-to-r from-sf-primary to-sf-track-fill h-2 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Add word input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newWordText}
            onChange={(e) => setNewWordText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddWord(); }}
            placeholder="Add a word..."
            className="flex-1 px-3 py-2 rounded-lg bg-sf-surface border border-sf-border text-sf-heading text-sm placeholder:text-sf-muted focus:outline-none focus:border-sf-primary transition-colors"
          />
          <button
            onClick={handleAddWord}
            disabled={!newWordText.trim()}
            className="px-4 py-2 rounded-lg bg-sf-primary text-sf-primary-text text-sm font-bold hover:bg-sf-primary-hover transition-colors disabled:opacity-40"
          >
            Add
          </button>
        </div>

        {/* Word list */}
        {words.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sf-muted text-sm">No words yet. Add some above!</p>
          </div>
        ) : (
          <div className="space-y-1">
            {words.map((word) => {
              const bucket = getWordCategory(word.id, statsMap, learningMap);
              const isEditing = editingWordId === word.id;

              return (
                <div
                  key={word.id}
                  className="bg-sf-surface rounded-lg border border-sf-border px-4 py-3 flex items-center gap-3 hover:border-sf-border-strong transition-all"
                >
                  {isEditing ? (
                    <>
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit();
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        className="flex-1 px-2 py-1 rounded bg-sf-bg border border-sf-primary text-sf-heading text-sm focus:outline-none"
                        autoFocus
                      />
                      <button
                        onClick={saveEdit}
                        className="p-1.5 rounded text-green-600 hover:bg-green-500/10 transition-colors"
                        aria-label="Save"
                      >
                        <CheckIcon />
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="p-1.5 rounded text-sf-muted hover:bg-sf-surface-hover transition-colors"
                        aria-label="Cancel"
                      >
                        <CloseIcon />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getBucketDot(bucket)}`} />
                      <button
                        onClick={() => startEditing(word)}
                        className="flex-1 text-left text-sf-heading text-sm hover:text-sf-secondary transition-colors"
                        aria-label={`Edit word: ${word.text}`}
                      >
                        {word.text}
                      </button>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${getBucketStyle(bucket)}`}>
                        {bucket}
                      </span>
                      <button
                        onClick={() => setConfirmDeleteId(word.id)}
                        className="p-1.5 rounded text-sf-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        aria-label={`Delete ${word.text}`}
                      >
                        <TrashIcon />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* QR Share dialog */}
      {showQrShare && (
        <QrShare
          listName={list.name}
          words={words.map((w) => w.text)}
          testDate={list.testDate}
          onClose={() => setShowQrShare(false)}
        />
      )}

      {/* Delete confirmation dialog */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-sf-surface rounded-xl border border-sf-border p-6 max-w-sm w-full shadow-xl">
            <h2 className="text-lg font-bold text-sf-heading mb-2">Delete Word?</h2>
            <p className="text-sm text-sf-muted mb-6">
              This will remove the word and its practice history.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-sf-heading bg-sf-track hover:bg-sf-surface-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteWord(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors"
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

function getBucketDot(bucket: string): string {
  switch (bucket) {
    case 'mastered':
    case 'review':
      return 'bg-green-500';
    case 'familiar':
      return 'bg-yellow-500';
    case 'learning':
      return 'bg-orange-500';
    default:
      return 'bg-sf-muted';
  }
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

function BackArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
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

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

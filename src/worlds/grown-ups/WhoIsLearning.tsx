// src/worlds/grown-ups/WhoIsLearning.tsx: who is learning: the learners, each with what the tutor knows of them
// (their @learn-kit/learner profile), to switch between, add, archive, restore and delete. It replaced the old
// profile picker, with the same actions.

import { useState } from 'react';
import type { Profile } from '../../contracts';
import { describeLearner } from './describe-learner';
import { FirstLine } from './first-line';

export interface WhoIsLearningProps {
  learners: readonly Profile[];
  archived: readonly Profile[];
  /** The learner who is open now. */
  activeId?: string | null;
  onSwitch: (learner: Profile) => void;
  /** Start a new learner (the shell's welcome and theme choice). */
  onAdd: () => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

type Confirm = { type: 'archive' | 'delete'; learner: Profile };

const TAP = { minHeight: 'var(--sf-tap-target-size)' } as const;

export function WhoIsLearning({ learners, archived, activeId, onSwitch, onAdd, onArchive, onRestore, onDelete }: WhoIsLearningProps) {
  const [managingId, setManagingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  return (
    <div className="min-h-screen bg-sf-bg flex flex-col items-center justify-start p-4 pt-8 md:justify-center md:p-8">
      <h1 className="sf-heading text-3xl md:text-4xl text-sf-heading mb-2 text-center">Who is learning?</h1>
      <div className="mb-6 max-w-sm text-center">
        <FirstLine>Tap who is learning today, or add someone new.</FirstLine>
      </div>

      <div className="grid gap-4 w-full max-w-sm md:max-w-2xl lg:max-w-4xl">
        {learners.map((learner) => (
          <div key={learner.id} className="relative">
            <button
              onClick={() => (managingId === learner.id ? setManagingId(null) : onSwitch(learner))}
              aria-current={learner.id === activeId ? 'true' : undefined}
              className={`w-full bg-sf-surface hover:bg-sf-surface-hover border-2 hover:border-sf-primary sf-card p-4 pr-14 text-left transition-all shadow-sm ${
                learner.id === activeId ? 'border-sf-primary' : 'border-sf-border-strong'
              }`}
              style={TAP}
            >
              <span className="block text-xl font-bold text-sf-heading">{learner.name}</span>
              <span className="block text-sm text-sf-muted mt-1">{describeLearner(learner.learner)}</span>
            </button>

            <button
              onClick={() => setManagingId(managingId === learner.id ? null : learner.id)}
              aria-label={`Manage ${learner.name}`}
              className="absolute top-4 right-4 p-2 text-sf-muted hover:text-sf-heading transition-colors sf-control hover:bg-sf-surface-hover"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <circle cx="10" cy="4" r="2" />
                <circle cx="10" cy="10" r="2" />
                <circle cx="10" cy="16" r="2" />
              </svg>
            </button>

            {managingId === learner.id && (
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setConfirm({ type: 'archive', learner })}
                  className="flex-1 px-4 py-2 bg-sf-surface border border-sf-border-strong sf-control text-sm text-sf-text hover:bg-sf-surface-hover transition-colors"
                  style={TAP}
                >
                  Archive
                </button>
                <button
                  onClick={() => setConfirm({ type: 'delete', learner })}
                  className="flex-1 px-4 py-2 bg-red-900/30 border border-red-700 sf-control text-sm text-red-400 hover:bg-red-900/50 transition-colors"
                  style={TAP}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}

        <button
          onClick={onAdd}
          className="border-2 border-dashed border-sf-border-strong sf-card p-4 text-sf-muted hover:bg-sf-surface-hover hover:border-sf-primary transition-all"
          style={TAP}
        >
          Add a learner
        </button>
      </div>

      {archived.length > 0 && (
        <div className="w-full max-w-sm md:max-w-2xl lg:max-w-4xl mt-8">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="text-sm text-sf-muted hover:text-sf-text transition-colors mb-4"
            style={TAP}
          >
            {showArchived ? 'Hide' : 'Show'} archived learners ({archived.length})
          </button>

          {showArchived && (
            <div className="grid gap-4">
              {archived.map((learner) => (
                <div
                  key={learner.id}
                  className="bg-sf-surface/50 border-2 border-sf-border-strong/50 sf-card p-4 flex items-center justify-between"
                >
                  <div className="opacity-60">
                    <p className="text-lg sf-heading text-sf-heading">{learner.name}</p>
                    <p className="text-xs text-sf-muted mt-1">Archived</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onRestore(learner.id)}
                      className="px-4 py-2 bg-sf-primary/20 border border-sf-primary sf-control text-sm text-sf-primary hover:bg-sf-primary/30 transition-colors"
                      style={TAP}
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => setConfirm({ type: 'delete', learner })}
                      className="px-4 py-2 bg-red-900/30 border border-red-700 sf-control text-sm text-red-400 hover:bg-red-900/50 transition-colors"
                      style={TAP}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-50">
          <div role="dialog" aria-modal="true" aria-labelledby="who-confirm-title" className="bg-sf-surface border-2 border-sf-border-strong sf-card p-5 max-w-sm w-full shadow-xl">
            <h2 id="who-confirm-title" className="text-lg font-bold text-sf-heading mb-2">
              {confirm.type === 'archive' ? 'Archive' : 'Delete'} this learner?
            </h2>
            <p className="text-sf-text text-sm mb-6">
              {confirm.type === 'archive'
                ? `Archive "${confirm.learner.name}"? Their data will be kept and you can restore them later.`
                : `Permanently delete "${confirm.learner.name}"? This will remove all their word lists, progress, and stats. This cannot be undone.`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 px-4 py-3 bg-sf-surface border border-sf-border-strong sf-control text-sf-text font-semibold hover:bg-sf-surface-hover transition-colors"
                style={TAP}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirm.type === 'archive') onArchive(confirm.learner.id);
                  else onDelete(confirm.learner.id);
                  setConfirm(null);
                  setManagingId(null);
                }}
                className={`flex-1 px-4 py-3 sf-control font-semibold transition-colors ${
                  confirm.type === 'archive' ? 'bg-sf-primary text-white hover:bg-sf-primary/80' : 'bg-red-700 text-white hover:bg-red-800'
                }`}
                style={TAP}
              >
                {confirm.type === 'archive' ? 'Archive' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

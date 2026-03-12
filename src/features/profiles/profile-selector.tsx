// src/features/profiles/profile-selector.tsx — Profile selection screen with management

import { useState } from 'react';
import type { Profile } from '../../contracts/types';

interface ProfileSelectorProps {
  profiles: Profile[];
  archivedProfiles: Profile[];
  onSelect: (profile: Profile) => void;
  onAddProfile: () => void;
  onArchiveProfile: (profileId: string) => void;
  onRestoreProfile: (profileId: string) => void;
  onDeleteProfile: (profileId: string) => void;
}

type ConfirmAction = { type: 'archive' | 'delete'; profile: Profile };

export function ProfileSelector({
  profiles,
  archivedProfiles,
  onSelect,
  onAddProfile,
  onArchiveProfile,
  onRestoreProfile,
  onDeleteProfile,
}: ProfileSelectorProps) {
  const [managingId, setManagingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  return (
    <div className="min-h-screen bg-sf-bg flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold text-sf-heading mb-2">SpellForge</h1>
      <p className="text-sf-muted mb-8">Who&apos;s practicing today?</p>

      <div className="grid gap-4 w-full max-w-sm md:max-w-2xl lg:max-w-4xl">
        {profiles.map((profile) => (
          <div key={profile.id} className="relative">
            <button
              onClick={() => {
                if (managingId === profile.id) {
                  setManagingId(null);
                } else {
                  onSelect(profile);
                }
              }}
              className="w-full bg-sf-surface hover:bg-sf-surface-hover border-2 border-sf-border-strong hover:border-sf-primary rounded-xl p-6 text-left transition-all shadow-sm"
            >
              <p className="text-xl font-bold text-sf-heading">{profile.name}</p>
              <p className="text-sm text-sf-muted mt-1">
                Theme: {profile.themeId.replace(/-/g, ' ')}
              </p>
            </button>

            {/* Manage button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setManagingId(managingId === profile.id ? null : profile.id);
              }}
              aria-label={`Manage ${profile.name}`}
              className="absolute top-4 right-4 p-2 text-sf-muted hover:text-sf-heading transition-colors rounded-lg hover:bg-sf-surface-hover"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <circle cx="10" cy="4" r="2" />
                <circle cx="10" cy="10" r="2" />
                <circle cx="10" cy="16" r="2" />
              </svg>
            </button>

            {/* Action menu */}
            {managingId === profile.id && (
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setConfirmAction({ type: 'archive', profile })}
                  className="flex-1 px-4 py-2 bg-sf-surface border border-sf-border-strong rounded-lg text-sm text-sf-text hover:bg-sf-surface-hover transition-colors"
                >
                  Archive
                </button>
                <button
                  onClick={() => setConfirmAction({ type: 'delete', profile })}
                  className="flex-1 px-4 py-2 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-400 hover:bg-red-900/50 transition-colors"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}

        <button
          onClick={onAddProfile}
          className="border-2 border-dashed border-sf-border-strong rounded-xl p-6 text-sf-muted hover:bg-sf-surface-hover hover:border-sf-primary transition-all"
        >
          + Add Profile
        </button>
      </div>

      {/* Archived profiles section */}
      {archivedProfiles.length > 0 && (
        <div className="w-full max-w-sm md:max-w-2xl lg:max-w-4xl mt-8">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="text-sm text-sf-muted hover:text-sf-text transition-colors mb-4"
          >
            {showArchived ? 'Hide' : 'Show'} archived profiles ({archivedProfiles.length})
          </button>

          {showArchived && (
            <div className="grid gap-4">
              {archivedProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className="bg-sf-surface/50 border-2 border-sf-border-strong/50 rounded-xl p-6 flex items-center justify-between"
                >
                  <div className="opacity-60">
                    <p className="text-lg font-bold text-sf-heading">{profile.name}</p>
                    <p className="text-sm text-sf-muted mt-1">
                      Theme: {profile.themeId.replace(/-/g, ' ')}
                    </p>
                    <p className="text-xs text-sf-muted mt-1">Archived</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onRestoreProfile(profile.id)}
                      className="px-4 py-2 bg-sf-primary/20 border border-sf-primary rounded-lg text-sm text-sf-primary hover:bg-sf-primary/30 transition-colors"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => setConfirmAction({ type: 'delete', profile })}
                      className="px-4 py-2 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-400 hover:bg-red-900/50 transition-colors"
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

      {/* Confirmation modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-50">
          <div className="bg-sf-surface border-2 border-sf-border-strong rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h2 className="text-lg font-bold text-sf-heading mb-2">
              {confirmAction.type === 'archive' ? 'Archive' : 'Delete'} Profile?
            </h2>
            <p className="text-sf-text text-sm mb-6">
              {confirmAction.type === 'archive'
                ? `Archive "${confirmAction.profile.name}"? Their data will be preserved and you can restore them later.`
                : `Permanently delete "${confirmAction.profile.name}"? This will remove all their word lists, progress, and stats. This cannot be undone.`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 px-4 py-3 bg-sf-surface border border-sf-border-strong rounded-lg text-sf-text font-semibold hover:bg-sf-surface-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmAction.type === 'archive') {
                    onArchiveProfile(confirmAction.profile.id);
                  } else {
                    onDeleteProfile(confirmAction.profile.id);
                  }
                  setConfirmAction(null);
                  setManagingId(null);
                }}
                className={`flex-1 px-4 py-3 rounded-lg font-semibold transition-colors ${
                  confirmAction.type === 'archive'
                    ? 'bg-sf-primary text-white hover:bg-sf-primary/80'
                    : 'bg-red-700 text-white hover:bg-red-800'
                }`}
              >
                {confirmAction.type === 'archive' ? 'Archive' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

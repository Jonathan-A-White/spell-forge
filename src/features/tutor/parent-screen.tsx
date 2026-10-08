// src/features/tutor/parent-screen.tsx — The Grown-ups screen, behind the PIN gate (parent-gate.tsx): 'This week'
// and 'Sessions' are filled (mw-kuy7rx.3), a session line opens its page (mw-kuy7rx.4), 'Tutor settings' is
// filled (mw-kuy7rx.8) and so is 'Notes for the tutor' (mw-kuy7rx.11); 'Ask the tutor' is still to come.

import { useState } from 'react';
import { ParentSessionPage } from './parent-session-page';
import { ParentSessions, ParentThisWeek } from './parent-sessions-view';
import { TutorNotes } from './tutor-notes';
import { TutorSettings } from './tutor-settings';
import type { Profile } from '../../contracts';

export interface ParentScreenProps {
  profileId: string;
  onBack: () => void;
  /** The profile's settings changed here (Tutor settings): the Tutor screen keeps its own copy. */
  onProfileChange?: (profile: Profile) => void;
}

const COMING = ['Ask the tutor'] as const;

export function ParentScreen({ profileId, onBack, onProfileChange }: ParentScreenProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="min-h-screen bg-sf-bg">
      <div className="bg-sf-surface border-b border-sf-border px-4 py-3">
        <div className="max-w-lg md:max-w-4xl mx-auto flex items-center gap-3">
          <button
            onClick={onBack}
            className="px-3 rounded-lg text-sf-heading font-bold hover:bg-sf-surface-hover"
            style={{ minHeight: 'var(--sf-tap-target-size)' }}
          >
            <span aria-hidden="true">&larr; </span>Back
          </button>
          <h1 className="text-xl font-bold text-sf-heading">Grown-ups</h1>
        </div>
      </div>
      <div className="max-w-lg md:max-w-4xl mx-auto px-4 py-5 space-y-4">
        {openId ? (
          <ParentSessionPage sessionId={openId} onBack={() => setOpenId(null)} />
        ) : (
          <>
            <ParentThisWeek profileId={profileId} />
            <ParentSessions profileId={profileId} onOpen={setOpenId} />
            {COMING.map((title) => (
              <section key={title} className="rounded-xl bg-sf-surface border border-sf-border p-4">
                <h2 className="text-sf-heading font-bold text-lg">{title}</h2>
                <p className="text-sf-muted text-sm">Coming soon.</p>
              </section>
            ))}
            <TutorSettings profileId={profileId} onProfileChange={onProfileChange} />
            <TutorNotes profileId={profileId} onProfileChange={onProfileChange} />
          </>
        )}
      </div>
    </div>
  );
}

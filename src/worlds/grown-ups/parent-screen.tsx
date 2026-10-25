// src/features/tutor/parent-screen.tsx — The Grown-ups screen, behind the PIN gate (parent-gate.tsx): 'This week'
// and 'Sessions' are filled (mw-kuy7rx.3), a session line opens its page (mw-kuy7rx.4), 'Tutor settings' is
// filled (mw-kuy7rx.8), and so are 'Notes for the tutor' (mw-kuy7rx.11) and 'Ask the tutor' (mw-kuy7rx.13).

import { useState } from 'react';
import { AskTheTutor } from './ask-the-tutor';
import type { ParentAskDeps } from './parent-ask-flow';
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
  /** The seams Ask the tutor runs on; the real grist client when absent. */
  deps?: ParentAskDeps;
}

export function ParentScreen({ profileId, onBack, onProfileChange, deps }: ParentScreenProps) {
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
            <AskTheTutor profileId={profileId} deps={deps} />
            <TutorSettings profileId={profileId} onProfileChange={onProfileChange} />
            <TutorNotes profileId={profileId} onProfileChange={onProfileChange} />
          </>
        )}
      </div>
    </div>
  );
}

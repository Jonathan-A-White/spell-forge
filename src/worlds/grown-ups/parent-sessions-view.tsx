// src/features/tutor/parent-sessions-view.tsx — 'This week' and 'Sessions' on the Grown-ups screen (mw-kuy7rx.3),
// built from what is in Dexie and kept current while the screen is open. No grist is asked.

import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { tutorRepo } from '../../data/repositories';
import { sessionLines, weekSummary } from './parent-sessions';
import type { SessionWithTurns } from './parent-sessions';

const TAP = { minHeight: 'var(--sf-tap-target-size)' } as const;

/** Every session of the profile with its turns; null until the first read. */
function useSessions(profileId: string): SessionWithTurns[] | null {
  const [rows, setRows] = useState<SessionWithTurns[] | null>(null);
  useEffect(() => {
    const subscription = liveQuery(async () => {
      const sessions = await tutorRepo.listSessions(profileId);
      return Promise.all(sessions.map(async (session) => ({ session, turns: await tutorRepo.listTurns(session.id) })));
    }).subscribe({ next: setRows, error: () => setRows([]) });
    return () => subscription.unsubscribe();
  }, [profileId]);
  return rows;
}

export interface ParentThisWeekProps {
  profileId: string;
  /** For tests; the clock otherwise. */
  now?: Date;
}

export function ParentThisWeek({ profileId, now }: ParentThisWeekProps) {
  const rows = useSessions(profileId);
  return (
    <section className="rounded-xl bg-sf-surface border border-sf-border p-4 space-y-1">
      <h2 className="text-sf-heading font-bold text-lg">This week</h2>
      <p className="text-sf-text">{rows ? weekSummary(rows, now) : 'Loading...'}</p>
    </section>
  );
}

export interface ParentSessionsProps {
  profileId: string;
  onOpen: (sessionId: string) => void;
}

export function ParentSessions({ profileId, onOpen }: ParentSessionsProps) {
  const rows = useSessions(profileId);
  const lines = rows ? sessionLines(rows) : [];
  return (
    <section className="rounded-xl bg-sf-surface border border-sf-border p-4 space-y-2">
      <h2 className="text-sf-heading font-bold text-lg">Sessions</h2>
      {!rows && <p className="text-sf-muted">Loading...</p>}
      {rows && lines.length === 0 && <p className="text-sf-muted">No sessions yet.</p>}
      {lines.length > 0 && (
        <ul className="space-y-2">
          {lines.map((line) => (
            <li key={line.sessionId}>
              <button
                type="button"
                onClick={() => onOpen(line.sessionId)}
                className="w-full text-left px-3 py-2 rounded-xl border border-sf-border hover:border-sf-border-strong"
                style={TAP}
              >
                <span className="block text-sf-muted text-sm">{line.date}</span>
                <span className="block text-sf-heading font-medium">{line.what}</span>
                <span className="block text-sf-text text-sm">{line.how}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

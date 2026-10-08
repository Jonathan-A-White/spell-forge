// src/features/tutor/parent-session-page.tsx — One session's page on the Grown-ups screen (mw-kuy7rx.4): what
// happened in plain words, 'Notes for you' (what to look at, the way he did it, the tutor's notes and
// recommendations), and the raw record with Copy as JSON behind a 'Details' tap.

import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import type { TutorSession, TutorTurn } from '../../contracts/types';
import { tutorRepo } from '../../data/repositories';
import { plainDate, plainTurn } from './parent-sessions';
import { SessionRecord } from './session-record';
import { parentDiagnosesOf, parentMethodsOf, parentNotesOf, parentRecommendationsOf } from './session-json';

const TAP = { minHeight: 'var(--sf-tap-target-size)' } as const;
const BUTTON = 'px-5 rounded-xl font-bold transition-all active:scale-[0.97]';
const SECONDARY = `${BUTTON} bg-sf-surface border border-sf-border text-sf-heading hover:border-sf-border-strong`;
const CARD = 'rounded-xl bg-sf-surface border border-sf-border p-4 space-y-2';

interface Loaded {
  session: TutorSession | undefined;
  turns: TutorTurn[];
}

export interface ParentSessionPageProps {
  sessionId: string;
  onBack: () => void;
}

export function ParentSessionPage({ sessionId, onBack }: ParentSessionPageProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const subscription = liveQuery(async (): Promise<Loaded> => ({
      session: await tutorRepo.getSession(sessionId),
      turns: await tutorRepo.listTurns(sessionId),
    })).subscribe({ next: setLoaded, error: () => setLoaded({ session: undefined, turns: [] }) });
    return () => subscription.unsubscribe();
  }, [sessionId]);

  const back = (
    <button type="button" onClick={onBack} className={SECONDARY} style={TAP}>
      <span aria-hidden="true">&larr; </span>Back to sessions
    </button>
  );
  if (!loaded) return <p className="text-sf-muted">Loading...</p>;
  const { session, turns } = loaded;
  if (!session) {
    return (
      <div className="space-y-3">
        {back}
        <p className="text-sf-muted">This session is not here.</p>
      </div>
    );
  }

  const diagnoses = parentDiagnosesOf(turns);
  const methods = parentMethodsOf(turns);
  const notes = parentNotesOf(turns);
  const recommendations = parentRecommendationsOf(turns);
  const nothing = diagnoses.length + methods.length + notes.length + recommendations.length === 0;
  const ordered = [...turns].sort((a, b) => a.index - b.index);

  return (
    <div className="space-y-4">
      {back}
      <section className={CARD}>
        <h2 className="text-sf-heading font-bold text-lg">{`Session, ${plainDate(session.startedAt)}`}</h2>
        <p className="text-sf-heading">{session.targetText ?? 'No problem yet'}</p>
        {ordered.length > 0 && (
          <ol aria-label="What happened" className="space-y-1 list-decimal pl-5">
            {ordered.map((turn) => (
              <li key={turn.id} className="text-sf-text">{plainTurn(turn)}</li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="notes-for-you" className={CARD}>
        <h2 id="notes-for-you" className="text-sf-heading font-bold text-lg">Notes for you</h2>
        {nothing && <p className="text-sf-muted">Nothing to note for this session.</p>}
        {diagnoses.length > 0 && (
          <div role="group" aria-label="What to look at" className="space-y-1">
            <h3 className="font-bold text-sf-heading">What to look at</h3>
            {diagnoses.map((d) => (
              <div key={`${d.where_wrong}|${d.gap}`}>
                <p className="text-sf-heading">{d.where_wrong}</p>
                <p className="text-sf-heading">{d.gap}</p>
              </div>
            ))}
          </div>
        )}
        {methods.length > 0 && (
          <div role="group" aria-label="The way you did it" className="space-y-1">
            <h3 className="font-bold text-sf-heading">The way you did it</h3>
            {methods.map((m) => (
              <p key={m} className="text-sf-heading">{m}</p>
            ))}
          </div>
        )}
        {notes.map((note) => (
          <p key={note} className="text-sf-heading">{note}</p>
        ))}
        {recommendations.length > 0 && (
          <ul className="space-y-2 list-disc pl-5">
            {recommendations.map((rec) => (
              <li key={`${rec.what}|${rec.why}|${rec.where}`} className="text-sf-heading">
                <strong>{rec.what}</strong>
                <p className="text-sm">{`Why: ${rec.why}`}</p>
                <p className="text-sm">{`Where: ${rec.where}`}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="space-y-3">
        <button type="button" onClick={() => setShowDetails((on) => !on)} aria-expanded={showDetails} className={SECONDARY} style={TAP}>
          Details
        </button>
        {showDetails && <SessionRecord sessionId={sessionId} />}
      </div>
    </div>
  );
}

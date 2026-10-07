// src/features/tutor/session-record.tsx — The Session record (mw-bhvxcn.10): the Sessions list, newest first, and
// for one session every turn's raw material and timing: the request as sent, the photos and audio, each scoring
// engine's word table, the answer as returned, stale/refused/failed marked, and the parent's notes at the foot.
// Read-only: nothing here deletes anything.

import { useEffect, useMemo, useState } from 'react';
import { liveQuery } from 'dexie';
import type { ReadingResult, TutorBlob, TutorSession, TutorTurn } from '../../contracts/types';
import { tutorRepo } from '../../data/repositories';
import { parentNotesOf, parentRecommendationsOf, secondsBetween, sessionAsJson } from './session-json';

const TAP = { minHeight: 'var(--sf-tap-target-size)' } as const;
const BUTTON = 'px-5 rounded-xl font-bold transition-all active:scale-[0.97] disabled:opacity-50';
const SECONDARY = `${BUTTON} bg-sf-surface border border-sf-border text-sf-heading hover:border-sf-border-strong`;
const CARD = 'bg-sf-surface border border-sf-border rounded-xl p-4 space-y-2';
const PRE = 'text-xs bg-sf-bg border border-sf-border rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-words';

const whole = (date: Date) => date.toLocaleString();

const seconds = (n: number) => `${n} second${n === 1 ? '' : 's'}`;

// ─── The Sessions list ────────────────────────────────────────

export interface SessionListProps {
  profileId: string;
  onOpen: (sessionId: string) => void;
}

export function SessionList({ profileId, onOpen }: SessionListProps) {
  const [rows, setRows] = useState<{ session: TutorSession; turns: number }[] | null>(null);

  useEffect(() => {
    const subscription = liveQuery(async () => {
      const sessions = await tutorRepo.listSessions(profileId);
      return Promise.all(sessions.map(async (session) => ({ session, turns: (await tutorRepo.listTurns(session.id)).length })));
    }).subscribe({ next: setRows, error: () => setRows([]) });
    return () => subscription.unsubscribe();
  }, [profileId]);

  if (!rows) return <p className="text-sf-muted">Loading...</p>;
  if (rows.length === 0) return <p className="text-sf-muted">No sessions yet.</p>;
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-sf-heading">Sessions</h2>
      <ul className="space-y-2">
        {rows.map(({ session, turns }) => (
          <li key={session.id}>
            <button type="button" onClick={() => onOpen(session.id)} className={`${SECONDARY} w-full text-left py-2`} style={TAP}>
              <span className="block text-sf-muted text-sm">
                {whole(session.startedAt)} · {session.status === 'active' ? 'Still going' : 'Ended'} · {turns} {turns === 1 ? 'turn' : 'turns'}
              </span>
              <span className="block text-sf-heading font-medium">{session.targetText ?? 'No problem yet'}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── One session's record ─────────────────────────────────────

interface Loaded {
  session: TutorSession | undefined;
  turns: TutorTurn[];
  blobs: Record<string, TutorBlob>;
}

/** Object URLs for the blobs on screen, made once and let go when the record closes; none where the browser has no URLs. */
function useBlobUrls(blobs: Record<string, TutorBlob>): Record<string, string> {
  const urls = useMemo(() => {
    const made: Record<string, string> = {};
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return made;
    for (const [id, blob] of Object.entries(blobs)) made[id] = URL.createObjectURL(new Blob([blob.bytes], { type: blob.mime }));
    return made;
  }, [blobs]);
  useEffect(
    () => () => {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
    },
    [urls],
  );
  return urls;
}

function WordTable({ result }: { result: ReadingResult }) {
  return (
    <div className="space-y-1">
      <p className="text-sf-muted text-sm">{`${result.engine}: accuracy ${result.accuracy}, ${result.seconds} s`}</p>
      <table aria-label={result.engine} className="text-sm border-collapse">
        <thead>
          <tr className="text-left text-sf-muted">
            <th className="pr-4 font-medium">Word</th>
            <th className="pr-4 font-medium">Error</th>
            <th className="font-medium">Accuracy</th>
          </tr>
        </thead>
        <tbody>
          {result.words.map((word, i) => (
            <tr key={`${word.text}-${i}`} className="text-sf-heading">
              <td className="pr-4">{word.text}</td>
              <td className="pr-4">{word.error}</td>
              <td>{word.accuracy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function play(url: string) {
  try {
    void Promise.resolve(new Audio(url).play()).catch(() => undefined);
  } catch {
    // a browser that cannot play the clip leaves the button doing nothing
  }
}

function TurnCard({ turn, blobs, urls }: { turn: TutorTurn; blobs: Record<string, TutorBlob>; urls: Record<string, string> }) {
  const took = secondsBetween(turn);
  const results = turn.readingResult ? [turn.readingResult.azure, turn.readingResult.local].filter((r): r is ReadingResult => r !== undefined) : [];
  return (
    <article aria-label={`Turn ${turn.index}`} className={CARD}>
      <h3 className="font-bold text-sf-heading">{`Turn ${turn.index}`}</h3>
      <p className="text-sf-heading">{`Mode: ${turn.mode}`}</p>
      <p className="text-sf-muted text-sm">{`Sent ${whole(turn.sentAt)}`}</p>
      {turn.answeredAt && <p className="text-sf-muted text-sm">{`Answered ${whole(turn.answeredAt)}`}</p>}
      {took !== undefined && (
        <p className="text-sf-muted text-sm">
          <span>Seconds between: </span>
          <span>{seconds(took)}</span>
        </p>
      )}

      {turn.status === 'stale' && <p className="text-sf-heading font-bold">Stale: he had moved on</p>}
      {turn.status === 'refused' && <p className="text-sf-heading font-bold">{`Refused: ${turn.failureReason ?? 'no reason given'}`}</p>}
      {turn.status === 'failed' && <p className="text-sf-heading font-bold">{`Failed: ${turn.failureReason ?? 'no reason given'}`}</p>}
      {(turn.status === 'sending' || turn.status === 'waiting') && <p className="text-sf-muted text-sm">No answer yet</p>}

      <p className="text-sf-muted text-sm">The request as sent</p>
      <pre className={PRE}>{JSON.stringify(turn.request, null, 2)}</pre>

      {turn.attachments.map((a) => {
        const blob = blobs[a.blobId];
        if (!blob) return null;
        const name = blob.name ?? a.kind;
        const url = urls[a.blobId];
        return (
          <div key={a.blobId} className="space-y-1">
            <p className="text-sf-muted text-sm">{name}</p>
            {a.kind === 'audio' ? (
              <button type="button" aria-label={`Play ${name}`} onClick={() => url && play(url)} disabled={!url} className={SECONDARY} style={TAP}>
                Play
              </button>
            ) : (
              url && <img src={url} alt={name} className="max-h-32 rounded-lg border border-sf-border" />
            )}
          </div>
        );
      })}

      {results.map((result) => (
        <WordTable key={result.engine} result={result} />
      ))}
      {turn.readingNotes && <p className="text-sf-heading text-sm">{`Notes on the reading: ${turn.readingNotes}`}</p>}

      {turn.answer && (
        <>
          <p className="text-sf-muted text-sm">The answer as returned</p>
          <pre className={PRE}>{JSON.stringify(turn.answer, null, 2)}</pre>
        </>
      )}
    </article>
  );
}

export interface SessionRecordProps {
  sessionId: string;
}

export function SessionRecord({ sessionId }: SessionRecordProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [copy, setCopy] = useState<{ message: string; text?: string }>({ message: '' });

  useEffect(() => {
    const subscription = liveQuery(async (): Promise<Loaded> => {
      const session = await tutorRepo.getSession(sessionId);
      const turns = await tutorRepo.listTurns(sessionId);
      const blobs: Record<string, TutorBlob> = {};
      for (const turn of turns) {
        for (const a of turn.attachments) {
          const blob = await tutorRepo.getBlob(a.blobId);
          if (blob) blobs[a.blobId] = blob;
        }
      }
      return { session, turns, blobs };
    }).subscribe({ next: setLoaded, error: () => setLoaded({ session: undefined, turns: [], blobs: {} }) });
    return () => subscription.unsubscribe();
  }, [sessionId]);

  const urls = useBlobUrls(loaded?.blobs ?? {});

  if (!loaded) return <p className="text-sf-muted">Loading...</p>;
  const { session, turns, blobs } = loaded;
  if (!session) return <p className="text-sf-muted">This session is not here.</p>;

  const notes = parentNotesOf(turns);
  const recommendations = parentRecommendationsOf(turns);

  const copyJson = async () => {
    const text = await sessionAsJson(sessionId);
    try {
      await navigator.clipboard.writeText(text);
      setCopy({ message: 'Copied' });
    } catch {
      setCopy({ message: 'Could not copy. Select the text below and copy it by hand.', text });
    }
  };

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <h2 className="text-lg font-bold text-sf-heading">{`Session, ${whole(session.startedAt)}`}</h2>
        {session.targetText && <p className="text-sf-heading">{session.targetText}</p>}
        <p className="text-sf-muted text-sm">{`Tutor strictness: ${session.strictness}`}</p>
        <p className="text-sf-muted text-sm">{session.endedAt ? `Ended ${whole(session.endedAt)}` : 'Still going'}</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void copyJson()} className={SECONDARY} style={TAP}>Copy as JSON</button>
          {copy.message && <p role="status" className="text-sf-muted text-sm">{copy.message}</p>}
        </div>
        {copy.text && (
          <textarea aria-label="Session as JSON" readOnly value={copy.text} rows={8} className="w-full rounded-lg border border-sf-border bg-sf-bg p-2 text-xs font-mono" />
        )}
      </div>

      {turns.map((turn) => (
        <TurnCard key={turn.id} turn={turn} blobs={blobs} urls={urls} />
      ))}

      {(notes.length > 0 || recommendations.length > 0) && (
        <section aria-label="For the parent" className={CARD}>
          <h3 className="font-bold text-sf-heading">For the parent</h3>
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
      )}
    </div>
  );
}

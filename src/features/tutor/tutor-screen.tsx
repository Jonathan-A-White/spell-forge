// src/features/tutor/tutor-screen.tsx — The Tutor (sf-tutor), step one: pick how strict the tutor is, bring a
// problem in by camera or typed, and see it read back large, in the child's own font and size (mw-bhvxcn.8).
// What is shown comes from the tutor's Dexie tables, live, so a reload picks the session up where it was.

import { useCallback, useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import type { Profile, TutorSession, TutorStrictness, TutorTurn } from '../../contracts/types';
import { profileRepo, tutorRepo } from '../../data/repositories';
import { GristInFlight } from '../../grist';
import { MathLoop } from './math-loop';
import { ParentGate } from './parent-gate';
import { ReadingLoop } from './reading-loop';
import { SessionList, SessionRecord } from './session-record';
import { deviceKey, failHalfSent, sendProblem, TutorUserError } from './tutor-flow';
import type { TutorDeps } from './tutor-flow';

export interface TutorScreenProps {
  profile: Profile;
  onBack: () => void;
  /** Called with the profile as it now stands after the child's strictness choice is saved. */
  onProfileChange?: (profile: Profile) => void;
  deps?: TutorDeps;
}

interface Snapshot {
  session: TutorSession | undefined;
  turns: TutorTurn[];
}

type View = { kind: 'tutor' } | { kind: 'sessions' } | { kind: 'parent' } | { kind: 'record'; sessionId: string };

const STOPPED = 'Stopped for now. Your work is kept.';

const STRICTNESS: { value: TutorStrictness; label: string; hint: string }[] = [
  { value: 'meaning-gated', label: 'Meaning first', hint: 'Help with the words that get in the way of the meaning.' },
  { value: 'precision', label: 'Every word', hint: 'Help with every word, even when the meaning is clear.' },
];

/** The problem as the child's own settings show it: his font and weight, and a size well above his reading size. */
const LARGE_TEXT = {
  fontFamily: 'var(--sf-font-family)',
  fontSize: 'calc(var(--sf-font-size) * 1.5)',
  fontWeight: 'var(--sf-font-weight)',
  letterSpacing: 'var(--sf-letter-spacing)',
  lineHeight: 'var(--sf-line-height)',
} as const;
const TAP = { minHeight: 'var(--sf-tap-target-size)' } as const;
const BUTTON = 'px-5 rounded-xl font-bold transition-all active:scale-[0.97] disabled:opacity-50';
const PRIMARY = `${BUTTON} bg-sf-primary text-sf-primary-text hover:bg-sf-primary-hover`;
const SECONDARY = `${BUTTON} bg-sf-surface border border-sf-border text-sf-heading hover:border-sf-border-strong`;

/** The newest problem-in turn: the one that says what the problem is. */
function currentProblemTurn(turns: TutorTurn[]): TutorTurn | undefined {
  return turns.filter((t) => t.mode === 'problem-in').sort((a, b) => b.index - a.index)[0];
}

export function TutorScreen({ profile, onBack, onProfileChange, deps = {} }: TutorScreenProps) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [strictness, setStrictness] = useState<TutorStrictness>(profile.settings.tutorStrictness ?? 'meaning-gated');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [problemError, setProblemError] = useState('');
  const [retyping, setRetyping] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [view, setView] = useState<View>({ kind: 'tutor' });
  const [mathsStarted, setMathsStarted] = useState(false);
  /** What the session ended on (its closing line), kept on screen: the ended session is no longer the active one. */
  const [farewell, setFarewell] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  });

  // The session on screen, live from Dexie: answers land there from the grist client below.
  useEffect(() => {
    const subscription = liveQuery(async () => {
      const session = await tutorRepo.getActiveSession(profile.id);
      return { session, turns: session ? await tutorRepo.listTurns(session.id) : [] };
    }).subscribe({ next: setSnapshot, error: () => setSnapshot({ session: undefined, turns: [] }) });
    return () => subscription.unsubscribe();
  }, [profile.id]);

  // Every turn still out is read for while this screen is open; a turn a closed app left half-sent is failed.
  useEffect(() => {
    const d = depsRef.current;
    const inFlight = new GristInFlight({
      getKey: d.getKey ?? deviceKey,
      read: d.read,
      fetchImpl: d.fetchImpl,
      now: d.now,
    });
    let cancelled = false;
    void (async () => {
      const session = await tutorRepo.getActiveSession(profile.id);
      if (!session || cancelled) return;
      await failHalfSent(await tutorRepo.listTurns(session.id), (d.now ?? (() => new Date()))());
    })();
    const stop = inFlight.start(d.pollIntervalMs);
    return () => {
      cancelled = true;
      stop();
    };
  }, [profile.id]);

  const session = snapshot?.session;
  const current = snapshot ? currentProblemTurn(snapshot.turns) : undefined;
  const waiting = current?.status === 'sending' || current?.status === 'waiting';

  // The seconds count while the factory reads the problem.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  // The answer is the problem now: keep it on the session, so the rest of the tutor can find it.
  const answeredText = current?.status === 'answered' ? (current.answer?.target_text ?? current.request.target_text) : undefined;
  const answeredKind = current?.answer?.problem_kind ?? session?.problemKind;
  useEffect(() => {
    if (!session || !answeredText || session.targetText === answeredText) return;
    void tutorRepo.setProblem(session.id, { targetText: answeredText, problemKind: answeredKind });
  }, [session, answeredText, answeredKind]);

  const chooseStrictness = useCallback(
    async (next: TutorStrictness) => {
      setStrictness(next);
      const settings = { ...profile.settings, tutorStrictness: next };
      await profileRepo.update(profile.id, { settings });
      onProfileChange?.({ ...profile, settings });
    },
    [profile, onProfileChange],
  );

  const send = useCallback(async () => {
    const source = photo ? ({ kind: 'photo', file: photo } as const) : ({ kind: 'text', text } as const);
    setSending(true);
    setProblemError('');
    try {
      await sendProblem({ profileId: profile.id, strictness, source }, depsRef.current);
      setText('');
      setPhoto(null);
    } catch (error) {
      setProblemError(error instanceof TutorUserError ? error.message : 'The problem could not be sent. You can try again.');
    } finally {
      setSending(false);
    }
  }, [photo, text, profile.id, strictness]);

  const startOver = useCallback(async () => {
    if (session) await tutorRepo.endSession(session.id);
    setRetyping(null);
  }, [session]);

  const stopForNow = useCallback(async () => {
    if (!session) return;
    setFarewell(STOPPED);
    await tutorRepo.endSession(session.id);
  }, [session]);

  const startAnother = useCallback(() => {
    setFarewell(null);
    setMathsStarted(false);
  }, []);

  const applyCorrection = useCallback(async () => {
    if (!session || !retyping?.trim()) return;
    await tutorRepo.addCorrection({ sessionId: session.id, strictness: session.strictness, text: retyping.trim() });
    setRetyping(null);
  }, [session, retyping]);

  const goBack = () => {
    if (view.kind === 'record') setView({ kind: 'sessions' });
    else if (view.kind === 'sessions') setView({ kind: 'tutor' });
    else onBack();
  };

  const header = (
    <div className="bg-sf-surface border-b border-sf-border px-4 py-3">
      <div className="max-w-lg md:max-w-4xl mx-auto flex items-center gap-3">
        <button onClick={goBack} className="p-2 -ml-2 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover" aria-label="Go back">
          <span aria-hidden="true">&larr;</span>
        </button>
        <h1 className="text-xl font-bold text-sf-heading">Tutor</h1>
        {view.kind === 'tutor' && (
          <>
            <button onClick={() => setView({ kind: 'parent' })} className={`${SECONDARY} ml-auto flex items-center gap-1.5 text-sm`} style={TAP}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              Grown-ups
            </button>
            <button onClick={() => setView({ kind: 'sessions' })} className={SECONDARY} style={TAP}>Sessions</button>
          </>
        )}
      </div>
    </div>
  );

  const mathTurns = snapshot && current ? snapshot.turns.filter((t) => t.mode === 'math' && t.index > current.index) : [];

  let body: React.ReactNode;
  if (farewell !== null) {
    body = (
      <div role="status" className="space-y-4 py-6">
        <p className="text-sf-heading font-bold text-2xl">{farewell}</p>
        <div className="flex flex-wrap gap-3">
          <button onClick={startAnother} className={PRIMARY} style={TAP}>Start another</button>
          <button onClick={() => setView({ kind: 'sessions' })} className={SECONDARY} style={TAP}>Sessions</button>
        </div>
      </div>
    );
  } else if (!snapshot) {
    body = <p className="text-sf-muted">Loading...</p>;
  } else if (current && waiting) {
    const seconds = Math.max(0, Math.floor((nowMs - current.sentAt.getTime()) / 1000));
    body = (
      <div role="status" className="text-center py-10 space-y-2">
        <p className="text-sf-heading font-bold text-2xl">Reading the problem...</p>
        <p className="text-sf-muted">{`${seconds} second${seconds === 1 ? '' : 's'}`}</p>
      </div>
    );
  } else if (current && answeredText && retyping !== null) {
    body = (
      <div className="space-y-3">
        <label htmlFor="tutor-problem-text" className="block text-sf-heading font-bold">Type the problem</label>
        <textarea
          id="tutor-problem-text"
          value={retyping}
          onChange={(e) => setRetyping(e.target.value)}
          rows={5}
          className="w-full rounded-xl border border-sf-border bg-sf-surface p-3 text-sf-text"
          style={LARGE_TEXT}
        />
        <div className="flex gap-3">
          <button onClick={() => void applyCorrection()} disabled={!retyping.trim()} className={PRIMARY} style={TAP}>Use this</button>
          <button onClick={() => setRetyping(null)} className={SECONDARY} style={TAP}>Cancel</button>
        </div>
      </div>
    );
  } else if (current && answeredText) {
    body = (
      <div className="space-y-4">
        <p className="text-sf-muted text-sm">{answeredKind === 'plain' ? 'A plain problem' : answeredKind === 'word' ? 'A word problem' : 'Your problem'}</p>
        {session && (mathsStarted || mathTurns.length > 0 ? (
          <MathLoop session={session} targetText={answeredText} turns={mathTurns} deps={deps} onFinished={setFarewell} />
        ) : (
          <ReadingLoop
            session={session}
            targetText={answeredText}
            turns={snapshot.turns.filter((t) => t.mode === 'reading' && t.index > current.index)}
            deps={deps}
            onRetype={() => setRetyping(answeredText)}
            onMaths={() => setMathsStarted(true)}
          />
        ))}
      </div>
    );
  } else if (current) {
    const reason =
      current.status === 'answered' || current.status === 'stale'
        ? 'The tutor could not read a problem there.'
        : (current.failureReason ?? 'The tutor could not read the problem.');
    body = (
      <div className="space-y-4">
        <p role="alert" className="text-sf-heading text-lg">{reason}</p>
        <button onClick={() => void startOver()} className={PRIMARY} style={TAP}>Try again</button>
      </div>
    );
  } else {
    const canSend = !sending && (photo !== null || text.trim().length > 0);
    body = (
      <div className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-sf-heading font-bold mb-1">How should the tutor help?</legend>
          {STRICTNESS.map((option) => (
            <div key={option.value} className="flex items-start gap-3">
              <input
                id={`tutor-strictness-${option.value}`}
                type="radio"
                name="tutor-strictness"
                checked={strictness === option.value}
                onChange={() => void chooseStrictness(option.value)}
                aria-describedby={`tutor-strictness-${option.value}-hint`}
                className="mt-1.5 w-5 h-5"
              />
              <div>
                <label htmlFor={`tutor-strictness-${option.value}`} className="text-sf-heading font-medium">{option.label}</label>
                <p id={`tutor-strictness-${option.value}-hint`} className="text-sf-muted text-sm">{option.hint}</p>
              </div>
            </div>
          ))}
        </fieldset>

        <div className="space-y-2">
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            capture="environment"
            data-testid="tutor-photo-input"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setPhoto(file);
                setText('');
                setProblemError('');
              }
              e.target.value = '';
            }}
          />
          <button onClick={() => photoInput.current?.click()} className={SECONDARY} style={TAP}>Take a photo of the problem</button>
          {photo && <p className="text-sf-muted text-sm">{`Photo ready: ${photo.name || 'your photo'}`}</p>}
        </div>

        <div className="space-y-2">
          <label htmlFor="tutor-problem-text" className="block text-sf-heading font-bold">Type the problem</label>
          <textarea
            id="tutor-problem-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value) setPhoto(null);
            }}
            rows={4}
            className="w-full rounded-xl border border-sf-border bg-sf-surface p-3 text-sf-text"
            style={{ fontFamily: 'var(--sf-font-family)', fontSize: 'var(--sf-font-size)' }}
          />
        </div>

        {problemError && <p role="alert" className="text-sf-heading">{problemError}</p>}
        <button onClick={() => void send()} disabled={!canSend} className={PRIMARY} style={TAP}>Send</button>
      </div>
    );
  }

  const stop = session && farewell === null && retyping === null && (
    <button onClick={() => void stopForNow()} className={`${SECONDARY} mt-6`} style={TAP}>Stop for now</button>
  );

  if (view.kind === 'parent') return <ParentGate profileId={profile.id} onExit={() => setView({ kind: 'tutor' })} />;

  return (
    <div className="min-h-screen bg-sf-bg">
      {header}
      <div className="max-w-lg md:max-w-4xl mx-auto px-4 py-5">
        {view.kind === 'sessions' ? (
          <SessionList profileId={profile.id} onOpen={(sessionId) => setView({ kind: 'record', sessionId })} />
        ) : view.kind === 'record' ? (
          <SessionRecord sessionId={view.sessionId} />
        ) : (
          <>
            {body}
            {stop}
          </>
        )}
      </div>
    </div>
  );
}

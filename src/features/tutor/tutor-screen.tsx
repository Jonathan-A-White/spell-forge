// src/features/tutor/tutor-screen.tsx — The Tutor (sf-tutor), step one: bring a problem in by camera (the photo
// sends itself) or typed behind a small keyboard icon, and see it read back large, in the child's own font and size
// (mw-bhvxcn.8). The start screen is photo-first and speaks its prompt (mw-kuy7rx.9); how strict the tutor is
// lives in Tutor settings, not here.
// What is shown comes from the tutor's Dexie tables, live, so a reload picks the session up where it was.

import { useCallback, useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import type { Profile, TutorSession, TutorStrictness, TutorTurn } from '../../contracts/types';
import { tutorRepo } from '../../data/repositories';
import { GristInFlight } from '../../grist';
import { MathLoop } from './math-loop';
import { ParentGate } from './parent-gate';
import { ReadingLoop } from './reading-loop';
import { Waiting } from './pictures';
import { deviceKey, failHalfSent, sendProblem, TutorUserError } from './tutor-flow';
import type { ProblemSource, TutorDeps } from './tutor-flow';
import { tutorSayFor } from './tutor-voice';

export interface TutorScreenProps {
  profile: Profile;
  onBack: () => void;
  /** Called with the profile as it now stands after the Grown-ups screen changes its settings. */
  onProfileChange?: (profile: Profile) => void;
  deps?: TutorDeps;
}

interface Snapshot {
  session: TutorSession | undefined;
  turns: TutorTurn[];
}

type View = { kind: 'tutor' } | { kind: 'parent' };

const STOPPED = 'Stopped for now. Your work is kept.';

const START_PROMPT = 'Take a photo of your problem';

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
  const [typing, setTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const [problemError, setProblemError] = useState('');
  const [retyping, setRetyping] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [view, setView] = useState<View>({ kind: 'tutor' });
  const [mathsStarted, setMathsStarted] = useState(false);
  /** What the session ended on (its closing line), kept on screen: the ended session is no longer the active one. */
  const [farewell, setFarewell] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const spokenStart = useRef(false);
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

  const send = useCallback(
    async (source: ProblemSource) => {
      setSending(true);
      setProblemError('');
      try {
        await sendProblem({ profileId: profile.id, strictness, source }, depsRef.current);
        setText('');
        setTyping(false);
      } catch (error) {
        setProblemError(error instanceof TutorUserError ? error.message : 'The problem could not be sent. You can try again.');
      } finally {
        setSending(false);
      }
    },
    [profile.id, strictness],
  );

  const sayStart = useCallback(() => {
    const speak = depsRef.current.say ?? tutorSayFor(profile.id);
    void Promise.resolve(speak(START_PROMPT)).catch(() => undefined);
  }, [profile.id]);

  // The start screen speaks its prompt once, when it first shows on arrival; a session under way is not greeted.
  const onStartScreen = snapshot !== null && !current && farewell === null;
  useEffect(() => {
    if (!onStartScreen || spokenStart.current) return;
    spokenStart.current = true;
    sayStart();
  }, [onStartScreen, sayStart]);

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

  const header = (
    <div className="bg-sf-surface border-b border-sf-border px-4 py-3">
      <div className="max-w-lg md:max-w-4xl mx-auto flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover" aria-label="Go back">
          <span aria-hidden="true">&larr;</span>
        </button>
        <h1 className="text-xl font-bold text-sf-heading">Tutor</h1>
        <button onClick={() => setView({ kind: 'parent' })} className={`${SECONDARY} ml-auto flex items-center gap-1.5 text-sm`} style={TAP}>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          Grown-ups
        </button>
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
        </div>
      </div>
    );
  } else if (!snapshot) {
    body = <p className="text-sf-muted">Loading...</p>;
  } else if (current && waiting) {
    const seconds = Math.max(0, Math.floor((nowMs - current.sentAt.getTime()) / 1000));
    body = <Waiting label="Reading the problem" seconds={seconds} />;
  } else if (!current && sending) {
    body = <Waiting label="Reading the problem" />;
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
    const canSend = !sending && text.trim().length > 0;
    body = (
      <div className="space-y-5">
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          capture="environment"
          data-testid="tutor-photo-input"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void send({ kind: 'photo', file });
          }}
        />
        <button
          onClick={() => photoInput.current?.click()}
          className={`${PRIMARY} w-full flex flex-col items-center justify-center gap-3 py-10 text-2xl`}
          style={TAP}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" width="72" height="72" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          Take a photo
        </button>

        <div className="flex items-center gap-3">
          <button onClick={sayStart} className={`${SECONDARY} px-3`} style={TAP} aria-label="Say it again">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6 9H3v6h3l5 4z" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
            </svg>
          </button>
          <button
            onClick={() => setTyping((open) => !open)}
            aria-expanded={typing}
            aria-label="Type it instead"
            className={`${SECONDARY} px-3 ml-auto`}
            style={TAP}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
            </svg>
          </button>
        </div>

        {typing && (
          <div className="space-y-2">
            <label htmlFor="tutor-problem-text" className="sr-only">Type the problem</label>
            <textarea
              id="tutor-problem-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-sf-border bg-sf-surface p-3 text-sf-text"
              style={{ fontFamily: 'var(--sf-font-family)', fontSize: 'var(--sf-font-size)' }}
            />
            <button onClick={() => void send({ kind: 'text', text })} disabled={!canSend} className={PRIMARY} style={TAP}>Send</button>
          </div>
        )}

        {problemError && <p role="alert" className="text-sf-heading">{problemError}</p>}
      </div>
    );
  }

  const stop = session && farewell === null && retyping === null && (
    <button onClick={() => void stopForNow()} className={`${SECONDARY} mt-6`} style={TAP}>Stop for now</button>
  );

  if (view.kind === 'parent') {
    return (
      <ParentGate
        profileId={profile.id}
        onExit={() => setView({ kind: 'tutor' })}
        deps={{ sendGrist: deps.sendGrist, getKey: deps.getKey, fetchImpl: deps.fetchImpl, pollIntervalMs: deps.pollIntervalMs, now: deps.now }}
        onProfileChange={(next) => {
          setStrictness(next.settings.tutorStrictness ?? 'meaning-gated');
          onProfileChange?.(next);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-sf-bg">
      {header}
      <div className="max-w-lg md:max-w-4xl mx-auto px-4 py-5">
        {body}
        {stop}
      </div>
    </div>
  );
}

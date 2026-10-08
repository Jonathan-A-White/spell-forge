// src/features/tutor/math-loop.tsx — The maths turn (mw-bhvxcn.10), after the reading is clear: 'Answer' typed
// and/or a 'Photo', sent as a math turn. The answer comes back by action: a probe shows its
// prompt_to_child (never the answer) and offers 'Try again'; confirm_answer says "That's it" and its prompt_to_child;
// done ends the session with a spoken closing line. Everything shown comes from the turns. Only what is for the child
// is shown: the diagnosis and method stay in the turn's answer for the parent screen (mw-kuy7rx.1).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TutorSession, TutorTurn } from '../../contracts/types';
import { tutorRepo } from '../../data/repositories';
import { sendMath, TutorUserError } from './tutor-flow';
import type { TutorDeps } from './tutor-flow';
import { CameraIcon, CheckIcon, PencilIcon, RetryIcon, SayAgainButton, SendIcon, Waiting } from './pictures';
import { tutorSayFor } from './tutor-voice';

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

const SEND_FAILED = 'Your answer could not be sent. You can try again.';

const ICON_BUTTON = 'inline-flex items-center justify-center gap-2';

export interface MathLoopProps {
  session: TutorSession;
  /** The problem as it stands. */
  targetText: string;
  /** The maths turns made since this problem was shown, in order. */
  turns: TutorTurn[];
  deps: TutorDeps;
  /** The session has ended well: the closing line, for the screen to keep showing. */
  onFinished: (closingLine: string) => void;
}

export function MathLoop({ session, targetText, turns, deps, onFinished }: MathLoopProps) {
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  /** The turn whose probe he has read and chosen to try again after. */
  const [retriedAfter, setRetriedAfter] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  });
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  });

  const latest = [...turns].sort((a, b) => b.index - a.index)[0];
  const waiting = latest?.status === 'sending' || latest?.status === 'waiting';

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  const say = useCallback((line: string) => {
    const speak = depsRef.current.say ?? tutorSayFor(session.profileId);
    void Promise.resolve(speak(line)).catch(() => undefined);
  }, [session.profileId]);

  // A new answer is spoken once, as it arrives; answers already there when the screen opened are not.
  const spoken = useRef<Set<string> | null>(null);
  if (spoken.current === null) spoken.current = new Set(turns.filter((t) => t.status === 'answered').map((t) => t.id));
  const finishing = useRef(false);
  useEffect(() => {
    if (latest?.status !== 'answered' || !latest.answer) return;
    const answer = latest.answer;
    if (!spoken.current?.has(latest.id)) {
      spoken.current?.add(latest.id);
      say(answer.prompt_to_child);
    }
    // 'done' ends the session, for a reload that found it answered too
    if (answer.action === 'done' && !finishing.current) {
      finishing.current = true;
      onFinishedRef.current(answer.prompt_to_child);
      void tutorRepo.endSession(session.id);
    }
  }, [latest, say, session.id]);

  const submit = useCallback(async () => {
    setSending(true);
    setMessage('');
    try {
      const turn = await sendMath({ session, targetText, answer: text, photo: photo ?? undefined }, depsRef.current);
      if (turn.status !== 'failed') {
        setText('');
        setPhoto(null);
      }
    } catch (error) {
      setMessage(error instanceof TutorUserError ? error.message : SEND_FAILED);
    } finally {
      setSending(false);
    }
  }, [session, targetText, text, photo]);

  const answer = latest?.status === 'answered' ? latest.answer : undefined;
  const action = answer?.action;
  const probing = action === 'math_probe';
  const confirmed = action === 'confirm_answer';
  const done = action === 'done';
  const showForm = !waiting && !confirmed && !done && (!probing || retriedAfter === latest?.id);
  const canSend = !sending && (photo !== null || text.trim().length > 0);

  return (
    <div className="space-y-4">
      <p className="text-sf-heading whitespace-pre-wrap" style={LARGE_TEXT}>{targetText}</p>

      {answer && !done && (
        <div className="space-y-3">
          {confirmed && <p className="text-sf-heading font-bold text-2xl">That&apos;s it</p>}
          <p className="text-sf-heading text-xl">{answer.prompt_to_child}</p>
          <SayAgainButton onClick={() => say(answer.prompt_to_child)} className={SECONDARY} style={TAP} />
        </div>
      )}

      {answer && done && (
        <div role="status" className="space-y-2">
          <p className="text-sf-heading font-bold text-2xl">Well done</p>
          <p className="text-sf-heading text-xl">{answer.prompt_to_child}</p>
        </div>
      )}

      {latest && waiting && <Waiting label="Waiting" seconds={Math.max(0, Math.floor((nowMs - latest.sentAt.getTime()) / 1000))} />}

      {(latest?.status === 'failed' || latest?.status === 'refused') && (
        <p role="alert" className="text-sf-heading text-lg">{latest.failureReason ?? 'The tutor could not use that answer.'}</p>
      )}

      {probing && retriedAfter !== latest?.id && latest && (
        <button type="button" onClick={() => { setRetriedAfter(latest.id); setText(''); setPhoto(null); }} className={`${PRIMARY} ${ICON_BUTTON}`} style={TAP}><RetryIcon />Try again</button>
      )}

      {showForm && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="tutor-math-answer" className="flex items-center gap-2 text-sf-heading font-bold"><PencilIcon />Answer</label>
            <input
              id="tutor-math-answer"
              type="text"
              inputMode="text"
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full rounded-xl border border-sf-border bg-sf-surface p-3 text-sf-text"
              style={{ ...LARGE_TEXT, minHeight: 'var(--sf-tap-target-size)' }}
            />
          </div>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            capture="environment"
            data-testid="tutor-work-photo-input"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setPhoto(file);
                setMessage('');
              }
              e.target.value = '';
            }}
          />
          <button type="button" onClick={() => photoInput.current?.click()} className={`${SECONDARY} ${ICON_BUTTON}`} style={TAP}><CameraIcon />Photo</button>
          {photo && <span role="img" aria-label="Photo ready" className="inline-flex ml-3 align-middle text-sf-heading"><CheckIcon /></span>}
          {message && <p role="alert" className="text-sf-heading">{message}</p>}
          <div>
            <button type="button" onClick={() => void submit()} disabled={!canSend} className={`${PRIMARY} ${ICON_BUTTON}`} style={TAP}>Send<SendIcon /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// src/features/tutor/reading-loop.tsx — The read-aloud turn (mw-bhvxcn.9), under the problem the Tutor screen shows:
// hold 'Read it' to record, let go to send the clip with the target text, wait ('Thinking about your reading...'), then the answer
// rendered by its action: the focus words lit in the text and broken into chunks, the prompt shown and spoken,
// and 'Read it' offered again until the grist says the reading is clear. Everything shown comes from the turns.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ReadingRecorder, sayWord } from '../../audio';
import type { HoldRecorder, Recording } from '../../audio';
import type { TutorAnswer, TutorSession, TutorTurn } from '../../contracts/types';
import { splitSyllables } from '../../core/phonics';
import { sendReading, TutorUserError } from './tutor-flow';
import type { TutorDeps } from './tutor-flow';

/** A press shorter than this is a tap, not a reading. */
export const MIN_READING_MS = 500;

const TAP_HINT = 'Hold while you read';
const SEND_FAILED = 'Your reading could not be sent. You can try again.';

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
const MARK = 'bg-yellow-200 text-black rounded px-1';

export interface ReadingLoopProps {
  session: TutorSession;
  /** The problem as it stands: the target of every reading. */
  targetText: string;
  /** The reading turns made since this problem was shown, in order. */
  turns: TutorTurn[];
  deps: TutorDeps;
  /** "That's not it": offered while nothing has been read yet. */
  onRetype: () => void;
  /** 'Now the maths': the reading is clear and he moves on. */
  onMaths: () => void;
}

const seconds = (ms: number) => {
  const whole = Math.max(0, Math.floor(ms / 1000));
  return `${whole} second${whole === 1 ? '' : 's'}`;
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The text with each focus word lit (whole words, any case); the whole text lit for `all`. */
function litText(text: string, words: string[], all: boolean): React.ReactNode {
  if (all) return <mark className={MARK}>{text}</mark>;
  const wanted = words.filter((w) => w.trim().length > 0).map(escapeRegExp);
  if (wanted.length === 0) return text;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${wanted.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  return text.split(pattern).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className={MARK}>
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

/** A focus word's chunks as the grist gave them, or the phonics syllabifier's when it gave none. */
function chunksOf(focus: TutorAnswer['focus_words'][number]): string[] {
  return focus.chunks.length > 0 ? focus.chunks : splitSyllables(focus.word);
}

export function ReadingLoop({ session, targetText, turns, deps, onRetype, onMaths }: ReadingLoopProps) {
  const [holding, setHolding] = useState(false);
  const [heldMs, setHeldMs] = useState(0);
  const [message, setMessage] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const hold = useRef<{ recorder: HoldRecorder; startedAt: number; started: boolean; released: boolean } | null>(null);
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  });

  const latest = [...turns].sort((a, b) => b.index - a.index)[0];
  const waiting = latest?.status === 'sending' || latest?.status === 'waiting';

  // The seconds count while he holds, and while the factory listens.
  useEffect(() => {
    if (!holding && !waiting) return;
    const timer = setInterval(() => {
      setNowMs(Date.now());
      if (hold.current) setHeldMs(Date.now() - hold.current.startedAt);
    }, 250);
    return () => clearInterval(timer);
  }, [holding, waiting]);

  const say = useCallback((text: string) => {
    const speak = depsRef.current.say ?? ((t: string) => sayWord(t));
    void Promise.resolve(speak(text)).catch(() => undefined);
  }, []);

  // A new answer is spoken once, as it arrives; answers already there when the screen opened are not.
  const spoken = useRef<Set<string> | null>(null);
  if (spoken.current === null) spoken.current = new Set(turns.filter((t) => t.status === 'answered').map((t) => t.id));
  useEffect(() => {
    if (latest?.status !== 'answered' || !latest.answer || spoken.current?.has(latest.id)) return;
    spoken.current?.add(latest.id);
    if (latest.answer.action !== 'continue') say(latest.answer.prompt_to_child);
  }, [latest, say]);

  const sendClip = useCallback(
    async (recording: Recording) => {
      if (recording.durationMs < MIN_READING_MS) {
        setMessage(TAP_HINT);
        return;
      }
      try {
        await sendReading({ session, targetText, recording }, depsRef.current);
      } catch (error) {
        setMessage(error instanceof TutorUserError ? error.message : SEND_FAILED);
      }
    },
    [session, targetText],
  );

  const finish = useCallback(
    async (h: NonNullable<typeof hold.current>) => {
      hold.current = null;
      setHolding(false);
      try {
        await sendClip(await h.recorder.stop());
      } catch {
        setMessage(SEND_FAILED);
      }
    },
    [sendClip],
  );

  const press = useCallback(async () => {
    if (hold.current) return;
    setMessage('');
    const onLimit = (recording: Recording) => {
      hold.current = null;
      setHolding(false);
      void sendClip(recording);
    };
    const recorder = (depsRef.current.createRecorder ?? ((limit) => new ReadingRecorder(limit)))(onLimit);
    const h = { recorder, startedAt: Date.now(), started: false, released: false };
    hold.current = h;
    setHeldMs(0);
    setHolding(true);
    try {
      await recorder.start();
    } catch (error) {
      if (hold.current === h) hold.current = null;
      setHolding(false);
      setMessage(error instanceof Error && error.message ? error.message : 'The microphone could not be used.');
      return;
    }
    h.started = true;
    h.startedAt = Date.now();
    // he let go while the microphone was still being opened
    if (h.released && hold.current === h) void finish(h);
  }, [finish, sendClip]);

  const release = useCallback(() => {
    const h = hold.current;
    if (!h) return;
    if (!h.started) {
      h.released = true;
      return;
    }
    void finish(h);
  }, [finish]);

  // The screen closing mid-recording lets the microphone go.
  useEffect(
    () => () => {
      hold.current?.recorder.cancel();
      hold.current = null;
    },
    [],
  );

  const answer = latest?.status === 'answered' ? latest.answer : undefined;
  const action = answer?.action;
  const sentence = action === 'reread_sentence';
  const wordFocus = action === 'reread_word' || action === 'sound_out';
  const finished = action === 'continue';

  const readButton = (
    <button
      type="button"
      aria-label={holding ? 'Let go to send' : 'Read it'}
      onPointerDown={(e: ReactPointerEvent<HTMLButtonElement>) => {
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId);
        } catch {
          // a pointer that cannot be captured still records; letting go elsewhere ends it on pointercancel
        }
        void press();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onKeyDown={(e: ReactKeyboardEvent<HTMLButtonElement>) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          void press();
        }
      }}
      onKeyUp={(e: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (e.key === ' ' || e.key === 'Enter') release();
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={`${holding ? `${BUTTON} bg-red-600 text-white` : PRIMARY} w-full text-2xl select-none`}
      style={{ ...TAP, minHeight: 'calc(var(--sf-tap-target-size) * 2)', touchAction: 'none' }}
    >
      {holding ? (
        <span className="flex items-center justify-center gap-3">
          <span data-testid="recording-dot" aria-hidden="true" className="inline-block w-4 h-4 rounded-full bg-white animate-pulse" />
          <span>{seconds(heldMs)}</span>
        </span>
      ) : (
        'Read it'
      )}
    </button>
  );

  const focusWords = answer?.focus_words ?? [];
  return (
    <div className="space-y-4">
      <p className="text-sf-heading whitespace-pre-wrap" style={LARGE_TEXT}>
        {sentence || wordFocus ? litText(targetText, focusWords.map((f) => f.word), sentence) : targetText}
      </p>

      {wordFocus && focusWords.length > 0 && (
        <ul className="space-y-2">
          {focusWords.map((focus) => (
            <li key={focus.word} className="flex flex-wrap items-baseline gap-3">
              <span className="text-sf-muted text-sm">{focus.word}</span>
              <span data-testid="focus-chunks" className="text-sf-heading font-bold" style={LARGE_TEXT}>
                {chunksOf(focus).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}

      {answer && finished && (
        <div role="status" className="space-y-3">
          <p className="text-sf-heading font-bold text-2xl">Nice reading</p>
          <button type="button" onClick={onMaths} className={PRIMARY} style={TAP}>Now the maths</button>
        </div>
      )}

      {answer && !finished && (
        <div className="space-y-3">
          <p className="text-sf-heading text-xl">{answer.prompt_to_child}</p>
          <button type="button" onClick={() => say(answer.prompt_to_child)} className={SECONDARY} style={TAP}>Say it again</button>
        </div>
      )}

      {latest && waiting && (
        <div role="status" className="text-center space-y-1">
          <p className="text-sf-heading font-bold text-2xl">Thinking about your reading...</p>
          <p className="text-sf-muted">{seconds(nowMs - latest.sentAt.getTime())}</p>
        </div>
      )}

      {(latest?.status === 'failed' || latest?.status === 'refused') && (
        <p role="alert" className="text-sf-heading text-lg">{latest.failureReason ?? 'The tutor could not use that reading.'}</p>
      )}

      {message && <p role="alert" className="text-sf-heading text-lg">{message}</p>}

      {!finished && readButton}
      {!latest && !holding && (
        <button type="button" onClick={onRetype} className={SECONDARY} style={TAP}>That&apos;s not it</button>
      )}
    </div>
  );
}

// src/features/tutor/reading-loop.tsx — The read-aloud turn (mw-bhvxcn.9), under the problem the Tutor screen shows:
// hold 'Read it' to record, let go to send the clip with the target text, wait ('Thinking about your reading...'), then the answer
// rendered by its action: the focus words lit in the text and broken into chunks, the prompt shown and spoken,
// and 'Read it' offered again until the grist says the reading is clear. A reread_word answer narrows the screen to the
// one missed word (big, its parts, a one-line tip, 'Say it again', 'Read the word'); the clips then carry that word as their
// target text until a 'continue' answer says the word is clear, when the whole problem returns with 'Read it' (mw-ke5k7i).
// With several focus words the screen walks through them in order, one word at a time, before the whole problem returns;
// a new whole reading with misreads starts the walk again, and only a clear whole reading ends the loop (mw-7wyn4s).
// Everything shown comes from the turns.
// The button works like Postern's push-to-talk (mw-kuy7rx.5): pressing stops the tutor talking, a buzz says the microphone is
// recording, letting go buzzes again, and sliding off the button before letting go drops the attempt (nothing is sent).
// The tutor never starts speaking while the button is held: a reply that arrives mid-hold is spoken on release.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ReadingRecorder, stopSpeaking } from '../../audio';
import type { HoldRecorder, Recording } from '../../audio';
import type { TutorAnswer, TutorSession, TutorTurn } from '../../contracts/types';
import { hapticError, hapticReady, hapticRelease } from '../../core/haptics';
import { splitSyllables } from '../../core/phonics';
import { sendReading, TutorUserError } from './tutor-flow';
import type { TutorDeps } from './tutor-flow';
import { tutorSayFor } from './tutor-voice';

/** A press shorter than this is a tap, not a reading. */
export const MIN_READING_MS = 500;

const TAP_HINT = 'Hold while you read';
/** Pointer distance outside the button's box beyond which the attempt is dropped. */
export const SLIDE_OFF_PX = 40;
const DROPPED_NOTE = 'Dropped. Hold to try again';
const DROPPED_NOTE_MS = 3000;
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
  /** 'Now the math': the reading is clear and he moves on. */
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

/** What the reread screen is on, from the answers the child has seen, in order. */
interface RereadState {
  /** The word the screen is narrowed to. */
  word?: string;
  chunks: string[];
  /** The one-line tip under the word: the answer's own line, or the app's when the word was reached by clearing the one before. */
  tip?: string;
  /** The latest answer cleared a word and the next one is up (`word`). */
  advanced: boolean;
  /** The latest answer cleared the last word: the whole problem returns. */
  cleared: boolean;
}

/**
 * A reread_word answer to a whole reading queues all its focus words, in order, and the screen narrows to the first.
 * Encouragement keeps the word; a 'continue' to a reading of that word clears it and brings up the next one, or, after the
 * last, the whole problem again (`cleared`); anything else drops the queue. A reread_word answer to a word reading only
 * refreshes that word's parts and tip: the queue is the app's.
 */
function rereadState(turns: TutorTurn[]): RereadState {
  let queue: TutorAnswer['focus_words'] = [];
  let at = 0;
  let tip: string | undefined;
  let advanced = false;
  let cleared = false;
  const current = () => (at < queue.length ? queue[at] : undefined);
  for (const turn of [...turns].sort((a, b) => a.index - b.index)) {
    if (turn.status !== 'answered' || !turn.answer) continue;
    const { action, focus_words, prompt_to_child } = turn.answer;
    const word = current();
    const ofWord = word !== undefined && turn.request.target_text === word.word;
    advanced = false;
    cleared = false;
    if (action === 'reread_word' && focus_words.length > 0 && !ofWord) {
      queue = focus_words;
      at = 0;
      tip = prompt_to_child;
    } else if (action === 'reread_word' && word) {
      const again = focus_words.find((f) => f.word.toLowerCase() === word.word.toLowerCase());
      if (again) queue = queue.map((f, i) => (i === at ? again : f));
      tip = prompt_to_child;
    } else if (action === 'encourage') {
      if (word) tip = prompt_to_child;
    } else if (action === 'continue' && ofWord) {
      at += 1;
      if (current()) {
        advanced = true;
        tip = NEXT_WORD_LINE;
      } else {
        queue = [];
        at = 0;
        cleared = true;
      }
    } else {
      queue = [];
      at = 0;
    }
  }
  const word = current();
  return { word: word?.word, chunks: word ? chunksOf(word) : [], tip: word ? tip : undefined, advanced, cleared };
}

/** Said and shown when the next of several misread words is up: the app's line, not the model's (it answered about the word before). */
const NEXT_WORD_LINE = 'Now this word.';

/** Said and shown once a reread word is cleared: the screen waits for the whole problem, never for solving (mw-eezwdm). */
const WORD_CLEARED_LINE = 'Now read the whole problem again.';

export function ReadingLoop({ session, targetText, turns, deps, onRetype, onMaths }: ReadingLoopProps) {
  const [holding, setHolding] = useState(false);
  const [heldMs, setHeldMs] = useState(0);
  const [message, setMessage] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [ready, setReady] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [droppedNote, setDroppedNote] = useState(false);
  const droppedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hold = useRef<{ recorder: HoldRecorder; startedAt: number; started: boolean; released: boolean; dropped: boolean } | null>(null);
  // a line that came due while he held the button: spoken on release
  const heldLine = useRef<string | null>(null);
  const reread = useMemo(() => rereadState(turns), [turns]);
  const rereadWord = reread.word;
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
    if (hold.current) {
      heldLine.current = text;
      return;
    }
    const speak = depsRef.current.say ?? tutorSayFor(session.profileId);
    void Promise.resolve(speak(text)).catch(() => undefined);
  }, [session.profileId]);

  // A new answer is spoken once, as it arrives; answers already there when the screen opened are not.
  const spoken = useRef<Set<string> | null>(null);
  if (spoken.current === null) spoken.current = new Set(turns.filter((t) => t.status === 'answered').map((t) => t.id));
  useEffect(() => {
    if (latest?.status !== 'answered' || !latest.answer || spoken.current?.has(latest.id)) return;
    spoken.current?.add(latest.id);
    if (latest.answer.action !== 'continue') say(latest.answer.prompt_to_child);
    else if (reread.cleared) say(WORD_CLEARED_LINE);
    else if (reread.advanced) say(NEXT_WORD_LINE);
  }, [latest, say, reread]);

  useEffect(() => {
    if (holding || heldLine.current === null) return;
    const line = heldLine.current;
    heldLine.current = null;
    say(line);
  }, [holding, say]);

  const sendClip = useCallback(
    async (recording: Recording) => {
      if (recording.durationMs < MIN_READING_MS) {
        setMessage(TAP_HINT);
        return;
      }
      try {
        await sendReading({ session, targetText: rereadWord ?? targetText, recording }, depsRef.current);
      } catch (error) {
        setMessage(error instanceof TutorUserError ? error.message : SEND_FAILED);
      }
    },
    [session, targetText, rereadWord],
  );

  const finish = useCallback(
    async (h: NonNullable<typeof hold.current>) => {
      hold.current = null;
      setHolding(false);
      setReady(false);
      setDropping(false);
      if (h.dropped) {
        h.recorder.cancel();
        hapticError();
        setDroppedNote(true);
        clearTimeout(droppedTimer.current);
        droppedTimer.current = setTimeout(() => setDroppedNote(false), DROPPED_NOTE_MS);
        return;
      }
      hapticRelease();
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
    setDroppedNote(false);
    clearTimeout(droppedTimer.current);
    // the tutor stops talking the moment he presses, before the microphone opens
    (depsRef.current.stopSpeaking ?? stopSpeaking)();
    const onLimit = (recording: Recording) => {
      hold.current = null;
      setHolding(false);
      setReady(false);
      setDropping(false);
      void sendClip(recording);
    };
    const recorder = (depsRef.current.createRecorder ?? ((limit) => new ReadingRecorder(limit)))(onLimit);
    const h = { recorder, startedAt: Date.now(), started: false, released: false, dropped: false };
    hold.current = h;
    setHeldMs(0);
    setHolding(true);
    try {
      await recorder.start();
    } catch (error) {
      if (hold.current === h) hold.current = null;
      setHolding(false);
      setReady(false);
      setDropping(false);
      setMessage(error instanceof Error && error.message ? error.message : 'The microphone could not be used.');
      return;
    }
    h.started = true;
    h.startedAt = Date.now();
    // the recorder is recording now: buzz and show the ready state
    if (hold.current === h) {
      hapticReady();
      setReady(true);
    }
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

  // Sliding off the button marks the attempt dropped; sliding back on keeps it.
  const slide = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const h = hold.current;
    if (!h) return;
    const box = e.currentTarget.getBoundingClientRect();
    const off = Math.max(box.left - e.clientX, e.clientX - box.right, box.top - e.clientY, e.clientY - box.bottom);
    h.dropped = off > SLIDE_OFF_PX;
    setDropping(h.dropped);
  }, []);

  // The screen closing mid-recording lets the microphone go.
  useEffect(
    () => () => {
      hold.current?.recorder.cancel();
      hold.current = null;
      clearTimeout(droppedTimer.current);
    },
    [],
  );

  const answer = latest?.status === 'answered' ? latest.answer : undefined;
  const action = answer?.action;
  const sentence = action === 'reread_sentence';
  const wordFocus = action === 'reread_word' || action === 'sound_out';
  const wordCleared = action === 'continue' && reread.cleared;
  const finished = action === 'continue' && !wordCleared;
  const rereading = rereadWord !== undefined;

  const readButton = (
    <button
      type="button"
      aria-label={holding ? (dropping ? 'Let go to drop' : 'Let go to send') : rereading ? 'Read the word' : 'Read it'}
      onPointerDown={(e: ReactPointerEvent<HTMLButtonElement>) => {
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId);
        } catch {
          // a pointer that cannot be captured still records; letting go elsewhere ends it on pointercancel
        }
        void press();
      }}
      onPointerMove={slide}
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
      className={`${holding ? `${BUTTON} ${dropping ? 'bg-gray-600' : ready ? 'bg-red-600' : 'bg-amber-600'} text-white` : PRIMARY} w-full text-2xl select-none`}
      style={{ ...TAP, minHeight: 'calc(var(--sf-tap-target-size) * 2)', touchAction: 'none' }}
    >
      {holding ? (
        <span className="flex items-center justify-center gap-3">
          {dropping ? (
            <span>Let go to drop</span>
          ) : ready ? (
            <>
              <span data-testid="recording-dot" aria-hidden="true" className="inline-block w-4 h-4 rounded-full bg-white animate-pulse" />
              <span>{seconds(heldMs)}</span>
            </>
          ) : (
            <span>Getting ready...</span>
          )}
        </span>
      ) : rereading ? (
        'Read the word'
      ) : (
        'Read it'
      )}
    </button>
  );

  const droppedNotice = droppedNote && (
    <p role="status" className="text-sf-heading text-lg">
      <span aria-hidden="true">✋ </span>
      {DROPPED_NOTE}
    </p>
  );

  if (rereading) {
    // the tip stays up while the next reading is out
    const tip = reread.tip;
    return (
      <div className="space-y-4">
        <div className="text-center space-y-2">
          <p data-testid="reread-word" className="text-sf-heading font-bold break-words" style={{ ...LARGE_TEXT, fontSize: 'calc(var(--sf-font-size) * 2.5)' }}>
            {rereadWord}
          </p>
          <p data-testid="focus-chunks" className="text-sf-heading font-bold" style={LARGE_TEXT}>
            {reread.chunks.join(' · ')}
          </p>
        </div>

        {tip && (
          <div className="space-y-3">
            <p className="text-sf-heading text-lg line-clamp-1">{tip}</p>
            <button type="button" onClick={() => say(tip)} className={SECONDARY} style={TAP}>Say it again</button>
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
        {droppedNotice}

        {readButton}
      </div>
    );
  }

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
          <button type="button" onClick={onMaths} className={PRIMARY} style={TAP}>Now the math</button>
        </div>
      )}

      {answer && wordCleared && <p className="text-sf-heading text-xl">{WORD_CLEARED_LINE}</p>}

      {answer && !finished && !wordCleared && (
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
      {droppedNotice}

      {!finished && readButton}
      {!latest && !holding && (
        <button type="button" onClick={onRetype} className={SECONDARY} style={TAP}>That&apos;s not it</button>
      )}
    </div>
  );
}

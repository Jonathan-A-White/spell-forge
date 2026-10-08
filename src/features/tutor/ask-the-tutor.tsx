// src/features/tutor/ask-the-tutor.tsx — 'Ask the tutor' on the Grown-ups screen (mw-kuy7rx.13): type a question
// (the phone keyboard's own mic dictates; there is no speech recognition here), Ask, wait with the seconds, read the
// answer with its examples. The last 10 asks stay on the device, each with its answer. What is shown is live from
// the parentAsks table, so a reload picks a waiting ask up where it was.

import { useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import type { ParentAsk } from '../../contracts/types';
import { parentAskRepo } from '../../data/repositories';
import { ParentAskInFlight } from '../../grist';
import { PARENT_ASK_MAX_QUESTION } from './parent-ask-request';
import { PARENT_ASK_HISTORY, failHalfSentAsks, sendParentAsk } from './parent-ask-flow';
import type { ParentAskDeps } from './parent-ask-flow';
import { Waiting } from './pictures';
import { TutorUserError, deviceKey } from './tutor-flow';

export interface AskTheTutorProps {
  profileId: string;
  deps?: ParentAskDeps;
}

const TAP = { minHeight: 'var(--sf-tap-target-size)' } as const;
const BUTTON = 'px-4 rounded-xl font-bold border active:scale-[0.97] disabled:opacity-50';
const PRIMARY = `${BUTTON} bg-sf-primary text-sf-primary-text border-transparent hover:bg-sf-primary-hover`;
const SECONDARY = `${BUTTON} bg-sf-surface border-sf-border text-sf-heading hover:border-sf-border-strong`;
const OUT: ReadonlySet<ParentAsk['status']> = new Set(['sending', 'waiting']);

export function AskTheTutor({ profileId, deps = {} }: AskTheTutorProps) {
  const [asks, setAsks] = useState<ParentAsk[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const field = useRef<HTMLTextAreaElement>(null);
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  });

  // The asks on screen, live from Dexie: answers land there from the grist client below.
  useEffect(() => {
    const subscription = liveQuery(() => parentAskRepo.listForProfile(profileId)).subscribe({
      next: setAsks,
      error: () => setAsks([]),
    });
    return () => subscription.unsubscribe();
  }, [profileId]);

  // Every ask still out is read for while this box is open; one a closed app left half-sent is failed.
  useEffect(() => {
    const d = depsRef.current;
    const inFlight = new ParentAskInFlight({ getKey: d.getKey ?? deviceKey, read: d.read, fetchImpl: d.fetchImpl, now: d.now });
    let cancelled = false;
    void (async () => {
      const mine = await parentAskRepo.listForProfile(profileId);
      if (!cancelled) await failHalfSentAsks(mine, (d.now ?? (() => new Date()))());
    })();
    const stop = inFlight.start(d.pollIntervalMs);
    return () => {
      cancelled = true;
      stop();
    };
  }, [profileId]);

  const shown = (asks ?? []).slice(0, PARENT_ASK_HISTORY);
  const out = (asks ?? []).some((ask) => OUT.has(ask.status));

  // The seconds count while the factory works on an ask.
  useEffect(() => {
    if (!out) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [out]);

  const text = draft.trim();

  const submit = async () => {
    if (!text || sending || out) return;
    setSending(true);
    setProblem('');
    try {
      await sendParentAsk({ profileId, question: text }, depsRef.current);
      setDraft('');
    } catch (error) {
      setProblem(error instanceof TutorUserError ? error.message : 'The question could not be sent. You can try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section aria-labelledby="ask-the-tutor-title" className="rounded-xl bg-sf-surface border border-sf-border p-4 space-y-3">
      <h2 id="ask-the-tutor-title" className="text-sf-heading font-bold text-lg">Ask the tutor</h2>
      <p className="text-sf-muted text-sm">
        Ask about how your child is getting on. The tutor answers from the last 20 sessions. Use your keyboard&apos;s microphone to say it instead of typing.
      </p>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <textarea
          ref={field}
          aria-label="Your question"
          placeholder="For example: Which words does he get wrong most?"
          rows={3}
          maxLength={PARENT_ASK_MAX_QUESTION}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-sf-border bg-sf-bg text-sf-heading"
        />
        <button type="submit" className={PRIMARY} style={TAP} disabled={!text || sending || out}>
          Ask
        </button>
      </form>
      {problem && <p role="alert" className="text-sf-error">{problem}</p>}
      {asks && shown.length === 0 && <p className="text-sf-muted">No questions yet.</p>}
      {shown.length > 0 && (
        <ul className="space-y-3">
          {shown.map((ask) => (
            <li key={ask.id} className="rounded-xl border border-sf-border bg-sf-bg p-3 space-y-2">
              <p className="text-sf-heading font-bold">{ask.question}</p>
              {OUT.has(ask.status) && <Waiting label="Waiting for the answer" seconds={Math.max(0, Math.floor((nowMs - ask.askedAt.getTime()) / 1000))} />}
              {ask.status === 'answered' && ask.answer && (
                <>
                  <p className="text-sf-text whitespace-pre-line">{ask.answer.answer}</p>
                  {ask.answer.examples.length > 0 && (
                    <ul className="list-disc pl-5 text-sf-muted text-sm space-y-1">
                      {ask.answer.examples.map((example, i) => (
                        <li key={`${i}-${example}`}>{example}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              {(ask.status === 'failed' || ask.status === 'refused') && (
                <>
                  <p className="text-sf-error">{ask.failureReason ?? 'The tutor could not answer this.'}</p>
                  <button
                    type="button"
                    className={SECONDARY}
                    style={TAP}
                    aria-label={`Ask again: ${ask.question}`}
                    onClick={() => {
                      setDraft(ask.question);
                      field.current?.focus();
                    }}
                  >
                    Ask again
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

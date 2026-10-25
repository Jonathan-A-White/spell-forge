// src/worlds/maths/MathsWorld.tsx — The Maths world (Kestrel 19a): hosts the flow's questions one at a time, tells the tutor where the child
// is (M37: the screen's name and a few facts, never the answer or the hint), and runs its one timer through the shell's visible-interval
// helper (M10). What is asked, and how an answer counts, is maths-flow.ts's; this draws it. The child reads little and is not expected to
// type: "Not sure" is an answer, and a wrong one is met with a nudge and a way on, never a dead end.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useVisibleInterval } from '../../shell/visible-interval';
import { createMathsFlow, storageGraphStore, storageKeep, type MathsAnswer, type MathsFlow, type MathsQuestion } from './maths-flow';
import { IDLE_LOOK_MS, MATHS_SCREEN_NAME, screenReport, type ScreenReport } from './maths-report';

export interface MathsWorldProps {
  /** The flow to ask questions of; one over the child's own place on the phone when absent (needs `profileId`). */
  flow?: MathsFlow;
  profileId?: string;
  /** Where the world tells the tutor where the child is: called with each new question and when there is none. */
  report?: (screen: ScreenReport) => void;
  onBack?: () => void;
}

const TAP = { minHeight: 'var(--sf-tap-target-size)' } as const;

const BUTTON = 'px-5 rounded-xl font-bold active:scale-[0.97] transition-transform';

export function MathsWorld({ flow: given, profileId, report, onBack }: MathsWorldProps) {
  const flow = useMemo(
    () => given ?? createMathsFlow({ store: storageGraphStore(profileId ?? 'learner'), keep: storageKeep(profileId ?? 'learner') }),
    [given, profileId],
  );
  const [round, setRound] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [question, setQuestion] = useState<MathsQuestion | null>(null);
  const [text, setText] = useState('');
  const [hint, setHint] = useState(false);
  const [result, setResult] = useState<{ answer: MathsAnswer; given: string; hinted: boolean } | null>(null);

  useEffect(() => {
    let current = true;
    void flow.question().then((next) => {
      if (!current) return;
      setQuestion(next);
      setLoaded(true);
    });
    return () => {
      current = false;
    };
  }, [flow, round]);

  const latestReport = useRef(report);
  useEffect(() => {
    latestReport.current = report;
  });
  useEffect(() => {
    if (loaded) latestReport.current?.(screenReport(question));
  }, [loaded, question]);

  // With nothing to ask, look again now and then: a review comes due while the page is open. A question showing needs no timer.
  useVisibleInterval(() => setRound((r) => r + 1), loaded && question === null ? IDLE_LOOK_MS : null);

  const check = async (answer: string, hinted: boolean) => {
    if (!question || result) return;
    setResult({ answer: await flow.answer(answer, { hinted }), given: answer, hinted });
  };

  const next = () => {
    setResult(null);
    setText('');
    setHint(false);
    setQuestion(null);
    setLoaded(false);
    setRound((r) => r + 1);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim() !== '') void check(text, hint);
  };

  return (
    <div className="min-h-screen bg-sf-bg p-4">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-4">
          {onBack && (
            <button onClick={onBack} style={TAP} className="px-3 -ml-3 rounded-lg text-sf-muted hover:text-sf-secondary" aria-label="Go back">
              &larr;
            </button>
          )}
          <h1 className="text-sf-heading text-xl font-bold">{MATHS_SCREEN_NAME}</h1>
        </div>

        {!loaded && <p className="text-sf-muted">One moment...</p>}

        {loaded && question === null && (
          <p role="status" className="text-sf-text text-lg">
            All done for today. Come back later for more.
          </p>
        )}

        {question && (
          <form onSubmit={submit} className="flex flex-col gap-4">
            {question.stage === 'placement' && (
              <p className="text-sf-muted text-sm">Let&apos;s see what you know. Tap &ldquo;Not sure&rdquo; if you want to skip one.</p>
            )}
            <p className="text-sf-muted text-sm">{question.nodeName}</p>
            <p className="text-sf-heading text-2xl font-bold">{question.item.problem}</p>

            {hint && !result && <p className="text-sf-text">{question.item.hint}</p>}

            <label className="flex flex-col gap-1 text-sf-text">
              <span className="text-sm">Your answer</span>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={result !== null}
                autoComplete="off"
                autoCapitalize="off"
                enterKeyHint="done"
                style={TAP}
                className="px-3 rounded-xl border border-sf-border bg-sf-surface text-sf-heading text-xl"
              />
            </label>

            {result ? (
              <>
                <Feedback result={result} question={question} />
                <button type="button" onClick={next} style={TAP} className={`${BUTTON} bg-sf-primary text-sf-primary-text`}>
                  Next
                </button>
              </>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={text.trim() === ''} style={TAP} className={`${BUTTON} bg-sf-primary text-sf-primary-text disabled:opacity-50`}>
                  Check
                </button>
                <button type="button" onClick={() => setHint(true)} style={TAP} className={`${BUTTON} bg-sf-surface border border-sf-border text-sf-text`}>
                  Hint
                </button>
                <button type="button" onClick={() => void check('', hint)} style={TAP} className={`${BUTTON} bg-sf-surface border border-sf-border text-sf-text`}>
                  Not sure
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function Feedback({ result, question }: { result: { answer: MathsAnswer; given: string; hinted: boolean }; question: MathsQuestion }) {
  const { answer, hinted } = result;
  let line: string;
  if (answer.right) line = hinted ? 'Right! You had a little help, so try one without.' : answer.solid ? 'Right! You have got this one.' : 'Right! Well done.';
  else line = result.given.trim() === '' ? `That's okay. A nudge: ${question.item.hint}` : `Not quite yet. A nudge: ${question.item.hint}`;
  return (
    <p role="status" className="text-sf-text text-lg">
      {line}
    </p>
  );
}

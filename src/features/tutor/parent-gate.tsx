// src/features/tutor/parent-gate.tsx — The PIN in front of the Grown-ups screen (mw-kuy7rx.2).
// First open: choose a PIN, type it again, pick a recovery question and answer it. After that: the pad, and
// 'Forgot PIN?' for the recovery question. The unlocked state lives only in this component, so Back, a reload
// and the app being hidden each leave the screen closed behind the PIN again.

import { useEffect, useState } from 'react';
import { hapticError } from '../../core/haptics';
import { PinPad } from './pin-pad';
import { ParentScreen } from './parent-screen';
import {
  checkParentPin,
  checkRecoveryAnswer,
  getRecoveryQuestion,
  hasParentPin,
  resetParentPin,
  setParentPin,
} from './parent-pin';

export interface ParentGateProps {
  /** Leave the Grown-ups area, back to the Tutor. */
  onExit: () => void;
}

type Step =
  | { kind: 'enter' }
  | { kind: 'choose'; message?: string }
  | { kind: 'confirm'; first: string }
  | { kind: 'question'; pin: string }
  | { kind: 'recover' }
  | { kind: 'new-choose'; answer: string; message?: string }
  | { kind: 'new-confirm'; answer: string; first: string }
  | { kind: 'open' };

const QUESTIONS = [
  'What is the name of your first pet?',
  'What street did you grow up on?',
  'What is your favourite meal?',
  'What was your first school called?',
];
const OWN = '__own__';
const FIELD = 'w-full rounded-xl border border-sf-border bg-sf-surface p-3 text-sf-text';
const TAP = { minHeight: 'var(--sf-tap-target-size)' } as const;
const BUTTON = 'px-5 rounded-xl font-bold transition-all active:scale-[0.97] disabled:opacity-50';
const PRIMARY = `${BUTTON} bg-sf-primary text-sf-primary-text hover:bg-sf-primary-hover`;
const SECONDARY = `${BUTTON} bg-sf-surface border border-sf-border text-sf-heading hover:border-sf-border-strong`;

export function ParentGate({ onExit }: ParentGateProps) {
  const [step, setStep] = useState<Step>(() => (hasParentPin() ? { kind: 'enter' } : { kind: 'choose' }));
  const [wrong, setWrong] = useState(0);

  // The app being hidden locks the screen again.
  useEffect(() => {
    const lock = () => {
      if (document.visibilityState !== 'hidden') return;
      setWrong(0);
      setStep(hasParentPin() ? { kind: 'enter' } : { kind: 'choose' });
    };
    document.addEventListener('visibilitychange', lock);
    return () => document.removeEventListener('visibilitychange', lock);
  }, []);

  const frame = (children: React.ReactNode) => (
    <div className="min-h-screen bg-sf-bg">
      <div className="bg-sf-surface border-b border-sf-border px-4 py-3">
        <div className="max-w-lg md:max-w-4xl mx-auto flex items-center gap-3">
          <button onClick={onExit} className="p-2 -ml-2 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover" aria-label="Go back">
            <span aria-hidden="true">&larr;</span>
          </button>
          <p className="text-xl font-bold text-sf-heading">Grown-ups</p>
        </div>
      </div>
      <div className="max-w-lg md:max-w-4xl mx-auto px-4 py-5">{children}</div>
    </div>
  );

  if (step.kind === 'open') return <ParentScreen onBack={onExit} />;

  if (step.kind === 'enter') {
    const check = async (pin: string) => {
      if (await checkParentPin(pin)) {
        setStep({ kind: 'open' });
        return;
      }
      hapticError();
      setWrong((n) => n + 1);
    };
    return frame(
      <>
        <PinPad title="Enter your PIN" onComplete={(pin) => void check(pin)} error={wrong ? 'Try again' : undefined} attempt={wrong} />
        <div className="text-center">
          <button onClick={() => { setWrong(0); setStep({ kind: 'recover' }); }} className={SECONDARY} style={TAP}>Forgot PIN?</button>
        </div>
      </>,
    );
  }

  if (step.kind === 'choose') {
    return frame(
      <PinPad
        title="Choose a 4-digit PIN"
        error={step.message}
        attempt={step.message ? 1 : 0}
        onComplete={(pin) => setStep({ kind: 'confirm', first: pin })}
      />,
    );
  }

  if (step.kind === 'confirm') {
    const { first } = step;
    return frame(
      <PinPad
        title="Type it again"
        onComplete={(pin) =>
          setStep(pin === first ? { kind: 'question', pin } : { kind: 'choose', message: 'Those did not match. Try again.' })
        }
      />,
    );
  }

  if (step.kind === 'question') {
    return frame(
      <QuestionForm
        onSave={async (question, answer) => {
          await setParentPin(step.pin, question, answer);
          setStep({ kind: 'open' });
        }}
      />,
    );
  }

  if (step.kind === 'recover') {
    return frame(<RecoverForm onRight={(answer) => setStep({ kind: 'new-choose', answer })} onCancel={() => setStep({ kind: 'enter' })} />);
  }

  if (step.kind === 'new-choose') {
    const { answer } = step;
    return frame(
      <PinPad
        title="Choose a new PIN"
        error={step.message}
        attempt={step.message ? 1 : 0}
        onComplete={(pin) => setStep({ kind: 'new-confirm', answer, first: pin })}
      />,
    );
  }

  const { answer, first } = step;
  return frame(
    <PinPad
      title="Type it again"
      onComplete={(pin) => {
        if (pin !== first) {
          setStep({ kind: 'new-choose', answer, message: 'Those did not match. Try again.' });
          return;
        }
        void resetParentPin(answer, pin).then((ok) => setStep(ok ? { kind: 'open' } : { kind: 'enter' }));
      }}
    />,
  );
}

function QuestionForm({ onSave }: { onSave: (question: string, answer: string) => Promise<void> }) {
  const [choice, setChoice] = useState(QUESTIONS[0]);
  const [own, setOwn] = useState('');
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const question = choice === OWN ? own.trim() : choice;
  const ready = question.length > 0 && answer.trim().length > 0 && !saving;

  return (
    <form
      className="max-w-sm mx-auto space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        setSaving(true);
        void onSave(question, answer);
      }}
    >
      <h2 className="text-sf-heading font-bold text-2xl">Pick a question</h2>
      <p className="text-sf-muted">If you forget the PIN, this question lets you choose a new one.</p>
      <div className="space-y-1">
        <label htmlFor="parent-question" className="block text-sf-heading font-bold">Question</label>
        <select id="parent-question" value={choice} onChange={(e) => setChoice(e.target.value)} className={FIELD}>
          {QUESTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
          <option value={OWN}>Write your own</option>
        </select>
      </div>
      {choice === OWN && (
        <div className="space-y-1">
          <label htmlFor="parent-question-own" className="block text-sf-heading font-bold">Write your question</label>
          <input id="parent-question-own" value={own} onChange={(e) => setOwn(e.target.value)} className={FIELD} />
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor="parent-answer" className="block text-sf-heading font-bold">Your answer</label>
        <input id="parent-answer" value={answer} onChange={(e) => setAnswer(e.target.value)} autoComplete="off" className={FIELD} />
      </div>
      <button type="submit" disabled={!ready} className={PRIMARY} style={TAP}>Save</button>
    </form>
  );
}

function RecoverForm({ onRight, onCancel }: { onRight: (answer: string) => void; onCancel: () => void }) {
  const question = getRecoveryQuestion() ?? '';
  const [answer, setAnswer] = useState('');
  const [wrong, setWrong] = useState(false);

  return (
    <form
      className="max-w-sm mx-auto space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void checkRecoveryAnswer(answer).then((ok) => {
          if (ok) onRight(answer);
          else {
            hapticError();
            setWrong(true);
          }
        });
      }}
    >
      <h2 className="text-sf-heading font-bold text-2xl">Forgot PIN?</h2>
      <p className="text-sf-heading text-lg">{question}</p>
      <div className="space-y-1">
        <label htmlFor="parent-recover-answer" className="block text-sf-heading font-bold">Your answer</label>
        <input id="parent-recover-answer" value={answer} onChange={(e) => { setAnswer(e.target.value); setWrong(false); }} autoComplete="off" className={FIELD} />
      </div>
      {wrong && <p role="alert" className="text-sf-heading font-medium">That is not the answer. Try again.</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={!answer.trim()} className={PRIMARY} style={TAP}>Check</button>
        <button type="button" onClick={onCancel} className={SECONDARY} style={TAP}>Cancel</button>
      </div>
    </form>
  );
}

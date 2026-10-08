// src/features/tutor/pin-pad.tsx — A four-digit PIN pad: four boxes, big digits, a delete key (mw-kuy7rx.2).
// It collects digits only; what they mean is the caller's business. A wrong PIN is the caller telling it so
// through `error`, and it shakes the boxes (the global reduced-motion rule keeps the shake still when asked).

import { useState } from 'react';

export interface PinPadProps {
  title: string;
  /** Called once with all four digits; the pad then clears itself. */
  onComplete: (pin: string) => void;
  /** A line under the boxes, e.g. 'Try again'. Setting it shakes the boxes. */
  error?: string;
  /** Changes with every wrong PIN, so a second wrong PIN shakes again. */
  attempt?: number;
}

const DIGIT_ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']];
const KEY = 'rounded-xl bg-sf-surface border border-sf-border text-sf-heading font-bold text-3xl hover:border-sf-border-strong active:scale-[0.97] transition-all';
const KEY_STYLE = { minHeight: 'max(4rem, var(--sf-tap-target-size))' } as const;

export function PinPad({ title, onComplete, error, attempt = 0 }: PinPadProps) {
  const [digits, setDigits] = useState('');

  const press = (digit: string) => {
    const next = digits + digit;
    if (next.length < 4) {
      setDigits(next);
      return;
    }
    setDigits('');
    onComplete(next);
  };

  return (
    <div className="max-w-xs mx-auto space-y-5 py-6 text-center">
      <h2 className="text-sf-heading font-bold text-2xl">{title}</h2>
      <div key={attempt} className={`flex justify-center gap-3 ${error ? 'animate-sf-shake' : ''}`}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            data-testid="pin-box"
            data-filled={i < digits.length}
            aria-hidden="true"
            className="w-14 h-16 rounded-xl border-2 border-sf-border-strong bg-sf-surface flex items-center justify-center text-3xl text-sf-heading"
          >
            {i < digits.length ? '•' : ''}
          </div>
        ))}
      </div>
      <p role={error ? 'alert' : undefined} className="text-sf-heading font-medium min-h-6">{error ?? ''}</p>
      <div className="grid grid-cols-3 gap-3">
        {DIGIT_ROWS.flat().map((d) => (
          <button key={d} type="button" onClick={() => press(d)} className={KEY} style={KEY_STYLE}>{d}</button>
        ))}
        <span aria-hidden="true" />
        <button type="button" onClick={() => press('0')} className={KEY} style={KEY_STYLE}>0</button>
        <button
          type="button"
          onClick={() => setDigits((d) => d.slice(0, -1))}
          className={`${KEY} text-base`}
          style={KEY_STYLE}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

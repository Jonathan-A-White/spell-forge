// src/features/tutor/length-note.tsx — The count under a text box with a limit (mw-gq6.463). A box with a limit never
// uses maxLength, which cuts a paste without a word: it keeps the whole text, shows 'N of M' once the text is near the
// limit, red with the reason once it is over, and the button that sends it is off and points at this line.

import { tooLongReason } from './length-limit';

/** The share of the limit at which the count first shows. */
const NEAR = 0.9;

export interface LengthNoteProps {
  id: string;
  text: string;
  max: number;
  /** What is too long, for the reason: 'note', 'question'. */
  what: string;
  /** What the button does, for the reason: 'add', 'send'. */
  verb: string;
}

export function LengthNote({ id, text, max, what, verb }: LengthNoteProps) {
  const length = text.trim().length;
  if (length <= max * NEAR) return null;
  const over = length > max;
  return (
    <p id={id} role="status" className={`text-sm break-words ${over ? 'text-sf-error font-bold' : 'text-sf-muted'}`}>
      {over ? tooLongReason(text, max, what, verb) : `${length} of ${max}`}
    </p>
  );
}

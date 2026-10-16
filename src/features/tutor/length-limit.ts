// src/features/tutor/length-limit.ts — The rule for a text box with a limit (mw-gq6.463): it never uses maxLength, which
// cuts a paste without a word. The box keeps the whole text; past the limit the button is off and this says why.

/** Whether `text` is past `max` as it would be sent (trimmed). */
export const isTooLong = (text: string, max: number): boolean => text.trim().length > max;

/** Why a text past its limit is not sent: 'N of M: the question is too long to send. ...'. */
export const tooLongReason = (text: string, max: number, what: string, verb: string): string =>
  `${text.trim().length} of ${max}: the ${what} is too long to ${verb}. Shorten it; nothing has been cut.`;

// src/worlds/maths/drill-forms.ts — The maths drill forms for learn-kit/drill (Kestrel 19b): how a problem is put to the child and the
// answer taken. type is the box 19a had; hear speaks the problem through voice-kit's speak in the language named; see draws it (SVG, under the
// Shell's one scroll box); do takes the answer by dragging number tiles or by saying it to the Composer, typing off. The answer is checked by the
// flow, on the phone (maths-flow.ts, checkAnswer): a form only gathers it. The components are ask-forms.tsx's; this file registers them.

import { createElement, type ReactElement } from 'react';
import { createForms, type Forms } from 'learn-kit/drill';
import type { MathsItem } from '../../learn/maths';
import { DoForm, HearForm, SeeForm, TypeForm, type AskProps } from './ask-forms';

export type { AskProps } from './ask-forms';

/** The four forms, in the order they are offered. */
export const MATHS_FORM_IDS = ['type', 'hear', 'see', 'do'] as const;

export type MathsFormId = (typeof MATHS_FORM_IDS)[number];

/** The render contract of a maths form: a name for the child's tutor to read, and the component that puts the problem and takes the answer. */
export interface AskForm {
  name: string;
  Ask: (props: AskProps) => ReactElement;
}

/** The registry of the four forms, for learn-kit's drill. */
export const askForms: Forms<AskForm> = createForms<AskForm>([
  { id: 'type', render: { name: 'type an answer', Ask: TypeForm } },
  { id: 'hear', render: { name: 'hear the problem', Ask: HearForm } },
  { id: 'see', render: { name: 'see the problem', Ask: SeeForm } },
  { id: 'do', render: { name: 'drag or say the answer', Ask: DoForm } },
]);

/** The form drawn with this item: the problem put to the child in that way, and a way to give the answer. */
export function openForm(id: MathsFormId, props: AskProps): ReactElement {
  return createElement(askForms.get(id).render.Ask, props);
}

/** Is the answer made only of what the number tiles hold (digits, a minus, a point, a slash, a colon)? Only then can it be dragged. */
export function canDo(item: MathsItem): boolean {
  return /^-?[\d./:]+$/.test(item.answer.trim());
}

const hashOf = (text: string): number => {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
};

/**
 * Which form a question is put in, the same one every time for the same question: spread over `allowed` by its key. The tiles are left
 * out for an answer they cannot build (a word).
 */
export function formFor(question: { key: string; item: MathsItem }, allowed: readonly MathsFormId[] = MATHS_FORM_IDS): MathsFormId {
  const usable = allowed.filter((id) => id !== 'do' || canDo(question.item));
  const pool = usable.length > 0 ? usable : (['type'] as const);
  return pool[hashOf(question.key) % pool.length];
}

const DIGIT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

const asDigit = (word: string): string => (DIGIT_WORDS.includes(word) ? String(DIGIT_WORDS.indexOf(word)) : word);

/**
 * What a child said, read as an answer: no full stop, "over" as a slash ("3 over 4" is 3/4) and "point" as a point ("zero point three"
 * is 0.3). Anything else is left as the recogniser wrote it: checkAnswer reads digits and number words.
 */
export function spokenAnswer(said: string): string {
  const text = said.trim().toLowerCase().replace(/[.!?]+$/, '').replace(/\s+/g, ' ');
  const over = /^(\S+) over (\S+)$/.exec(text);
  if (over) return `${asDigit(over[1])}/${asDigit(over[2])}`;
  const words = text.split(' ');
  if (words.includes('point') && words.every((w) => w === 'point' || DIGIT_WORDS.includes(w) || /^\d$/.test(w))) {
    return words.map((w) => (w === 'point' ? '.' : asDigit(w))).join('');
  }
  return text;
}

// The parent-ask grind (grinds/parent-ask.json): what the mill is asked, and the shape of what comes back.
// isParentAskAnswer matches grinds/parent-ask.answer.schema.json; the unit test holds the two together.

import type { ParentAskAnswer } from '../contracts/types';

export const PARENT_ASK_GRIND = { app: 'spellforge', kind: 'parent-ask', v: '1' } as const;

const MAX_ANSWER = 4000;
const MAX_EXAMPLES = 10;
const MAX_EXAMPLE = 500;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

export function isParentAskAnswer(value: unknown): value is ParentAskAnswer {
  if (!isObject(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes('answer') || !keys.includes('examples')) return false;
  if (!isText(value.answer, MAX_ANSWER)) return false;
  const examples = value.examples;
  return Array.isArray(examples) && examples.length <= MAX_EXAMPLES && examples.every((example) => isText(example, MAX_EXAMPLE));
}

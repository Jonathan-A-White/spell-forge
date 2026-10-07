// The tutor-turn grind (grinds/tutor-turn.json): what the mill is asked, and the shape of what comes back.
// isTutorAnswer matches grinds/tutor-turn.answer.schema.json; the unit test holds the two together.

import type { ReadingResult, TutorAnswer, TutorReadingResult } from '../contracts/types';

export const TUTOR_TURN_GRIND = { app: 'spellforge', kind: 'tutor-turn', v: '1' } as const;

const ACTIONS = ['continue', 'reread_word', 'reread_sentence', 'sound_out', 'math_probe', 'confirm_answer', 'encourage', 'done'];
const LAYERS = ['reading', 'math', 'both', 'none'];
const PROBLEM_KINDS = ['word', 'plain'];
const ALLOWED_KEYS = new Set([
  'action', 'focus_words', 'prompt_to_child', 'layer_diagnosis', 'math_diagnosis', 'target_text', 'problem_kind',
  'notes_for_parent', 'recommendations_for_parent', 'teaching_method',
]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown, max = Infinity): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

/** An object with exactly these keys, each a non-empty string. */
function isStrings(value: unknown, keys: string[]): boolean {
  if (!isObject(value)) return false;
  const present = Object.keys(value);
  return present.length === keys.length && keys.every((k) => isText(value[k]));
}

function isFocusWord(value: unknown): boolean {
  if (!isObject(value) || Object.keys(value).length !== 2) return false;
  const { word, chunks } = value;
  return isText(word) && Array.isArray(chunks) && chunks.length >= 1 && chunks.length <= 12 && chunks.every((c) => isText(c));
}

export function isTutorAnswer(value: unknown): value is TutorAnswer {
  if (!isObject(value)) return false;
  if (Object.keys(value).some((key) => !ALLOWED_KEYS.has(key))) return false;

  if (typeof value.action !== 'string' || !ACTIONS.includes(value.action)) return false;
  if (typeof value.layer_diagnosis !== 'string' || !LAYERS.includes(value.layer_diagnosis)) return false;
  if (!isText(value.prompt_to_child, 1000)) return false;
  if (!Array.isArray(value.focus_words) || value.focus_words.length > 20 || !value.focus_words.every(isFocusWord)) return false;

  if (value.math_diagnosis !== undefined && !isStrings(value.math_diagnosis, ['where_wrong', 'gap', 'method'])) return false;
  if (value.target_text !== undefined && !isText(value.target_text, 2000)) return false;
  if (value.problem_kind !== undefined && !(typeof value.problem_kind === 'string' && PROBLEM_KINDS.includes(value.problem_kind))) return false;
  if (value.notes_for_parent !== undefined && typeof value.notes_for_parent !== 'string') return false;
  if (value.teaching_method !== undefined && typeof value.teaching_method !== 'string') return false;
  const recommendations = value.recommendations_for_parent;
  if (recommendations !== undefined) {
    if (!Array.isArray(recommendations) || recommendations.length > 10) return false;
    if (!recommendations.every((r) => isStrings(r, ['what', 'why', 'where']))) return false;
  }
  return true;
}

function isReadingResultOf(value: unknown): value is ReadingResult {
  return (
    isObject(value) &&
    typeof value.engine === 'string' &&
    Array.isArray(value.words) &&
    typeof value.accuracy === 'number' &&
    typeof value.seconds === 'number'
  );
}

/**
 * The scorers' results an answer echoes: each engine that scored (an engine that failed is `{error}` and is
 * dropped), nothing else. Undefined when no engine's result is there.
 */
export function pickReadingResult(value: unknown): TutorReadingResult | undefined {
  if (!isObject(value)) return undefined;
  const picked: TutorReadingResult = {};
  if (isReadingResultOf(value.azure)) picked.azure = value.azure;
  if (isReadingResultOf(value.local)) picked.local = value.local;
  return picked.azure || picked.local ? picked : undefined;
}

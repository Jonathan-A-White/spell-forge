// The word-list grind (grinds/word-list.json): what the mill is asked, and the shape of what
// comes back. isWordListAnswer matches grinds/word-list-answer-1.schema.json exactly; the unit
// test holds the two together.

export const WORD_LIST_GRIND = { app: 'spellforge', kind: 'word-list', v: '1' } as const;

export interface WordListAnswer {
  /** The words to practise, in reading order; empty when nothing was readable. */
  words: string[];
  /** 0..1, how sure the answer is overall. */
  confidence?: number;
  /** One plain sentence for the parent. */
  notes?: string;
}

const MAX_WORDS = 200;
const ALLOWED_KEYS = new Set(['words', 'confidence', 'notes']);

export function isWordListAnswer(value: unknown): value is WordListAnswer {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const answer = value as Record<string, unknown>;
  if (Object.keys(answer).some((key) => !ALLOWED_KEYS.has(key))) return false;

  const { words, confidence, notes } = answer;
  if (!Array.isArray(words) || words.length > MAX_WORDS) return false;
  if (!words.every((word) => typeof word === 'string' && word.length > 0)) return false;
  if (confidence !== undefined) {
    if (typeof confidence !== 'number' || !(confidence >= 0 && confidence <= 1)) return false;
  }
  if (notes !== undefined && typeof notes !== 'string') return false;
  return true;
}

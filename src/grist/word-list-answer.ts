// The word-list grind (grinds/word-list.json): what the mill is asked, and the shape of what
// comes back. isWordListAnswer matches grinds/word-list-answer-2.schema.json exactly, which is
// version 1's answer with an optional `placed` (each word's node on the spelling graph); the unit
// test holds the two together. The app asks version 2; an import sent as version 1 before is still read.

export const WORD_LIST_GRIND = { app: 'spellforge', kind: 'word-list', v: '2' } as const;

export interface WordListAnswer {
  /** The words to practise, in reading order; empty when nothing was readable. */
  words: string[];
  /** 0..1, how sure the answer is overall. */
  confidence?: number;
  /** One plain sentence for the parent. */
  notes?: string;
  /** Version 2: the node of the spelling graph each word practises (left out when none fits). */
  placed?: { word: string; node?: string }[];
}

const MAX_WORDS = 200;
const ALLOWED_KEYS = new Set(['words', 'confidence', 'notes', 'placed']);

function isPlaced(entry: unknown): boolean {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false;
  const placed = entry as Record<string, unknown>;
  if (Object.keys(placed).some((key) => key !== 'word' && key !== 'node')) return false;
  return typeof placed.word === 'string' && placed.word.length > 0 && (placed.node === undefined || (typeof placed.node === 'string' && placed.node.length > 0));
}

export function isWordListAnswer(value: unknown): value is WordListAnswer {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const answer = value as Record<string, unknown>;
  if (Object.keys(answer).some((key) => !ALLOWED_KEYS.has(key))) return false;

  const { words, confidence, notes, placed } = answer;
  if (!Array.isArray(words) || words.length > MAX_WORDS) return false;
  if (!words.every((word) => typeof word === 'string' && word.length > 0)) return false;
  if (confidence !== undefined) {
    if (typeof confidence !== 'number' || !(confidence >= 0 && confidence <= 1)) return false;
  }
  if (notes !== undefined && typeof notes !== 'string') return false;
  if (placed !== undefined && (!Array.isArray(placed) || placed.length > MAX_WORDS || !placed.every(isPlaced))) return false;
  return true;
}

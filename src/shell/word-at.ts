// src/shell/word-at.ts: the word under a finger, and the language the page names for it. The caret API says which text
// node and offset a point is on, Intl.Segmenter widens that to the word. Pure of React; HearAnyWord.tsx is what uses it.

/** How long a finger must stay on a word to say it, and how far it may wander meanwhile. */
export const LONG_PRESS_MS = 500;
export const LONG_PRESS_SLOP_PX = 10;

/** How far outside a word's box a finger may be and still be on it (a thin line of type is hard to hit). */
const REACH_PX = 6;

export interface WordHit {
  word: string;
  /** an app language code ('en', 'es'), from the nearest lang attribute above the word */
  language: string;
  /** the word's letters in the page, for marking them while they are spoken */
  range: Range;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });

/** The word of `text` that `offset` is in or at the end of, as [start, end), or null when it falls on a space or a mark. */
export function wordSpan(text: string, offset: number): [number, number] | null {
  let before: [number, number] | null = null;
  for (const s of segmenter.segment(text)) {
    const end = s.index + s.segment.length;
    if (!s.isWordLike) continue;
    if (offset >= s.index && offset < end) return [s.index, end];
    if (offset === end) before = [s.index, end];
  }
  return before;
}

/** The language a node is written in: the primary subtag of the nearest lang attribute above it, else the page's, else English. */
export function languageAround(node: Node): string {
  const element = node instanceof Element ? node : node.parentElement;
  const tag = element?.closest('[lang]')?.getAttribute('lang') || document.documentElement.lang || 'en';
  return tag.toLowerCase().split(/[-_]/)[0] || 'en';
}

interface CaretDocument {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
}

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as unknown as CaretDocument;
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

/** Whether the point is on one of the range's boxes (the caret API answers with the nearest letter, even for a point on empty space). Without layout (jsdom) there is nothing to check. */
function onRange(range: Range, x: number, y: number): boolean {
  if (typeof range.getClientRects !== 'function') return true;
  const rects = Array.from(range.getClientRects());
  if (rects.length === 0) return true;
  return rects.some((r) => x >= r.left - REACH_PX && x <= r.right + REACH_PX && y >= r.top - REACH_PX && y <= r.bottom + REACH_PX);
}

/** The word at (x, y) inside `within`, or null when the point is not on a word written in Latin letters. */
export function wordAtPoint(x: number, y: number, within: Element): WordHit | null {
  const caret = caretAt(x, y);
  if (!caret || caret.node.nodeType !== Node.TEXT_NODE || !within.contains(caret.node)) return null;
  const text = caret.node.nodeValue ?? '';
  const span = wordSpan(text, caret.offset);
  if (!span) return null;
  const word = text.slice(span[0], span[1]);
  if (!/\p{Script=Latin}/u.test(word)) return null;
  const range = document.createRange();
  range.setStart(caret.node, span[0]);
  range.setEnd(caret.node, span[1]);
  return onRange(range, x, y) ? { word, language: languageAround(caret.node), range } : null;
}

// src/learn/maths/items.ts — The shape of a maths node and its items, and the local check of an answer; data and pure code, no screen
// (see docs/maths-graph.md).

import type { GraphNode } from 'learn-kit/graph';

/** The grade bands, youngest first. A band's index in this list is the level of the nodes in it. */
export const GRADE_BANDS = ['preK', 'K', '1-2', '3-5', '6-8', '9-12'] as const;

export type GradeBand = (typeof GRADE_BANDS)[number];

/** The graph level of a grade band: 0 for preK up to 5 for 9-12. A node may not need a node of a higher level. */
export function bandLevel(band: GradeBand): number {
  return GRADE_BANDS.indexOf(band);
}

/** The fewest items a node may have: enough to ask the child a few different problems before it is called solid. */
export const MIN_ITEMS = 3;

/** How many items a node lists unless it says otherwise; `item(index)` makes more. */
const DEFAULT_ITEM_COUNT = 5;

/** How many of a node's generated items `nodeProblems` looks at. */
const CHECKED_ITEMS = 12;

/** One question's worth of a node: a problem, its answer for checking here, and a hint that is not the answer. */
export interface MathsItem {
  /** What the child is asked, in words a child of the band knows. */
  problem: string;
  /** The answer, bare (`12`, `3/4`, `3:2`, `0.3`, or a word): `checkAnswer` reads this and what the child gives the same way. */
  answer: string;
  /** A nudge that leads to the answer without saying it. */
  hint: string;
}

/** The rule for a node to count as solid: `right` of the child's last `of` tries right. */
export interface SolidRule {
  right: number;
  of: number;
}

/** A node of the maths graph: a learn-kit GraphNode with what the maths subject adds to it. */
export interface MathsNode extends GraphNode {
  /** A level is always set: the band's. */
  level: number;
  band: GradeBand;
  /** What the child is called solid on. */
  solid: SolidRule;
  /** The first few items, at least MIN_ITEMS of them. */
  items: readonly MathsItem[];
  /** The item at this index, the same every time: the generator that `items` is the start of. */
  item: (index: number) => MathsItem;
  /** One line the child reads, in words a child of the band knows. */
  name: string;
}

/** The item of a node at an index. Any whole number from 0 up gives an item, and the same one every time. */
export function itemAt(node: MathsNode, index: number): MathsItem {
  return node.item(index);
}

// ─── Checking an answer ───────────────────────────────────

type Parsed =
  | { kind: 'value'; n: number; d: number }
  | { kind: 'ratio'; n: number; d: number }
  | { kind: 'text'; text: string };

const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
];

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

function reduced(kind: 'value' | 'ratio', n: number, d: number): Parsed {
  const g = gcd(n, d) || 1;
  return { kind, n: n / g, d: d / g };
}

/** What a child says or types, read as a number, a fraction, a ratio or plain words. */
function parse(raw: string): Parsed {
  const text = raw
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/, '')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/\s+/g, ' ');
  const word = NUMBER_WORDS.indexOf(text);
  if (word >= 0) return { kind: 'value', n: word, d: 1 };
  if (/^-?\d+$/.test(text)) return { kind: 'value', n: Number(text), d: 1 };
  const decimal = /^(-?)(\d*)\.(\d+)$/.exec(text);
  if (decimal) return reduced('value', Number(`${decimal[1]}${decimal[2]}${decimal[3]}`), 10 ** decimal[3].length);
  const fraction = /^(-?\d+) ?\/ ?(\d+)$/.exec(text);
  if (fraction && Number(fraction[2]) !== 0) return reduced('value', Number(fraction[1]), Number(fraction[2]));
  const ratio = /^(\d+) ?(?::|to) ?(\d+)$/.exec(text);
  if (ratio && Number(ratio[2]) !== 0) return reduced('ratio', Number(ratio[1]), Number(ratio[2]));
  return { kind: 'text', text };
}

/**
 * Is this what the item asks for? Numbers, fractions and ratios are compared by value ("2/4" is "1/2", "0.5" is "1/2", "3 to 2" is
 * "3:2", "1,500" is "1500", "five" is "5"); a ratio is never a fraction; anything else compares as words, without case or spaces at the ends.
 */
export function checkAnswer(item: MathsItem, given: string): boolean {
  const want = parse(item.answer);
  const got = parse(given);
  if (want.kind === 'text' || got.kind === 'text') return want.kind === 'text' && got.kind === 'text' && got.text !== '' && want.text === got.text;
  return want.kind === got.kind && want.n === got.n && want.d === got.d;
}

/** An answer that `checkAnswer` refuses for this item: the right one made a little wrong. */
export function wrongAnswerFor(item: MathsItem): string {
  const answer = parse(item.answer);
  if (answer.kind === 'text') return `${answer.text}x`;
  if (answer.kind === 'ratio') return `${answer.n + 1}:${answer.d}`;
  return answer.d === 1 ? String(answer.n + 1) : `${answer.n + answer.d}/${answer.d}`;
}

/** Does the hint say the answer? Any word or number in it that checks as the answer does. */
function hintSaysAnswer(item: MathsItem): boolean {
  const tokens = item.hint.toLowerCase().match(/[a-z0-9]+(?:[/:.,][a-z0-9]+)*/g) ?? [];
  return tokens.some((token) => checkAnswer(item, token));
}

// ─── Checking a node ──────────────────────────────────────

function itemProblems(id: string, item: MathsItem): string[] {
  const problems: string[] = [];
  if (item.problem.trim() === '') problems.push(`${id}: an item has no problem`);
  if (item.answer.trim() === '') problems.push(`${id}: ${item.problem} has no answer`);
  else if (!checkAnswer(item, item.answer)) problems.push(`${id}: ${item.problem} does not accept its own answer ${item.answer}`);
  else if (checkAnswer(item, wrongAnswerFor(item))) problems.push(`${id}: ${item.problem} accepts a wrong answer`);
  if (item.hint.trim() === '') problems.push(`${id}: ${item.problem} has no hint`);
  else if (item.hint.trim() === item.answer.trim() || checkAnswer(item, item.hint)) {
    problems.push(`${id}: hint ${JSON.stringify(item.hint)} is the answer`);
  } else if (hintSaysAnswer(item)) problems.push(`${id}: hint ${JSON.stringify(item.hint)} gives the answer ${item.answer}`);
  return problems;
}

/** What is wrong with a node, each problem naming it. None for a node ready for the graph. */
export function nodeProblems(node: MathsNode): string[] {
  const problems: string[] = [];
  if (node.items.length < MIN_ITEMS) problems.push(`${node.id}: needs at least ${MIN_ITEMS} items, has ${node.items.length}`);
  if (node.name.trim() === '') problems.push(`${node.id}: no child-facing name`);
  if (!(node.solid.right >= 1 && node.solid.of >= node.solid.right)) {
    problems.push(`${node.id}: solid rule ${node.solid.right} of ${node.solid.of} is not 1 or more right in at least as many tries`);
  }
  if (node.level !== bandLevel(node.band)) problems.push(`${node.id}: level ${node.level} is not band ${node.band}'s ${bandLevel(node.band)}`);
  const generated = Array.from({ length: CHECKED_ITEMS }, (_, i) => node.item(i));
  for (const item of [...node.items, ...generated]) problems.push(...itemProblems(node.id, item));
  if (new Set(node.items.map((i) => i.problem)).size < node.items.length) problems.push(`${node.id}: asks the same problem twice`);
  return [...new Set(problems)];
}

/** A node of a band, with the band's level, tags and solid rule filled in. `item(i)` makes the i-th item as [problem, answer, hint]. */
export function mathsNode(spec: {
  id: string;
  band: GradeBand;
  name: string;
  needs?: readonly string[];
  item: (index: number) => readonly [problem: string, answer: string, hint: string];
  /** How many items to list on the node (the start of what `item` makes). */
  count?: number;
  solid?: SolidRule;
}): MathsNode {
  const item = (index: number): MathsItem => {
    const [problem, answer, hint] = spec.item(index);
    return { problem, answer, hint };
  };
  return {
    id: spec.id,
    needs: spec.needs ?? [],
    level: bandLevel(spec.band),
    tags: ['maths', spec.band],
    band: spec.band,
    solid: spec.solid ?? DEFAULT_SOLID[spec.band],
    items: Array.from({ length: spec.count ?? DEFAULT_ITEM_COUNT }, (_, i) => item(i)),
    item,
    name: spec.name,
  };
}

/** The rule a band's nodes use unless one names its own: a little easier for the youngest, who tire sooner. */
const DEFAULT_SOLID: Record<GradeBand, SolidRule> = {
  preK: { right: 3, of: 4 },
  K: { right: 4, of: 5 },
  '1-2': { right: 4, of: 5 },
  '3-5': { right: 4, of: 5 },
  '6-8': { right: 4, of: 5 },
  '9-12': { right: 4, of: 5 },
};

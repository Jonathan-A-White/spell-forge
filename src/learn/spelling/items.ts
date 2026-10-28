// src/learn/spelling/items.ts — The shape of a spelling node and its items; data and pure code, no screen (see docs/spelling-graph.md).

import type { GraphNode } from 'learn-kit/graph';

/** The grade bands, youngest first. A band's index in this list is the level of the nodes in it. */
export const GRADE_BANDS = ['preK', 'K', '1-2', '3-5', '6-8', '9-12'] as const;

export type GradeBand = (typeof GRADE_BANDS)[number];

/** The graph level of a grade band: 0 for preK up to 5 for 9-12. A node may not need a node of a higher level. */
export function bandLevel(band: GradeBand): number {
  return GRADE_BANDS.indexOf(band);
}

/** The spelling strategies a child is taught beside the patterns, so that spelling is not rote memory: each is a way to work a word out. */
export const STRATEGY_KINDS = ['syllables', 'roots-affixes', 'analogy', 'mnemonic', 'visual-check'] as const;

export type StrategyKind = (typeof STRATEGY_KINDS)[number];

/** The fewest items a node may have: enough to ask the child a few different ways before it is called solid. */
export const MIN_ITEMS = 3;

/** One question's worth of a node: a word, the pattern it shows, and a wrong choice to put beside it. */
export interface SpellingItem {
  /** The word, lower case. */
  word: string;
  /** The pattern the node teaches that the word shows: a grapheme (`sh`, `a`), or `a_e` for a letter, any consonant, then e. */
  pattern: string;
  /** A wrong choice to put beside the word (a plausible misspelling, or for a letter sound a word that begins otherwise); it does not show the pattern. A word the mill wrote has none (''): only the placement picks between two spellings, and it uses a node's own words. */
  distractor: string;
  /** Set on a word the mill wrote (grinds/spelling-items.json): one plain sentence that uses it, never a spelling hint. A node's own words have none. */
  sentence?: string;
}

/** The rule for a node to count as solid: `right` of the child's last `of` tries right. */
export interface SolidRule {
  right: number;
  of: number;
}

/** A node of the spelling graph: a learn-kit GraphNode with what the spelling subject adds to it. */
export interface SpellingNode extends GraphNode {
  /** A level is always set: the band's. */
  level: number;
  band: GradeBand;
  /** What the child is called solid on. */
  solid: SolidRule;
  /** At least MIN_ITEMS of them. */
  items: readonly SpellingItem[];
  /** One line the child reads, in words a child of the band knows. */
  name: string;
  /** The entries of src/core/phonics/patterns.ts this node is built from (none for the letter sounds). */
  patternIds: readonly string[];
  /** Set on a strategy node (nodes-strategies.ts): the way of working a word out that it teaches. A pattern node has none. */
  strategy?: StrategyKind;
}

/** The key a word is kept under in the child's seen ledger (learn-kit/fresh): the word itself. */
export function wordKey(item: Pick<SpellingItem, 'word'>): string {
  return item.word;
}

/**
 * `count` different words of a node from a place in its list that the seed picks, the same for the same seed. The words the child has not seen (not
 * in `avoid`, the node's seen ledger) come first; when they run out, the seen words follow from the same place, as before there was a ledger, so
 * a pattern whose words are all seen still serves its words and a child never waits.
 */
export function pickWords(node: Pick<SpellingNode, 'items'>, ask: { count: number; seed: number; avoid?: readonly string[] }): SpellingItem[] {
  const seen = new Set(ask.avoid ?? []);
  const first = ask.seed % node.items.length;
  const around = Array.from({ length: node.items.length }, (_, i) => node.items[(first + i) % node.items.length]);
  const ordered = [...around.filter((item) => !seen.has(wordKey(item))), ...around.filter((item) => seen.has(wordKey(item)))];
  return ordered.slice(0, Math.min(ask.count, node.items.length));
}

/** Does this word show this pattern? A pattern with `_` (`a_e`) is its two ends around one consonant (`cake`); any other is found in the word. */
export function itemShowsPattern(word: string, pattern: string): boolean {
  const split = pattern.split('_');
  if (split.length === 2) return new RegExp(`${split[0]}[^aeiou]${split[1]}`).test(word);
  return word.includes(pattern);
}

/** What is wrong with a node, each problem naming it. None for a node ready for the graph. */
export function nodeProblems(node: SpellingNode): string[] {
  const problems: string[] = [];
  if (node.items.length < MIN_ITEMS) problems.push(`${node.id}: needs at least ${MIN_ITEMS} items, has ${node.items.length}`);
  if (node.name.trim() === '') problems.push(`${node.id}: no child-facing name`);
  if (!(node.solid.right >= 1 && node.solid.of >= node.solid.right)) {
    problems.push(`${node.id}: solid rule ${node.solid.right} of ${node.solid.of} is not 1 or more right in at least as many tries`);
  }
  if (node.level !== bandLevel(node.band)) problems.push(`${node.id}: level ${node.level} is not band ${node.band}'s ${bandLevel(node.band)}`);
  for (const item of node.items) {
    if (item.distractor === item.word) problems.push(`${node.id}: ${item.word} is its own distractor`);
    if (!itemShowsPattern(item.word, item.pattern)) problems.push(`${node.id}: ${item.word} does not show ${item.pattern}`);
    if (itemShowsPattern(item.distractor, item.pattern)) problems.push(`${node.id}: distractor ${item.distractor} shows ${item.pattern}`);
  }
  return problems;
}

/** A node of a band, with the band's level, tags and solid rule filled in. `items` are [word, pattern, distractor]. */
export function spellingNode(spec: {
  id: string;
  band: GradeBand;
  name: string;
  needs?: readonly string[];
  patternIds?: readonly string[];
  strategy?: StrategyKind;
  items: readonly (readonly [word: string, pattern: string, distractor: string])[];
  solid?: SolidRule;
}): SpellingNode {
  return {
    id: spec.id,
    needs: spec.needs ?? [],
    level: bandLevel(spec.band),
    tags: spec.strategy ? ['spelling', spec.band, 'strategy', spec.strategy] : ['spelling', spec.band],
    band: spec.band,
    solid: spec.solid ?? DEFAULT_SOLID[spec.band],
    items: spec.items.map(([word, pattern, distractor]) => ({ word, pattern, distractor })),
    name: spec.name,
    patternIds: spec.patternIds ?? [],
    ...(spec.strategy ? { strategy: spec.strategy } : {}),
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

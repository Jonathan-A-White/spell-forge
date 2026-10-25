// src/learn/spelling/place-words.ts — Puts the words of a word list on the spelling graph (mw-79en7t.16). The factory reads the photo of a list and
// names, for each word, the node of the graph it practises (the nodes went out in the request: requestNodes). A node id the graph does not have, or
// none at all, falls back to the pattern match here, and the reason is kept so a grown-up can see why a word sits where it does.
// Data and pure code: nothing here touches the network, the screen or the database.

import type { Graph } from 'learn-kit/graph';
import { spellingGraph } from './graph.ts';
import { itemShowsPattern, type SpellingNode } from './items.ts';

/** What the word-list answer says of one word: its text, and the node id it named (null for "none fits", absent for a version 1 answer). */
export interface WordClaim {
  word: string;
  node?: string | null;
}

/** Where one word of a list sits on the graph. */
export interface PlacedWord {
  /** The word, lower case; a word listed twice is placed once. */
  word: string;
  /** The node it practises, or null when neither the factory nor the pattern match found one. */
  nodeId: string | null;
  /** Who placed it: the factory's answer, the pattern match, or neither. */
  source: 'grist' | 'pattern' | 'none';
  /** Why the factory's answer was not used: set when `source` is not 'grist'. */
  reason?: string;
}

/** A node as the word-list request tells it to the factory: enough to pick the node a word practises. */
export interface RequestNode {
  id: string;
  name: string;
  patterns: string[];
}

/** The nodes the factory may name: every node that teaches a spelling pattern (the strategy nodes teach a way of working, not a pattern). */
function patternNodes(nodes: readonly SpellingNode[]): SpellingNode[] {
  return nodes.filter((node) => !node.strategy);
}

const patternsOf = (node: SpellingNode): string[] => [...new Set(node.items.map((item) => item.pattern))];

/** The nodes for the request's `nodes`, each with the patterns its words show. */
export function requestNodes(graph: Graph<SpellingNode> = spellingGraph as Graph<SpellingNode>): RequestNode[] {
  return patternNodes(graph.nodes).map((node) => ({ id: node.id, name: node.name, patterns: patternsOf(node) }));
}

/** A pattern worth matching on: two letters or more, or the `a_e` shape. A lone letter is in nearly every word and says nothing. */
const usable = (pattern: string): boolean => pattern.includes('_') || pattern.length >= 2;

/** The node a word practises by its pattern: a node that holds the word itself, else the longest pattern the word shows (the higher band on a tie). */
export function matchPattern(word: string, nodes: readonly SpellingNode[] = (spellingGraph as Graph<SpellingNode>).nodes): { nodeId: string; pattern: string } | null {
  const text = word.trim().toLowerCase();
  const candidates = patternNodes(nodes);
  const holder = candidates.find((node) => node.items.some((item) => item.word === text));
  if (holder) {
    const item = holder.items.find((i) => i.word === text) as SpellingNode['items'][number];
    return { nodeId: holder.id, pattern: item.pattern };
  }
  let best: { nodeId: string; pattern: string; size: number; level: number } | null = null;
  for (const node of candidates) {
    for (const pattern of patternsOf(node)) {
      if (!usable(pattern) || !itemShowsPattern(text, pattern)) continue;
      const size = pattern.replace('_', '').length;
      if (!best || size > best.size || (size === best.size && node.level > best.level)) best = { nodeId: node.id, pattern, size, level: node.level };
    }
  }
  return best ? { nodeId: best.nodeId, pattern: best.pattern } : null;
}

/** Places each word on the graph, in the order given: the node the answer names if the graph has it, else the pattern match, with the reason kept. */
export function placeWords(claims: readonly WordClaim[], graph: Graph<SpellingNode> = spellingGraph as Graph<SpellingNode>): PlacedWord[] {
  const nodes = graph.nodes;
  const seen = new Set<string>();
  const placed: PlacedWord[] = [];
  for (const claim of claims) {
    const word = claim.word.trim().toLowerCase();
    if (word === '' || seen.has(word)) continue;
    seen.add(word);

    if (typeof claim.node === 'string' && graph.byId.has(claim.node)) {
      placed.push({ word, nodeId: claim.node, source: 'grist' });
      continue;
    }
    const why =
      typeof claim.node === 'string'
        ? `the graph has no node ${claim.node}`
        : claim.node === null
          ? 'the factory found no node for it'
          : 'the factory named no node for it';
    const found = matchPattern(word, nodes);
    placed.push(
      found
        ? { word, nodeId: found.nodeId, source: 'pattern', reason: `${why}; placed by the pattern ${found.pattern}` }
        : { word, nodeId: null, source: 'none', reason: `${why}, and no pattern of the graph shows in the word` },
    );
  }
  return placed;
}

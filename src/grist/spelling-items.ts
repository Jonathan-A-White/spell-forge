// src/grist/spelling-items.ts — The spelling-items grind (grinds/spelling-items.json): when a child has met every word of a spelling pattern, the
// mill is asked, ahead of the need and in the background, for a few more that fit it, each with one plain sentence that uses it. Nothing here
// waits on it: the ask resolves to the words that passed the check, or to none when it cannot ask (offline, no licence, no key, a failed
// grist), and learn-kit/fresh's stock (src/learn/fresh-store.ts) keeps them. The mill is never believed: each word is placed on the node by
// place-words again, and a seen word, an example, a duplicate or a sentence that hints at the spelling is dropped.
// isSpellingItemsAnswer matches grinds/spelling-items.answer.schema.json and the request matches its request schema; the unit test holds them together.

import { PrivateKey } from '@bsv/sdk';
import type { Graph } from 'learn-kit/graph';
import { patterns } from '../core/phonics/patterns';
import { bsvWalletRepo } from '../data/repositories';
import { itemShowsPattern, placeWords, spellingGraph, type GradeBand, type SpellingItem, type SpellingNode } from '../learn/spelling';
import { gateGrind } from '../shell/licence-gate';
import { readAnswer, sendGrist } from './factory';
import { TUTOR_POLL_INTERVAL_MS } from './in-flight';

export const SPELLING_ITEMS_GRIND = { app: 'spellforge', kind: 'spelling-items', v: '1' } as const;

/** How long the mill has to write the words: nobody waits for them. */
export const SPELLING_ITEMS_DEADLINE_MS = 120_000;
/** The request's limits (grinds/spelling-items.request.schema.json). */
export const MAX_EXAMPLES = 6;
export const MAX_SEEN = 40;
export const MAX_COUNT = 6;
/** A node with this many words or more still unseen needs no new ones: the ask-ahead waits until they fall under it. PROVISIONAL. */
export const UNSEEN_FLOOR = 2;

const MAX_RULE = 400;
const MAX_WORD = 20;
const MAX_SENTENCE = 160;

/** grinds/spelling-items.request.schema.json */
export interface SpellingItemsRequest {
  schemaVersion: '1';
  nodeId: string;
  name: string;
  rule: string;
  examples: string[];
  seen: string[];
  count: number;
  ageBand: GradeBand;
}

/** grinds/spelling-items.answer.schema.json */
export interface SpellingItemsAnswer {
  words: { word: string; sentence: string }[];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The app's own check of an answer's shape (run before any word is looked at): exactly `words`, each with exactly `word` and `sentence`. */
export function isSpellingItemsAnswer(value: unknown): value is SpellingItemsAnswer {
  if (!isObject(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== 'words' || !Array.isArray(value.words) || value.words.length > MAX_COUNT) return false;
  return value.words.every((entry) => {
    if (!isObject(entry)) return false;
    const entryKeys = Object.keys(entry);
    return (
      entryKeys.length === 2 &&
      typeof entry.word === 'string' &&
      entry.word.length > 0 &&
      entry.word.length <= MAX_WORD &&
      typeof entry.sentence === 'string' &&
      entry.sentence.length > 0 &&
      entry.sentence.length <= MAX_SENTENCE
    );
  });
}

/** A pattern's rule in plain words: the hints of the phonics patterns the node is built from, else its name (the letter sounds have none). */
function ruleOf(node: SpellingNode): string {
  const hints = [...new Set(node.patternIds.map((id) => patterns.find((p) => p.id === id)?.hint).filter((hint): hint is string => !!hint))];
  return (hints.length > 0 ? hints.join(' ') : node.name).slice(0, MAX_RULE);
}

/** What the mill is asked: the node, its rule in words, some of its own words, the words to avoid and how many to write. */
export function spellingItemsRequest(node: SpellingNode, ask: { count: number; avoid: readonly string[] }): SpellingItemsRequest {
  return {
    schemaVersion: '1',
    nodeId: node.id,
    name: node.name,
    rule: ruleOf(node),
    examples: node.items.slice(0, MAX_EXAMPLES).map((item) => item.word),
    seen: [...new Set(ask.avoid)].slice(-MAX_SEEN),
    count: Math.max(1, Math.min(Math.round(ask.count), MAX_COUNT)),
    ageBand: node.band,
  };
}

const patternsOf = (node: SpellingNode): string[] => [...new Set(node.items.map((item) => item.pattern))];

/** A sentence that tells the child how the word is spelt, or which letters it has, is a hint at the answer: never kept. */
const HINT = /\b(spell|spelt|spelled|spelling|letters?)\b/i;

/**
 * The words of an answer that this node can keep, in the answer's order, at most `limit`. A word is dropped when it is not one plain word of lower-case
 * letters, when it is one of `avoid` (the words he has seen and those already kept), a word of the node itself or a duplicate, when place-words does not
 * place it on the node (a word its pattern match gives to another node belongs there; a letter sound's lone letter cannot be matched, so a word that
 * place-words places on no node and that shows the letter is kept), or when its sentence does not use it or hints at its spelling.
 */
export function checkFreshWords(node: SpellingNode, answer: SpellingItemsAnswer, avoid: readonly string[], limit: number = MAX_COUNT, graph: Graph<SpellingNode> = spellingGraph as Graph<SpellingNode>): SpellingItem[] {
  const skip = new Set([...avoid, ...node.items.map((item) => item.word)]);
  const own = patternsOf(node);
  const kept: SpellingItem[] = [];
  for (const entry of answer.words) {
    if (kept.length >= limit) break;
    const word = entry.word.trim().toLowerCase();
    const sentence = entry.sentence.trim();
    if (!/^[a-z]{2,20}$/.test(word) || skip.has(word)) continue;
    if (!sentence.toLowerCase().includes(word) || HINT.test(sentence)) continue;
    const shown = own.find((pattern) => itemShowsPattern(word, pattern));
    const placed = placeWords([{ word }], graph)[0];
    if (!(placed.nodeId === node.id || (placed.nodeId === null && shown !== undefined))) continue;
    skip.add(word);
    kept.push({ word, pattern: shown ?? own[0], distractor: '', sentence });
  }
  return kept;
}

/** The seams; each defaults to the real thing, tests replace them. `mill` is the grind: it resolves with the answer's JSON. */
export interface SpellingAskDeps {
  mill?: (request: SpellingItemsRequest) => Promise<unknown>;
  online?: () => boolean;
  graph?: Graph<SpellingNode>;
}

const isOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false;

/** The real grind: sends the request with the device key and reads the answer until the deadline. */
async function askMill(request: SpellingItemsRequest): Promise<unknown> {
  const wallet = await bsvWalletRepo.getCurrent();
  if (!wallet) throw new Error('no wallet yet, so no key to ask with');
  const key = PrivateKey.fromWif(wallet.material);
  const sent = await sendGrist({ key, input: request, header: { ...SPELLING_ITEMS_GRIND } });
  const until = Date.now() + SPELLING_ITEMS_DEADLINE_MS;
  let since = sent.seq;
  while (Date.now() < until) {
    const read = await readAnswer({ key, txid: sent.txid, mill: sent.mill, since, isAnswer: isSpellingItemsAnswer });
    since = read.next;
    if (!('pending' in read)) {
      if (read.answer.status === 'answered') return read.answer.answer;
      throw new Error(read.answer.reason);
    }
    await new Promise((resolve) => setTimeout(resolve, TUTOR_POLL_INTERVAL_MS));
  }
  throw new Error('the mill took too long to write the words');
}

/**
 * The ask for learn-kit/fresh's stock: for a node, up to `count` words that passed the check. It resolves to none, and sends nothing, when the node still has
 * UNSEEN_FLOOR words or more he has not seen (`avoid` holds the words he has seen), when offline, with no licence (the gate of licence-gate.ts), when the
 * node was already asked in this sitting (one grist for a node at most, the cost of the ask-ahead), and, after sending, when the grist fails or its answer is
 * not words. A rejection never leaves it: the stock stays as it was.
 */
export function createSpellingAsk(deps: SpellingAskDeps = {}): (idea: string, ask: { count: number; avoid: string[] }) => Promise<SpellingItem[]> {
  const graph = deps.graph ?? (spellingGraph as Graph<SpellingNode>);
  const mill = deps.mill ?? askMill;
  const online = deps.online ?? isOnline;
  const sitting = new Set<string>();
  return async (idea, ask) => {
    const node = graph.byId.get(idea);
    if (!node || node.strategy) return [];
    const seen = new Set(ask.avoid);
    if (node.items.filter((item) => !seen.has(item.word)).length >= UNSEEN_FLOOR) return [];
    if (!online() || !gateGrind().allowed || sitting.has(idea)) return [];
    sitting.add(idea);
    try {
      const answer = await mill(spellingItemsRequest(node, ask));
      return isSpellingItemsAnswer(answer) ? checkFreshWords(node, answer, ask.avoid, ask.count, graph) : [];
    } catch {
      return [];
    }
  };
}

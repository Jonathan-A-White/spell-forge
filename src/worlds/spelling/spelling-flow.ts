// src/worlds/spelling/spelling-flow.ts — The spelling world's flow (Kestrel 15c). On the first entry a placement (learn-kit/drill's, a bisection
// over the spelling graph's grade bands) finds where the child is: each question is one word of a node asked as a pick between its spelling and
// a distractor, and what he passed is written as solid. After it, each sitting is a plan of the frontier's nodes and the reviews that are due
// (planDrill), and each node is handed to one of the games of drill-forms.ts (15a) with some of its own words. A game ends with `correct` of
// `total` words; each word is a try, and a node is solid when its own rule holds over its last tries (`right` of `of`, 4 of 5 for most), and
// then it leaves the frontier. A round with every word right is the review's right answer, so a solid node comes back when its review is due.
// A word list read from a photo has placed its words on the graph (mw-79en7t.16): the nodes the list's words practise (`focus`) are asked before the
// frontier, one round each, until they are solid.
// Nothing here touches the network or the screen: SpellingWorld.tsx draws what this returns.
import { answerPlacement, applyPlacement, createForms, placementItem, planDrill, startPlacementFromStore, type DrillItem, type ItemMaker, type PlacementState } from 'learn-kit/drill';
import { review, setLevel, type Graph, type GraphStore } from 'learn-kit/graph';
import { spellingGraph, type SolidRule, type SpellingItem, type SpellingNode } from '../../learn/spelling';
import { DRILL_FORM_IDS, drillForms, gameItems, type DrillFormId } from './drill-forms';
import type { SpellingKept, SpellingKeep } from './spelling-store';

export { memoryKeep, storageGraphStore, storageKeep } from './spelling-store';
export type { SpellingKept, SpellingKeep } from './spelling-store';

/** The form a placement question is put in: the word spoken, and two spellings to pick between. */
export const PICK_FORM = 'pick-spelling';

/** The registry of the placement's one form; the drill's are drill-forms.ts's. */
const pickForms = createForms([{ id: PICK_FORM, render: 'pick the right spelling of the word you hear' }]);

/** The words of a node a game is given: MIN_ITEMS, so every node has that many different ones. */
export const ROUND_WORDS = 3;

/** Why a node is being asked: the placement, a node of the child's word list, a node at the frontier, or a review that is due. */
export type SpellingStage = 'placement' | 'list' | 'frontier' | 'due';

/** One turn for the child, and everything the screen needs to draw it: a placement pick (one item) or a game round (several). */
export interface SpellingTurn {
  /** Tells this turn from another of the same node. */
  key: string;
  stage: SpellingStage;
  nodeId: string;
  /** The node's name, in the words a child of its band knows. */
  nodeName: string;
  /** PICK_FORM for the placement, else one of the game forms of drill-forms.ts. */
  form: string;
  /** The word asked (placement), or the words of the round (a game). */
  items: SpellingItem[];
}

/** How a turn went: the words right of the words asked, the same for a pick and for every game. The turn's own words are the total: a game's count past them is cut. */
export interface SpellingResult {
  correct: number;
  total: number;
}

export interface SpellingAnswer {
  correct: number;
  total: number;
  /** Whether it counted as a right review: every word right. */
  counted: boolean;
  nodeId: string;
  stage: SpellingStage;
  /** Whether the node is solid now. */
  solid: boolean;
  /** The placement ended with this answer (finished, or paused at its question limit): what follows is the frontier. */
  placementOver: boolean;
}

export interface SpellingFlow {
  /** The turn to take now (the same one until it is answered), or null when there is nothing to ask until a review comes due. */
  question(): Promise<SpellingTurn | null>;
  /** How the turn being taken went. */
  answer(result: SpellingResult): Promise<SpellingAnswer>;
}

export interface SpellingFlowDeps {
  store: GraphStore;
  keep: SpellingKeep;
  graph?: Graph<SpellingNode>;
  /** The clock: Date.now when absent. */
  now?: () => number;
  /** Seeds the items a sitting picks; the clock's second when absent. */
  seed?: number;
  /** The ids of the nodes the child's word list practises, in the list's order: asked first, until solid. A node the graph does not have is skipped. */
  focus?: () => Promise<readonly string[]>;
  /** The games a sitting rotates its nodes through: all seven of drill-forms.ts when absent. */
  forms?: readonly DrillFormId[];
}

/** Is the node solid by its rule: `right` of its last `of` tries right? Fewer tries than `of` are held to the same `right`. */
export function triesSolid(tries: readonly boolean[], rule: SolidRule): boolean {
  return tries.slice(-rule.of).filter(Boolean).length >= rule.right;
}

const sum = (text: string): number => [...text].reduce((total, ch) => total + ch.charCodeAt(0), 0);

/** `count` different words of a node, from a place in its list that the seed picks. */
function wordsOf(node: SpellingNode, count: number, seed: number): SpellingItem[] {
  const first = seed % node.items.length;
  return Array.from({ length: Math.min(count, node.items.length) }, (_, i) => node.items[(first + i) % node.items.length]);
}

/** The placement's item maker: one word of the node, the seed picks which. */
const makePick: ItemMaker<SpellingItem> = (node, ask) =>
  wordsOf(node as SpellingNode, ask.count, ask.seed).map((item) => ({ key: `${node.id}:${item.word}`, form: PICK_FORM, payload: item }));

interface Queued {
  role: Exclude<SpellingStage, 'placement'>;
  nodeId: string;
  items: DrillItem<SpellingItem>[];
}

export function createSpellingFlow(deps: SpellingFlowDeps): SpellingFlow {
  const { store, keep } = deps;
  const graph = (deps.graph ?? spellingGraph) as Graph<SpellingNode>;
  const now = deps.now ?? Date.now;
  const seedOf = (): number => deps.seed ?? Math.floor(now() / 1000);
  const rotation = deps.forms && deps.forms.length > 0 ? deps.forms : DRILL_FORM_IDS;

  /** The drill's item maker: a round of the node's words, all in one game form, one form after another across the nodes. */
  const makeRound: ItemMaker<SpellingItem> = (node, ask) => {
    const form = rotation[(ask.seed + sum(node.id)) % rotation.length];
    return gameItems(node.id, form, wordsOf(node as SpellingNode, ask.count, ask.seed));
  };

  let kept: SpellingKept | undefined;
  let current: SpellingTurn | null = null;
  let queue: Queued[] = [];
  let sittings = 0;
  let lastPlacementKey: string | undefined;

  // question() and answer() are taken one at a time: a screen that asks twice at once gets the one question
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task);
    chain = run.then(() => undefined, () => undefined);
    return run;
  };

  const load = async (): Promise<SpellingKept> => (kept ??= await keep.load());
  const save = async (next: SpellingKept): Promise<void> => {
    kept = next;
    await keep.save(next);
  };

  const turnOf = (stage: SpellingStage, nodeId: string, items: DrillItem<SpellingItem>[]): SpellingTurn => ({
    key: items[0].key,
    stage,
    nodeId,
    nodeName: (graph.byId.get(nodeId) as SpellingNode).name,
    form: items[0].form,
    items: items.map((i) => i.payload),
  });

  async function placementTurn(state: PlacementState): Promise<SpellingTurn | null> {
    const made = await placementItem(graph, state, makePick, pickForms, lastPlacementKey ? { key: lastPlacementKey, form: PICK_FORM, payload: null } : undefined);
    if (!made) return null;
    lastPlacementKey = made.key;
    return turnOf('placement', state.current as string, [{ ...made, nodeId: state.current as string }]);
  }

  /** Writes what a placement found, and keeps its state (done, finished or paused). */
  async function endPlacement(state: PlacementState, kept0: SpellingKept): Promise<void> {
    await applyPlacement(store, graph, state, now());
    await save({ ...kept0, placement: state });
  }

  /** A round for each node of the child's list that is not solid yet, in the list's order. */
  async function listRounds(seed: number): Promise<Queued[]> {
    const ids = [...new Set((await deps.focus?.()) ?? [])];
    const rounds: Queued[] = [];
    for (const nodeId of ids) {
      const node = graph.byId.get(nodeId);
      if (!node || (await store.get(nodeId))?.level === 'solid') continue;
      const items = (await makeRound(node, { count: ROUND_WORDS, seed })).map((item) => ({ ...item, nodeId }));
      if (items.length > 0) rounds.push({ role: 'list', nodeId, items });
    }
    return rounds;
  }

  async function nextTurn(): Promise<SpellingTurn | null> {
    const k = await load();
    if (k.placement === null) {
      const started = await startPlacementFromStore(graph, store, { seed: seedOf() });
      if (started.done !== null) await endPlacement(started, k);
      else await save({ ...k, placement: started });
    }
    const placement = (await load()).placement as PlacementState;
    if (placement.done === null) return placementTurn(placement);

    for (let planned = 0; planned < 2; planned += 1) {
      while (queue.length > 0) {
        const next = queue.shift() as Queued;
        const level = (await store.get(next.nodeId))?.level;
        if (next.role !== 'due' && level === 'solid') continue; // made solid by this sitting: no more of it
        return turnOf(next.role, next.nodeId, next.items);
      }
      const plan = await planDrill<SpellingItem>({
        graph,
        store,
        forms: drillForms,
        make: makeRound,
        itemsPerNode: ROUND_WORDS,
        seed: seedOf() + sittings * 131,
        now: now(),
      });
      sittings += 1;
      const listed = await listRounds(seedOf() + (sittings - 1) * 131);
      const taken = new Set(listed.map((q) => q.nodeId));
      queue = [...listed, ...plan.entries.filter((e) => e.items.length > 0 && !taken.has(e.nodeId)).map((e) => ({ role: e.role, nodeId: e.nodeId, items: e.items }))];
    }
    return null;
  }

  async function placementAnswered(counted: boolean): Promise<boolean> {
    const k = await load();
    const state = answerPlacement(graph, k.placement as PlacementState, counted);
    if (state.done !== null) {
      await endPlacement(state, k);
      return true;
    }
    await save({ ...k, placement: state });
    return false;
  }

  async function answerDrill(turn: SpellingTurn, correct: number, total: number): Promise<boolean> {
    const node = graph.byId.get(turn.nodeId) as SpellingNode;
    const k = await load();
    // the words missed go in first, so a round's rights are its latest tries
    const words = [...Array<boolean>(total - correct).fill(false), ...Array<boolean>(correct).fill(true)];
    const tries = [...(k.tries[node.id] ?? []), ...words].slice(-node.solid.of);
    await save({ ...k, tries: { ...k.tries, [node.id]: tries } });
    await review(store, graph, node.id, correct === total, now());
    if (triesSolid(tries, node.solid) && (await store.get(node.id))?.level !== 'solid') {
      await setLevel(store, graph, node.id, 'solid', 'drill', now());
    }
    return (await store.get(node.id))?.level === 'solid';
  }

  return {
    question: () =>
      serial(async () => {
        current ??= await nextTurn();
        return current;
      }),
    answer: (result) =>
      serial(async () => {
        current ??= await nextTurn();
        const turn = current;
        if (!turn) throw new Error('There is no turn to answer');
        const total = turn.items.length;
        const correct = Math.max(0, Math.min(Math.round(result.correct), total));
        const counted = correct === total;
        current = null;
        const placing = turn.stage === 'placement';
        const placementOver = placing ? await placementAnswered(counted) : false;
        const solid = placing ? false : await answerDrill(turn, correct, total);
        return { correct, total, counted, nodeId: turn.nodeId, stage: turn.stage, solid, placementOver };
      }),
  };
}

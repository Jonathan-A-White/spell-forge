// src/worlds/maths/maths-flow.ts — The maths world's flow (Kestrel 19a). On the first entry a placement (learn-kit/drill's, a bisection over the
// maths graph's levels) finds where the child is and writes what he passed as solid; after it, each sitting is a plan of the frontier's nodes
// and the reviews that are due (planDrill), two items a node. The answer is checked here, on the phone, against the item (checkAnswer): a right
// answer without a hint is a counted try, and a node is solid when its own rule holds over its last tries (`right` of `of`, 4 of 5 for most).
// A wrong answer, or a right one after a hint, is a try that did not count. The kit's review schedule is kept beside it, so a solid node comes
// back when its review is due. Nothing here touches the network or the screen: MathsWorld.tsx draws what this returns.
import { createForms, answerPlacement, applyPlacement, placementItem, planDrill, startPlacementFromStore, type DrillItem, type Forms, type ItemMaker, type PlacementState } from 'learn-kit/drill';
import { review, setLevel, type Graph, type GraphStore } from 'learn-kit/graph';
import { checkAnswer, mathsGraph, type MathsItem, type MathsNode, type SolidRule } from '../../learn/maths';
import type { MathsKept, MathsKeep } from './maths-store';

export { memoryKeep, storageGraphStore, storageKeep } from './maths-store';
export type { MathsKept, MathsKeep } from './maths-store';

/** The form every item of this story is put in: a problem and a box for the answer. The hear, see and do forms (19b) register beside it. */
export const TYPE_FORM = 'type';

/** The registry of the maths drill forms. Its render contract is the world's to read: 19a has the one. */
export const mathsForms: Forms<{ name: string }> = createForms([{ id: TYPE_FORM, render: { name: 'type an answer' } }]);

/** How far into a node's generator the seeds reach: the same index always gives the same item, so this only bounds the variety. */
const ITEM_SPAN = 200;

/** The item maker for the kit: a node's items, `count` of them from a place in its generator that the seed picks. */
const makeItems: ItemMaker<MathsItem> = (node, ask) => {
  const maths = node as MathsNode;
  const first = ask.seed % ITEM_SPAN;
  return Array.from({ length: ask.count }, (_, i) => ({
    key: `${maths.id}:${first + i}`,
    form: TYPE_FORM,
    payload: maths.item(first + i),
  }));
};

/** Why a node is being asked: the placement, a node at the frontier, or a review that is due. */
export type MathsStage = 'placement' | 'frontier' | 'due';

/** One question for the child, and everything the screen needs to draw it. */
export interface MathsQuestion {
  /** Tells this question from another of the same node. */
  key: string;
  stage: MathsStage;
  nodeId: string;
  /** The node's name, in the words a child of its band knows. */
  nodeName: string;
  form: string;
  item: MathsItem;
}

export interface MathsAnswer {
  /** What the item's check made of it, on the phone. */
  right: boolean;
  /** Whether it counted toward solid: right, and without a hint. */
  counted: boolean;
  nodeId: string;
  stage: MathsStage;
  /** Whether the node is solid now. */
  solid: boolean;
  /** The placement ended with this answer (finished, or paused at its question limit): what follows is the frontier. */
  placementOver: boolean;
}

export interface MathsFlow {
  /** The question to ask now (the same one until it is answered), or null when there is nothing to ask until a review comes due. */
  question(): Promise<MathsQuestion | null>;
  /** The child's answer to the question being asked, checked here. */
  answer(given: string, options?: { hinted?: boolean }): Promise<MathsAnswer>;
}

export interface MathsFlowDeps {
  store: GraphStore;
  keep: MathsKeep;
  graph?: Graph<MathsNode>;
  /** The clock: Date.now when absent. */
  now?: () => number;
  /** Seeds the items a sitting picks; the clock's second when absent. */
  seed?: number;
}

/** Is the node solid by its rule: `right` of its last `of` tries counted? Fewer tries than `of` are held to the same `right`. */
export function triesSolid(tries: readonly boolean[], rule: SolidRule): boolean {
  return tries.slice(-rule.of).filter(Boolean).length >= rule.right;
}

interface Queued {
  role: 'frontier' | 'due';
  entry: DrillItem<MathsItem>;
}

export function createMathsFlow(deps: MathsFlowDeps): MathsFlow {
  const { store, keep } = deps;
  const graph = (deps.graph ?? mathsGraph) as Graph<MathsNode>;
  const now = deps.now ?? Date.now;
  const seedOf = (): number => deps.seed ?? Math.floor(now() / 1000);

  let kept: MathsKept | undefined;
  let current: MathsQuestion | null = null;
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

  const load = async (): Promise<MathsKept> => (kept ??= await keep.load());
  const save = async (next: MathsKept): Promise<void> => {
    kept = next;
    await keep.save(next);
  };

  const questionOf = (stage: MathsStage, key: string, item: MathsItem, nodeId: string): MathsQuestion => ({
    key,
    stage,
    nodeId,
    nodeName: (graph.byId.get(nodeId) as MathsNode).name,
    form: TYPE_FORM,
    item,
  });

  async function placementQuestion(state: PlacementState): Promise<MathsQuestion | null> {
    const made = await placementItem(graph, state, makeItems, mathsForms, lastPlacementKey ? { key: lastPlacementKey, form: TYPE_FORM, payload: null } : undefined);
    if (!made) return null;
    lastPlacementKey = made.key;
    return questionOf('placement', made.key, made.payload as MathsItem, state.current as string);
  }

  /** Writes what a placement found, and keeps its state (done, finished or paused). */
  async function endPlacement(state: PlacementState, kept0: MathsKept): Promise<void> {
    await applyPlacement(store, graph, state, now());
    await save({ ...kept0, placement: state });
  }

  async function nextQuestion(): Promise<MathsQuestion | null> {
    const k = await load();
    if (k.placement === null) {
      const started = await startPlacementFromStore(graph, store, { seed: seedOf() });
      if (started.done !== null) await endPlacement(started, k);
      else await save({ ...k, placement: started });
    }
    const placement = (await load()).placement as PlacementState;
    if (placement.done === null) return placementQuestion(placement);

    for (let planned = 0; planned < 2; planned += 1) {
      while (queue.length > 0) {
        const next = queue.shift() as Queued;
        const level = (await store.get(next.entry.nodeId))?.level;
        if (next.role === 'frontier' && level === 'solid') continue; // made solid by this sitting: no more of it
        return questionOf(next.role, next.entry.key, next.entry.payload, next.entry.nodeId);
      }
      const plan = await planDrill<MathsItem>({ graph, store, forms: mathsForms, make: makeItems, seed: seedOf() + sittings * 131, now: now() });
      sittings += 1;
      queue = plan.entries.flatMap((e) => e.items.map((entry) => ({ role: e.role, entry })));
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

  async function answerDrill(question: MathsQuestion, counted: boolean): Promise<boolean> {
    const node = graph.byId.get(question.nodeId) as MathsNode;
    const k = await load();
    const tries = [...(k.tries[node.id] ?? []), counted].slice(-node.solid.of);
    await save({ ...k, tries: { ...k.tries, [node.id]: tries } });
    await review(store, graph, node.id, counted, now());
    if (triesSolid(tries, node.solid) && (await store.get(node.id))?.level !== 'solid') {
      await setLevel(store, graph, node.id, 'solid', 'drill', now());
    }
    return (await store.get(node.id))?.level === 'solid';
  }

  return {
    question: () =>
      serial(async () => {
        current ??= await nextQuestion();
        return current;
      }),
    answer: (given, options) =>
      serial(async () => {
        current ??= await nextQuestion();
        const question = current;
        if (!question) throw new Error('There is no question to answer');
        const right = checkAnswer(question.item, given);
        const counted = right && !options?.hinted;
        current = null;
        const placing = question.stage === 'placement';
        const placementOver = placing ? await placementAnswered(counted) : false;
        const solid = placing ? false : await answerDrill(question, counted);
        return { right, counted, nodeId: question.nodeId, stage: question.stage, solid, placementOver };
      }),
  };
}

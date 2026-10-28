// src/worlds/maths/maths-flow.ts — The maths world's flow (Kestrel 19a). On the first entry a placement (learn-kit/drill's, a bisection over the
// maths graph's levels) finds where the child is and writes what he passed as solid; after it, each sitting is a plan of the frontier's nodes
// and the reviews that are due (planDrill), two items a node. The answer is checked here, on the phone, against the item (checkAnswer): a right
// answer without a hint is a counted try, and a node is solid when its own rule holds over its last tries (`right` of `of`, 4 of 5 for most).
// A wrong answer, or a right one after a hint, is a try that did not count. The kit's review schedule is kept beside it, so a solid node comes
// back when its review is due. A problem is proved on a problem he has not seen (Kestrel 20a, learn-kit/fresh): each problem asked is noted in the
// child's seen ledger under its node (src/learn/fresh-store.ts), the maker makes problems outside it, a problem answered wrong is put to him once
// more, and a right answer on a problem he has seen after a miss marks the node to confirm and counts for nothing: the node goes solid only when
// a fresh problem's right answer is counted (docs/maths-graph.md). Nothing here touches the network or the screen: MathsWorld.tsx draws what this returns.
import { createForms, answerPlacement, applyPlacement, placementItem, planDrill, startPlacementFromStore, type DrillItem, type Forms, type ItemMaker, type PlacementState } from 'learn-kit/drill';
import { MemoryFreshStore, markAsked, recordAnswer, type FreshStore, type Verdict } from 'learn-kit/fresh';
import { review, setLevel, type Graph, type GraphStore } from 'learn-kit/graph';
import { missedLast } from '../../learn/fresh-store';
import { checkAnswer, makeProblems, mathsGraph, problemKey, type MathsItem, type MathsNode, type SolidRule } from '../../learn/maths';
import type { MathsKept, MathsKeep } from './maths-store';

export { memoryKeep, storageGraphStore, storageKeep } from './maths-store';
export type { MathsKept, MathsKeep } from './maths-store';

/** The form every item of this story is put in: a problem and a box for the answer. The hear, see and do forms (19b) register beside it. */
export const TYPE_FORM = 'type';

/** The registry of the maths drill forms. Its render contract is the world's to read: 19a has the one. */
export const mathsForms: Forms<{ name: string }> = createForms([{ id: TYPE_FORM, render: { name: 'type an answer' } }]);

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
  /** The problem put to him a second time, after he got it wrong. */
  repeat?: boolean;
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
  /** What learn-kit/fresh made of it: 'known' (a fresh problem right: it counts), 'to-confirm' (a problem he had seen, right after a miss), 'seen', or 'missed'. A placement question has none. */
  verdict?: Verdict;
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
  /** The child's seen ledger (src/learn/fresh-store.ts); one in memory, lasting as long as the flow, when absent. */
  fresh?: FreshStore;
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
  /** The second asking of a problem he got wrong. */
  repeat?: boolean;
}

export function createMathsFlow(deps: MathsFlowDeps): MathsFlow {
  const { store, keep } = deps;
  const fresh = deps.fresh ?? new MemoryFreshStore();
  const graph = (deps.graph ?? mathsGraph) as Graph<MathsNode>;
  const now = deps.now ?? Date.now;
  const seedOf = (): number => deps.seed ?? Math.floor(now() / 1000);

  /**
   * The item maker for the kit: a node's problems, `count` of them from a place in its generator that the seed picks, outside the node's seen
   * ledger. A node whose generator has no problem left that he has not seen (a few nodes make only a handful) starts its ledger over, so that it
   * can be proved at all.
   */
  const makeItems: ItemMaker<MathsItem> = async (node, ask) => {
    const maths = node as MathsNode;
    const avoid = ask.avoid ?? [...(await fresh.getAsked(maths.id))];
    let made = makeProblems(maths, { count: ask.count, seed: ask.seed, avoid });
    if (avoid.length > 0 && !made.some((m) => m.fresh)) {
      await fresh.putAsked(maths.id, []);
      made = makeProblems(maths, { count: ask.count, seed: ask.seed });
    }
    return made.map(({ index, item }) => ({ key: `${maths.id}:${index}`, form: TYPE_FORM, payload: item }));
  };

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

  const questionOf = (stage: MathsStage, key: string, item: MathsItem, nodeId: string, repeat?: boolean): MathsQuestion => ({
    key,
    stage,
    nodeId,
    nodeName: (graph.byId.get(nodeId) as MathsNode).name,
    form: TYPE_FORM,
    item,
    ...(repeat ? { repeat } : {}),
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
        return questionOf(next.role, next.entry.key, next.entry.payload, next.entry.nodeId, next.repeat);
      }
      const plan = await planDrill<MathsItem>({ graph, store, forms: mathsForms, make: makeItems, fresh, seed: seedOf() + sittings * 131, now: now() });
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

  /**
   * Grades a drill answer through learn-kit/fresh's recordAnswer, with `missedBefore` read from the node's review row. A right answer without a
   * hint on a fresh problem is 'known': the one try that counts, and the node can go solid on it. A right on a problem he has seen is 'to-confirm'
   * after a miss (the node is marked, nothing advances) and 'seen' otherwise (nothing counts, but a solid node whose review is due is answered).
   * A wrong answer, or a right one after a hint, is a try that did not count and returns the node to its due reviews. A problem answered wrong is
   * put to him once more at the front of the sitting, now that he has read the nudge.
   */
  async function answerDrill(question: MathsQuestion, right: boolean, hinted: boolean): Promise<Verdict> {
    const node = graph.byId.get(question.nodeId) as MathsNode;
    const key = problemKey(question.item);
    const missedBefore = missedLast(await store.get(node.id));
    let verdict: Verdict;
    if (right && hinted) {
      await markAsked(fresh, node.id, key);
      verdict = 'missed';
    } else {
      verdict = await recordAnswer(fresh, node.id, key, right, { missedBefore });
    }
    const wasSolid = (await store.get(node.id))?.level === 'solid';
    if (verdict === 'missed' || verdict === 'known') {
      const k = await load();
      const tries = [...(k.tries[node.id] ?? []), verdict === 'known'].slice(-node.solid.of);
      await save({ ...k, tries: { ...k.tries, [node.id]: tries } });
      await review(store, graph, node.id, verdict === 'known', now());
      if (verdict === 'known' && triesSolid(tries, node.solid) && (await store.get(node.id))?.level !== 'solid') {
        await setLevel(store, graph, node.id, 'solid', 'drill', now());
      }
    } else if (verdict === 'seen' && wasSolid) {
      await review(store, graph, node.id, true, now());
    }
    if (!right && !hinted && !question.repeat && question.stage !== 'placement') {
      queue.unshift({ role: question.stage, entry: { key: question.key, form: question.form, payload: question.item, nodeId: node.id }, repeat: true });
    }
    return verdict;
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
        if (placing) await markAsked(fresh, question.nodeId, problemKey(question.item));
        const verdict = placing ? undefined : await answerDrill(question, right, !counted && right);
        const solid = placing ? false : (await store.get(question.nodeId))?.level === 'solid';
        return { right, counted, nodeId: question.nodeId, stage: question.stage, solid, ...(verdict ? { verdict } : {}), placementOver };
      }),
  };
}

// The placement over the spelling graph (mw-79en7t.44): learn-kit's placement from learn-kit/drill walks the graph with a scripted 8th grader who
// spells everything but the vowel-team and suffix nodes, and puts the frontier there. The items asked are the nodes' own (word beside distractor).
import { below, frontier, learning, memoryStore, solidOf } from 'learn-kit/graph';
import {
  ANSWERS_PER_NODE,
  answerPlacement,
  applyPlacement,
  createForms,
  currentNode,
  placementItem,
  placementResult,
  resumePlacement,
  startPlacement,
  type ItemMaker,
  type PlacementState,
} from 'learn-kit/drill';
import { describe, expect, it } from 'vitest';
import { SPELLING_NODES, spellingGraph, type SpellingNode } from '../../src/learn/spelling';

const NOW = Date.UTC(2026, 9, 24, 9, 0, 0);

/** The spelling question: the node's word beside its distractor, the child picks the right spelling. */
const forms = createForms([{ id: 'pick-spelling', render: 'choose the right spelling of the word' }]);
interface Pick {
  word: string;
  distractor: string;
}
const makeItems: ItemMaker<Pick> = (node, { count, seed }) => {
  const items = (node as SpellingNode).items;
  return Array.from({ length: count }, (_, i) => {
    const item = items[(seed + i) % items.length];
    return { key: `${node.id}:${item.word}`, form: 'pick-spelling', payload: { word: item.word, distractor: item.distractor } };
  });
};

/** The nodes he cannot spell: the vowel-team and suffix nodes, and so every node that stands on one (a word that needs a suffix cannot be spelt without it). */
const gapNode = (id: string): boolean => id.startsWith('vowel-team-') || id.startsWith('suffix-');
const missed = (id: string): boolean => gapNode(id) || below(spellingGraph, id).some((n) => gapNode(n.id));

/** The 8th grader: gets every node right but those, where he picks the wrong spelling. */
const eighthGrader = (nodeId: string, pick: Pick): boolean => (missed(nodeId) ? pick.distractor : pick.word) === pick.word;

async function sit(): Promise<{ state: PlacementState; asked: string[]; sittings: number }> {
  let state = startPlacement(spellingGraph, []);
  const asked: string[] = [];
  let sittings = 1;
  for (let guard = 0; guard < 1000; guard += 1) {
    if (state.done === 'paused') {
      state = resumePlacement(state);
      sittings += 1;
    }
    const id = currentNode(state);
    if (id === null) break;
    const item = await placementItem(spellingGraph, state, makeItems, forms);
    asked.push(id);
    state = answerPlacement(spellingGraph, state, eighthGrader(id, item!.payload as Pick));
  }
  return { state, asked, sittings };
}

describe('placement over the spelling graph with a scripted 8th grader', () => {
  it('ends, and asks only nodes of the spelling graph, never one the learner was not due to be asked', async () => {
    const { state, asked } = await sit();
    expect(state.done).toBe('finished');
    const ids = new Set(SPELLING_NODES.map((n) => n.id));
    for (const id of asked) expect(ids.has(id), id).toBe(true);
    expect(asked.length).toBeLessThanOrEqual(ANSWERS_PER_NODE * ids.size);
  });

  it('finds the gap: every node he missed is a vowel-team or suffix node or stands on one, and nothing he spells is', async () => {
    const { state } = await sit();
    const result = placementResult(spellingGraph, state);
    const gap = [...result.frontier, ...result.notYet];
    expect(gap.length).toBeGreaterThan(0);
    for (const id of gap) expect(missed(id), `${id} was missed but is not a gap node`).toBe(true);
    // the nodes he spells are tested out, whichever grade band they sit in
    expect(result.testedOut.length).toBeGreaterThan(gap.length);
    for (const id of result.testedOut) expect(missed(id), `${id} is a gap node and was tested out`).toBe(false);
    expect(result.testedOut).toContain('short-vowel-a');
    expect(result.testedOut).toContain('digraph-sh');
    // the gap includes a vowel-team node and a suffix node
    expect(gap.some((id) => id.startsWith('vowel-team-'))).toBe(true);
    expect(gap.some((id) => id.startsWith('suffix-'))).toBe(true);
  });

  it('does not test out a node that rests on a missed one: it is asked only as a probe and missed, or left untested', async () => {
    const { state, asked } = await sit();
    const result = placementResult(spellingGraph, state);
    const resting = SPELLING_NODES.filter((n) => n.needs.some(missed));
    expect(resting.length).toBeGreaterThan(0);
    for (const node of resting) {
      expect(result.testedOut, `${node.id} rests on a missed node`).not.toContain(node.id);
      if (!asked.includes(node.id)) expect(result.untested, node.id).toContain(node.id);
    }
    // the strategy nodes rest on pattern nodes and are never tested out ahead of them
    for (const node of SPELLING_NODES.filter((n) => n.tags?.includes('strategy'))) {
      if (result.testedOut.includes(node.id)) for (const need of node.needs) expect(result.testedOut, `${node.id} needs ${need}`).toContain(need);
    }
  });

  it('applies the placement: the learner is learning a vowel-team or suffix node, the frontier is the gap, and what he spells is tested out', async () => {
    const { state } = await sit();
    const store = memoryStore();
    await applyPlacement(store, spellingGraph, state, NOW);
    const learningNow = await learning(store, spellingGraph);
    expect(learningNow).toHaveLength(1);
    expect(gapNode(learningNow[0].id), learningNow[0].id).toBe(true);
    const ready = (await frontier(store, spellingGraph)).map((n) => n.id);
    expect(ready).toContain(learningNow[0].id);
    // every gap node he can learn now (its needs are solid) is on the frontier; none is solid
    const result = placementResult(spellingGraph, state);
    const gapReady = [...result.frontier, ...result.notYet].filter((id) => spellingGraph.byId.get(id)!.needs.every((need) => result.testedOut.includes(need)));
    expect(gapReady.length).toBeGreaterThan(1);
    for (const id of gapReady) expect(ready, id).toContain(id);
    const solid = await solidOf(store, spellingGraph);
    for (const id of placementResult(spellingGraph, state).testedOut) expect(solid.has(id), id).toBe(true);
    for (const id of solid) expect(missed(id), id).toBe(false);
  });
});

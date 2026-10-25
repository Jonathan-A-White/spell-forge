// Kestrel 19a (mw-79en7t.57), AC1: the maths flow runs the placement on first entry, then the frontier and the due reviews through
// @learn-kit/drill over the maths graph; an answer is checked locally against the item (no network), a right one counts toward solid
// by the node's own rule and a wrong one does not.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAY, memoryStore, type GraphStore } from 'learn-kit/graph';
import { mathsGraph, wrongAnswerFor, type MathsNode } from '../../src/learn/maths';
import {
  createMathsFlow,
  memoryKeep,
  triesSolid,
  type MathsFlow,
  type MathsKeep,
  type MathsQuestion,
} from '../../src/worlds/maths/maths-flow';

const NOW = Date.UTC(2026, 9, 25, 9, 0, 0);
const levelOf = (id: string): number => (mathsGraph.byId.get(id) as MathsNode).level;
const nodeOf = (id: string): MathsNode => mathsGraph.byId.get(id) as MathsNode;

let store: GraphStore;
let keep: MathsKeep;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  store = memoryStore();
  keep = memoryKeep();
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function flowOver(over: Partial<Parameters<typeof createMathsFlow>[0]> = {}): MathsFlow {
  return createMathsFlow({ store, keep, now: () => NOW, seed: 7, ...over });
}

/** The right answer of a question, as the child would give it. */
const rightOf = (q: MathsQuestion): string => q.item.answer;

/** Plays the placement to its end with a child who knows every node of level `knows` or below. Returns the questions asked. */
async function placeChild(flow: MathsFlow, knows: number): Promise<MathsQuestion[]> {
  const asked: MathsQuestion[] = [];
  for (let q = await flow.question(); q && q.stage === 'placement'; q = await flow.question()) {
    asked.push(q);
    await flow.answer(levelOf(q.nodeId) <= knows ? rightOf(q) : wrongAnswerFor(q.item));
    expect(asked.length).toBeLessThan(40);
  }
  return asked;
}

describe('the placement, on first entry', () => {
  it('opens with a placement question about a node, with its problem and its hint but not asking for a network', async () => {
    const q = await flowOver().question();
    expect(q).not.toBeNull();
    expect(q!.stage).toBe('placement');
    expect(q!.item.problem).not.toBe('');
    expect(q!.nodeName).toBe(nodeOf(q!.nodeId).name);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('asks the same question until it is answered', async () => {
    const flow = flowOver();
    const first = await flow.question();
    expect((await flow.question())!.key).toBe(first!.key);
  });

  it('writes what the child passed as solid, and then moves on to the frontier', async () => {
    const flow = flowOver();
    const asked = await placeChild(flow, 1);
    expect(asked.length).toBeGreaterThan(0);

    const states = await store.entries();
    const solid = [...states].filter(([, s]) => s.level === 'solid').map(([id]) => id);
    expect(solid.length).toBeGreaterThan(0);
    expect(solid.every((id) => levelOf(id) <= 1)).toBe(true);
    // the placement is over: what follows is the frontier
    const next = await flow.question();
    expect(next!.stage).toBe('frontier');
    expect(states.get(next!.nodeId)?.level).not.toBe('solid');
    // and everything its node rests on is solid
    for (const need of nodeOf(next!.nodeId).needs) expect(states.get(need)?.level).toBe('solid');
  });

  it('a child who knows nothing is placed at the bottom: the frontier is a node that needs nothing', async () => {
    const flow = flowOver();
    await placeChild(flow, -1);
    const next = await flow.question();
    expect(next!.stage).toBe('frontier');
    expect(nodeOf(next!.nodeId).needs).toEqual([]);
    expect([...(await store.entries())].some(([, s]) => s.level === 'solid')).toBe(false);
  });

  it('is asked once: a flow made again over what was kept goes straight to the frontier', async () => {
    await placeChild(flowOver(), 1);
    const again = await flowOver().question();
    expect(again!.stage).toBe('frontier');
  });

  it('is picked up where it was left: a flow made again over a half-done placement asks the next question', async () => {
    const flow = flowOver();
    const first = await flow.question();
    await flow.answer(rightOf(first!));
    const again = await flowOver().question();
    expect(again!.stage).toBe('placement');
    expect(again!.key).not.toBe(first!.key);
  });

  it('does not ask what the store already holds solid', async () => {
    const solidAlready = mathsGraph.nodes.filter((n) => n.level === 0).map((n) => n.id);
    for (const id of solidAlready) await store.put(id, { level: 'solid', since: NOW, how: 'tested-out' });
    const asked = await placeChild(flowOver(), 99);
    expect(asked.some((q) => solidAlready.includes(q.nodeId))).toBe(false);
  });
});

describe('frontier drills, checked on the phone', () => {
  async function placedAtBottom(): Promise<MathsFlow> {
    const flow = flowOver();
    await placeChild(flow, -1);
    return flow;
  }

  it('a right answer is right by the item, whether it is a number word, a digit or a spelling the checker reads', async () => {
    const flow = await placedAtBottom();
    const q = (await flow.question())!;
    const result = await flow.answer(`  ${q.item.answer.toUpperCase()}  `);
    expect(result.right).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a right answer counts toward solid: the node is solid once it has the right count of its rule, and not before', async () => {
    const flow = await placedAtBottom();
    const first = (await flow.question())!;
    const node = nodeOf(first.nodeId);
    let rights = 0;
    // answer the node's questions right as they come; other nodes' questions are answered wrong so they stay out of the way
    for (let i = 0; i < 80 && (await store.get(node.id))?.level !== 'solid'; i++) {
      const q = (await flow.question())!;
      if (q.nodeId === node.id) {
        const before = (await store.get(node.id))?.level;
        const result = await flow.answer(rightOf(q));
        rights += 1;
        expect(result.right).toBe(true);
        expect(result.counted).toBe(true);
        if (rights < node.solid.right) expect(before).not.toBe('solid');
        expect(result.solid).toBe(rights >= node.solid.right);
      } else {
        await flow.answer(wrongAnswerFor(q.item));
      }
    }
    expect(rights).toBe(node.solid.right);
    expect((await store.get(node.id))?.level).toBe('solid');
  });

  it('a wrong answer does not count: the node stays unsolid however many are given', async () => {
    const flow = await placedAtBottom();
    const first = (await flow.question())!;
    const node = nodeOf(first.nodeId);
    let seen = 0;
    for (let i = 0; i < 60; i++) {
      const q = (await flow.question())!;
      const result = await flow.answer(wrongAnswerFor(q.item));
      expect(result.right).toBe(false);
      expect(result.counted).toBe(false);
      expect(result.solid).toBe(false);
      if (q.nodeId === node.id) seen += 1;
    }
    expect(seen).toBeGreaterThan(0);
    expect((await store.get(node.id))?.level).not.toBe('solid');
    expect([...(await store.entries())].some(([, s]) => s.level === 'solid')).toBe(false);
  });

  it('a right answer given with a hint is not counted', async () => {
    const flow = await placedAtBottom();
    const q = (await flow.question())!;
    const result = await flow.answer(rightOf(q), { hinted: true });
    expect(result.right).toBe(true);
    expect(result.counted).toBe(false);
  });

  it('keeps the tries, so a flow made again goes on from them', async () => {
    const flow = await placedAtBottom();
    const q = (await flow.question())!;
    await flow.answer(rightOf(q));
    expect((await keep.load()).tries[q.nodeId]).toEqual([true]);
    const again = flowOver();
    await again.answer(wrongAnswerFor((await again.question())!.item));
    expect(Object.values((await keep.load()).tries).flat()).toContain(false);
  });

  it('never calls the network', async () => {
    const flow = await placedAtBottom();
    for (let i = 0; i < 6; i++) await flow.answer(rightOf((await flow.question())!));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('due reviews', () => {
  it('comes back to a solid node when its review falls due', async () => {
    const flow = flowOver();
    await placeChild(flow, 1);
    const solid = [...(await store.entries())].filter(([, s]) => s.level === 'solid');
    expect(solid.length).toBeGreaterThan(0);

    const later = createMathsFlow({ store, keep, seed: 7, now: () => NOW + 31 * DAY });
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const q = (await later.question())!;
      seen.add(q.stage);
      await later.answer(rightOf(q));
    }
    expect(seen.has('due')).toBe(true);
  });
});

describe('triesSolid', () => {
  const rule = { right: 3, of: 4 };
  it('is solid when the last tries hold the rule', () => {
    expect(triesSolid([true, true, true], rule)).toBe(true);
    expect(triesSolid([false, true, true, true], rule)).toBe(true);
  });
  it('is not solid on too few rights, or too few tries', () => {
    expect(triesSolid([true, true], rule)).toBe(false);
    expect(triesSolid([true, false, false, true], rule)).toBe(false);
    expect(triesSolid([], rule)).toBe(false);
  });
  it('looks only at the last `of` tries', () => {
    expect(triesSolid([true, true, true, false, false, true], rule)).toBe(false);
  });
});

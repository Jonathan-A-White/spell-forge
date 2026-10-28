// Kestrel 15c (mw-79en7t.47), AC1: the spelling flow runs the placement on first entry, then the frontier and the due reviews through
// @learn-kit/drill over the spelling graph, each node handed to a game form (15a); a node goes solid when its rule is met and leaves the frontier.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFreshStore, asked, isToConfirm, type FreshStore } from 'learn-kit/fresh';
import { DAY, frontier, memoryStore, type GraphStore } from 'learn-kit/graph';
import { spellingGraph, type SpellingNode } from '../../src/learn/spelling';
import { drillForms } from '../../src/worlds/spelling/drill-forms';
import {
  PICK_FORM,
  createSpellingFlow,
  memoryKeep,
  triesSolid,
  type SpellingFlow,
  type SpellingKeep,
  type SpellingTurn,
} from '../../src/worlds/spelling/spelling-flow';

const NOW = Date.UTC(2026, 9, 25, 9, 0, 0);
const nodeOf = (id: string): SpellingNode => spellingGraph.byId.get(id) as SpellingNode;
const levelOf = (id: string): number => nodeOf(id).level;

let store: GraphStore;
let keep: SpellingKeep;
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

function flowOver(over: Partial<Parameters<typeof createSpellingFlow>[0]> = {}): SpellingFlow {
  return createSpellingFlow({ store, keep, now: () => NOW, seed: 7, ...over });
}

/** A round the child got all right, or none right. */
const allRight = (t: SpellingTurn) => ({ correct: t.items.length, total: t.items.length });
const noneRight = (t: SpellingTurn) => ({ correct: 0, total: t.items.length });

/** Plays the placement to its end with a child who spells every node of level `knows` or below. Returns the questions asked. */
async function placeChild(flow: SpellingFlow, knows: number): Promise<SpellingTurn[]> {
  const asked: SpellingTurn[] = [];
  for (let q = await flow.question(); q && q.stage === 'placement'; q = await flow.question()) {
    asked.push(q);
    await flow.answer(levelOf(q.nodeId) <= knows ? allRight(q) : noneRight(q));
    expect(asked.length).toBeLessThan(80);
  }
  return asked;
}

describe('the placement, on first entry', () => {
  it('opens with a placement question: one word of a node, asked as a pick between its spelling and the distractor, no network', async () => {
    const q = await flowOver().question();
    expect(q).not.toBeNull();
    expect(q!.stage).toBe('placement');
    expect(q!.form).toBe(PICK_FORM);
    expect(q!.items).toHaveLength(1);
    expect(nodeOf(q!.nodeId).items.map((i) => i.word)).toContain(q!.items[0].word);
    expect(q!.items[0].distractor).not.toBe(q!.items[0].word);
    expect(q!.nodeName).toBe(nodeOf(q!.nodeId).name);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('asks the same question until it is answered', async () => {
    const flow = flowOver();
    const first = await flow.question();
    expect((await flow.question())!.key).toBe(first!.key);
  });

  it('writes what the child spelt as solid, and then moves on to the frontier', async () => {
    const flow = flowOver();
    const asked = await placeChild(flow, 1);
    expect(asked.length).toBeGreaterThan(0);

    const states = await store.entries();
    const solid = [...states].filter(([, s]) => s.level === 'solid').map(([id]) => id);
    expect(solid.length).toBeGreaterThan(0);
    expect(solid.every((id) => levelOf(id) <= 1)).toBe(true);
    const next = await flow.question();
    expect(next!.stage).toBe('frontier');
    expect(states.get(next!.nodeId)?.level).not.toBe('solid');
    for (const need of nodeOf(next!.nodeId).needs) expect(states.get(need)?.level).toBe('solid');
  });

  it('is asked once: a flow made again over what was kept goes straight to the frontier', async () => {
    await placeChild(flowOver(), 1);
    const again = await flowOver().question();
    expect(again!.stage).toBe('frontier');
  });

  it('is picked up where it was left: a flow made again over a half-done placement asks the next question', async () => {
    const flow = flowOver();
    const first = (await flow.question())!;
    await flow.answer(allRight(first));
    const again = await flowOver().question();
    expect(again!.stage).toBe('placement');
    expect(again!.key).not.toBe(first.key);
  });
});

describe('frontier drills, through the game forms', () => {
  async function placedAtBottom(): Promise<SpellingFlow> {
    const flow = flowOver();
    await placeChild(flow, -1);
    return flow;
  }

  it('hands the frontier node to a game form with some of its own words, each registered in drill-forms', async () => {
    const flow = await placedAtBottom();
    const q = (await flow.question())!;
    expect(q.stage).toBe('frontier');
    expect(nodeOf(q.nodeId).needs).toEqual([]);
    expect(drillForms.has(q.form)).toBe(true);
    expect(q.items.length).toBeGreaterThanOrEqual(2);
    const words = nodeOf(q.nodeId).items.map((i) => i.word);
    for (const item of q.items) expect(words).toContain(item.word);
    expect(new Set(q.items.map((i) => i.word)).size).toBe(q.items.length);
  });

  it('a node goes solid once its rule is met, and not before, and then leaves the frontier', async () => {
    const flow = await placedAtBottom();
    const first = (await flow.question())!;
    const node = nodeOf(first.nodeId);
    expect((await frontier(store, spellingGraph)).map((n) => n.id)).toContain(node.id);

    let rights = 0;
    for (let i = 0; i < 60 && (await store.get(node.id))?.level !== 'solid'; i++) {
      const q = (await flow.question())!;
      if (q.nodeId !== node.id) {
        await flow.answer(noneRight(q)); // other nodes' rounds are missed so they stay out of the way
        continue;
      }
      const result = await flow.answer(allRight(q));
      rights += q.items.length;
      expect(result.counted).toBe(true);
      expect(result.solid).toBe(rights >= node.solid.right);
    }
    expect(rights).toBeGreaterThanOrEqual(node.solid.right);
    expect((await store.get(node.id))?.level).toBe('solid');
    expect((await frontier(store, spellingGraph)).map((n) => n.id)).not.toContain(node.id);

    // and it is not asked as a frontier node again
    for (let i = 0; i < 8; i++) {
      const q = (await flow.question())!;
      expect(q.stage === 'frontier' && q.nodeId === node.id).toBe(false);
      await flow.answer(noneRight(q));
    }
  });

  it('a missed round does not count: the node stays unsolid however many are given', async () => {
    const flow = await placedAtBottom();
    const first = (await flow.question())!;
    let seen = 0;
    for (let i = 0; i < 40; i++) {
      const q = (await flow.question())!;
      const result = await flow.answer(noneRight(q));
      expect(result.counted).toBe(false);
      expect(result.solid).toBe(false);
      if (q.nodeId === first.nodeId) seen += 1;
    }
    expect(seen).toBeGreaterThan(0);
    expect([...(await store.entries())].some(([, s]) => s.level === 'solid')).toBe(false);
  });

  it('each word is a try: two of three right keeps those tries, and is not a counted round', async () => {
    const flow = await placedAtBottom();
    const q = (await flow.question())!;
    const result = await flow.answer({ correct: 2, total: q.items.length });
    expect(result.counted).toBe(false);
    const tries = (await keep.load()).tries[q.nodeId];
    expect(tries.filter(Boolean)).toHaveLength(2);
    expect(tries).toHaveLength(q.items.length);
  });

  it('keeps the tries, so a flow made again goes on from them', async () => {
    const flow = await placedAtBottom();
    const q = (await flow.question())!;
    await flow.answer(allRight(q));
    expect((await keep.load()).tries[q.nodeId]).toEqual(q.items.map(() => true));
    const again = flowOver();
    await again.answer(noneRight((await again.question())!));
    expect(Object.values((await keep.load()).tries).flat()).toContain(false);
  });

  it('plays only the game forms it is given, in turn', async () => {
    const flow = flowOver({ forms: ['quiz'] });
    await placeChild(flow, -1);
    for (let i = 0; i < 6; i++) {
      const q = (await flow.question())!;
      expect(q.form).toBe('quiz');
      await flow.answer(noneRight(q));
    }
  });

  it('never calls the network', async () => {
    const flow = await placedAtBottom();
    for (let i = 0; i < 6; i++) await flow.answer(allRight((await flow.question())!));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// Kestrel 20a (mw-16yxp1k.1), AC2 and AC4: a node is proved on a word he has not seen (learn-kit/fresh). The games say how many words were right, not
// which; the rights go to the words he had seen first, so the count of fresh rights is the fewest it can be.
describe('proving on a fresh word', () => {
  const DGE = 'short-vowel-dge'; // edge, judge, bridge, badge: 4 of 5
  const WORDS = nodeOf(DGE).items.map((i) => i.word);
  let fresh: FreshStore;

  beforeEach(() => {
    fresh = new MemoryFreshStore();
  });

  async function onDge(seen: readonly string[] = []): Promise<SpellingFlow> {
    fresh = new MemoryFreshStore({ asked: [[DGE, seen]] });
    const flow = flowOver({ fresh, focus: async () => [DGE] });
    await placeChild(flow, -1);
    return flow;
  }

  /** The next turn at the pattern: other nodes' rounds are missed so they stay out of the way. */
  async function turnAtDge(flow: SpellingFlow): Promise<SpellingTurn> {
    for (let i = 0; i < 40; i += 1) {
      const q = (await flow.question())!;
      if (q.nodeId === DGE) return q;
      await flow.answer(noneRight(q));
    }
    throw new Error('no turn at the pattern');
  }

  it('marks every word asked under its node, the placement\'s too', async () => {
    const flow = flowOver({ fresh });
    const q = (await flow.question())!;
    await flow.answer(allRight(q));
    expect(await asked(fresh, q.nodeId)).toEqual([q.items[0].word]);
  });

  it('serves the unseen words of a node first, and the seen ones after', async () => {
    const flow = await onDge(['edge', 'judge']);
    const q = await turnAtDge(flow);
    expect(q.nodeId).toBe(DGE);
    expect(q.items.map((i) => i.word).slice(0, 2).sort()).toEqual(['badge', 'bridge']);
    expect(q.items).toHaveLength(3);
  });

  it('a miss, then a right on words he has seen, marks the node to confirm and does not go solid or count', async () => {
    const flow = await onDge(WORDS);
    const first = await turnAtDge(flow);
    expect((await flow.answer(noneRight(first))).verdict).toBe('missed');
    const again = await turnAtDge(flow);
    expect(again.nodeId).toBe(DGE);
    const result = await flow.answer(allRight(again));
    expect(result.counted).toBe(true);
    expect(result.verdict).toBe('to-confirm');
    expect(result.solid).toBe(false);
    expect(await isToConfirm(fresh, DGE)).toBe(true);
    expect((await keep.load()).tries[DGE]).toEqual([false, false, false]);
  });

  it('a pattern whose words are all seen is never solid on them, however well he spells them, and still serves its words', async () => {
    const flow = await onDge(WORDS);
    for (let i = 0; i < 12; i += 1) {
      const q = await turnAtDge(flow);
      expect(q.items.length).toBeGreaterThanOrEqual(2);
      const result = await flow.answer(allRight(q));
      expect(result.solid).toBe(false);
    }
    expect((await store.get(DGE))?.level).not.toBe('solid');
  });

  it('a fresh right goes solid: fresh words count, the seen ones in the same round do not', async () => {
    const flow = await onDge();
    const first = await turnAtDge(flow);
    const one = await flow.answer(allRight(first)); // three fresh words
    expect([one.verdict, one.solid]).toEqual(['known', false]);
    const second = await turnAtDge(flow);
    expect(second.items.filter((i) => !first.items.map((f) => f.word).includes(i.word))).toHaveLength(1); // the fourth word, then two seen
    const two = await flow.answer(allRight(second));
    expect([two.verdict, two.solid]).toEqual(['known', true]);
    expect((await keep.load()).tries[DGE]).toEqual([true, true, true, true]); // not six
    expect((await store.get(DGE))?.level).toBe('solid');
  });

  it('a fresh wrong returns the node to its due reviews, and takes the mark off', async () => {
    const flow = await onDge(['edge', 'judge', 'bridge']);
    await flow.answer(noneRight(await turnAtDge(flow))); // badge and two seen: a miss
    expect(await isToConfirm(fresh, DGE)).toBe(false);
    const again = await turnAtDge(flow);
    await flow.answer(allRight(again)); // all four seen now: to confirm
    expect(await isToConfirm(fresh, DGE)).toBe(true);
    const row = (await store.get(DGE))!.review!;
    expect([row.lapses, row.due]).toEqual([1, NOW + DAY]);

    // a fresh word wrong: two of three right goes to the seen words, so the fresh one is the wrong one
    fresh = new MemoryFreshStore({ asked: [[DGE, ['edge', 'judge']]], toConfirm: [DGE] });
    const other = flowOver({ fresh, focus: async () => [DGE] });
    const q = await turnAtDge(other);
    const result = await other.answer({ correct: 2, total: q.items.length });
    expect(result.verdict).toBe('missed');
    expect(await isToConfirm(fresh, DGE)).toBe(false);
    expect((await store.get(DGE))!.review!.lapses).toBe(2);
  });

  it('a right answer is paid as ever: counted is every word right, seen or not', async () => {
    const flow = await onDge(WORDS);
    const result = await flow.answer(allRight(await turnAtDge(flow)));
    expect([result.counted, result.correct, result.total]).toEqual([true, 3, 3]);
  });

  it('answers a solid node\'s review on seen words as a right review, so it does not come back at once', async () => {
    const flow = await onDge();
    for (let i = 0; i < 2; i += 1) await flow.answer(allRight(await turnAtDge(flow)));
    expect((await store.get(DGE))?.level).toBe('solid');
    const later = createSpellingFlow({ store, keep, fresh, seed: 7, now: () => NOW + 31 * DAY });
    let q = (await later.question())!;
    while (q.nodeId !== DGE) {
      await later.answer(noneRight(q));
      q = (await later.question())!;
    }
    expect(q.stage).toBe('due');
    const result = await later.answer(allRight(q));
    expect([result.verdict, result.solid]).toEqual(['seen', true]);
    expect((await store.get(DGE))!.review!.due).toBeGreaterThan(NOW + 31 * DAY + DAY);
  });
});

describe('due reviews', () => {
  it('comes back to a solid node when its review falls due', async () => {
    const flow = flowOver();
    await placeChild(flow, 1);
    const solid = [...(await store.entries())].filter(([, s]) => s.level === 'solid');
    expect(solid.length).toBeGreaterThan(0);

    const later = createSpellingFlow({ store, keep, seed: 7, now: () => NOW + 31 * DAY });
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const q = (await later.question())!;
      seen.add(q.stage);
      await later.answer(allRight(q));
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

// mw-79en7t.16: a word list read from a photo has placed its words on the graph; the drill takes those nodes first.
describe("the list's nodes, taken first", () => {
  const LIST = ['short-vowel-dge', 'vowel-team-igh'];

  async function placedWithList(focus: () => Promise<readonly string[]>): Promise<SpellingFlow> {
    const flow = flowOver({ focus });
    await placeChild(flow, -1);
    return flow;
  }

  it("asks the list's nodes before the frontier, in the list's order, as the list stage", async () => {
    const flow = await placedWithList(async () => LIST);
    const first = (await flow.question())!;
    expect([first.stage, first.nodeId]).toEqual(['list', LIST[0]]);
    await flow.answer(noneRight(first));
    const second = (await flow.question())!;
    expect([second.stage, second.nodeId]).toEqual(['list', LIST[1]]);
    await flow.answer(noneRight(second));
    expect((await flow.question())!.stage).not.toBe('list');
  });

  it('hands the node some of its own words in a game form of the drill', async () => {
    const flow = await placedWithList(async () => LIST);
    const q = (await flow.question())!;
    expect(q.nodeId).toBe(LIST[0]);
    expect(drillForms.has(q.form)).toBe(true);
    const words = nodeOf(q.nodeId).items.map((i) => i.word);
    for (const item of q.items) expect(words).toContain(item.word);
    expect(q.items.length).toBeGreaterThanOrEqual(2);
  });

  it('stops asking a list node once it is solid', async () => {
    const flow = await placedWithList(async () => ['short-vowel-dge']);
    let listRounds = 0;
    for (let i = 0; i < 40 && (await store.get('short-vowel-dge'))?.level !== 'solid'; i += 1) {
      const q = (await flow.question())!;
      if (q.stage === 'list') listRounds += 1;
      await flow.answer(allRight(q));
    }
    expect((await store.get('short-vowel-dge'))?.level).toBe('solid');
    expect(listRounds).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < 12; i += 1) {
      const q = await flow.question();
      if (!q) break;
      expect(q.stage === 'list').toBe(false);
      await flow.answer(allRight(q));
    }
  });

  it('skips a node the graph does not have, and asks nothing special of a list with no nodes', async () => {
    const flow = await placedWithList(async () => ['not-a-node']);
    expect((await flow.question())!.stage).toBe('frontier');
    const bare = await placedWithList(async () => []);
    expect((await bare.question())!.stage).toBe('frontier');
  });

  it('asks the placement first, whatever the list says', async () => {
    const flow = flowOver({ focus: async () => LIST });
    expect((await flow.question())!.stage).toBe('placement');
  });
});

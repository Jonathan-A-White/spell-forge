// Kestrel 20a (mw-16yxp1k.1), AC1 and AC3: the child's seen ledger over localStorage (learn-kit/fresh's FreshStore and StockStore), per subject and per
// child; the reading of a review row as "missed before"; and the two makers' avoid: a maths problem outside the seen keys, a spelling node's unseen
// words first.
import { beforeEach, describe, expect, it } from 'vitest';
import { LEDGER_CAP, asked, isFresh, isToConfirm, markAsked, recordAnswer, toConfirm } from 'learn-kit/fresh';
import { DAY, nextReview, startSchedule, type NodeState } from 'learn-kit/graph';
import { missedLast, storageFreshStore, storageStockStore } from '../../src/learn/fresh-store';
import { ITEM_SPAN, makeProblems, mathsGraph, problemKey, type MathsNode } from '../../src/learn/maths';
import { pickWords, spellingGraph, wordKey, type SpellingNode } from '../../src/learn/spelling';

beforeEach(() => localStorage.clear());

describe('the ledger over localStorage', () => {
  it('keeps the keys asked on a node, oldest first, once each, and the newest LEDGER_CAP', async () => {
    const store = storageFreshStore('maths', 'p1');
    await markAsked(store, 'n', 'a');
    await markAsked(store, 'n', 'b');
    await markAsked(store, 'n', 'a');
    expect(await asked(store, 'n')).toEqual(['b', 'a']);
    for (let i = 0; i < LEDGER_CAP + 5; i += 1) await markAsked(store, 'n', `k${i}`);
    const kept = await asked(store, 'n');
    expect(kept).toHaveLength(LEDGER_CAP);
    expect(kept.at(-1)).toBe(`k${LEDGER_CAP + 4}`);
    expect(await isFresh(store, 'n', 'a')).toBe(true);
  });

  it('is read again by a store made over the same phone, so a child comes back to what he has seen', async () => {
    await markAsked(storageFreshStore('maths', 'p1'), 'n', 'a');
    expect(await asked(storageFreshStore('maths', 'p1'), 'n')).toEqual(['a']);
  });

  it("is each child's own, and each subject's", async () => {
    await markAsked(storageFreshStore('maths', 'p1'), 'n', 'a');
    expect(await asked(storageFreshStore('maths', 'p2'), 'n')).toEqual([]);
    expect(await asked(storageFreshStore('spelling', 'p1'), 'n')).toEqual([]);
  });

  it('marks a node to confirm after a seen right on a missed node, and a fresh right takes the mark off', async () => {
    const store = storageFreshStore('spelling', 'p1');
    expect(await recordAnswer(store, 'n', 'w', false, { missedBefore: false })).toBe('missed');
    expect(await recordAnswer(store, 'n', 'w', true, { missedBefore: true })).toBe('to-confirm');
    expect(await isToConfirm(store, 'n')).toBe(true);
    expect(await toConfirm(storageFreshStore('spelling', 'p1'))).toEqual(['n']);
    expect(await recordAnswer(store, 'n', 'x', true, { missedBefore: true })).toBe('known');
    expect(await toConfirm(store)).toEqual([]);
  });

  it('does not stop the session when the storage is full or blocked', async () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('full'); } } as unknown as Storage;
    const store = storageFreshStore('maths', 'p1', full);
    await expect(markAsked(store, 'n', 'a')).resolves.toBeUndefined();
    expect(await asked(store, 'n')).toEqual([]);
  });

  it("keeps the stock's items per node in a value of its own", async () => {
    const stock = storageStockStore<{ word: string }>('spelling', 'p1');
    await stock.put('n', [{ word: 'a' }, { word: 'b' }]);
    expect(await storageStockStore<{ word: string }>('spelling', 'p1').get('n')).toEqual([{ word: 'a' }, { word: 'b' }]);
    expect(await storageStockStore('spelling', 'p2').get('n')).toEqual([]);
    expect(await asked(storageFreshStore('spelling', 'p1'), 'n')).toEqual([]);
  });
});

describe('missedLast, the app\'s reading of a review row', () => {
  const NOW = Date.UTC(2026, 9, 25);
  const stateOf = (review: NodeState['review']): NodeState => ({ level: 'frontier', since: NOW, how: 'drill', review });

  it('is false for a node with no review row or one just started', () => {
    expect(missedLast(undefined)).toBe(false);
    expect(missedLast(stateOf(undefined))).toBe(false);
    expect(missedLast(stateOf(startSchedule(NOW)))).toBe(false);
  });

  it('is true after a miss, and false once a right makes it good', () => {
    const missed = nextReview(startSchedule(NOW), false, NOW);
    expect(missedLast(stateOf(missed))).toBe(true);
    const oneRight = nextReview(missed, true, NOW + DAY);
    expect(missedLast(stateOf(oneRight))).toBe(false);
    const twoRights = nextReview(oneRight, true, NOW + 2 * DAY);
    expect(missedLast(stateOf(twoRights))).toBe(false);
  });
});

describe("the maths maker's avoid", () => {
  const node = mathsGraph.byId.get('place-value-thousands') as MathsNode;

  it('makes problems whose keys are not in avoid, the same for the same seed', () => {
    const first = makeProblems(node, { count: 2, seed: 11 });
    const second = makeProblems(node, { count: 2, seed: 11, avoid: first.map((m) => problemKey(m.item)) });
    expect(second.every((m) => m.fresh)).toBe(true);
    for (const m of second) expect(first.map((f) => f.item.problem)).not.toContain(m.item.problem);
    expect(makeProblems(node, { count: 2, seed: 11, avoid: first.map((m) => problemKey(m.item)) })).toEqual(second);
  });

  it('still makes fresh problems for a node with 30 seen keys, past the seen indexes', () => {
    const seen = Array.from({ length: LEDGER_CAP }, (_, i) => problemKey(node.item(i)));
    expect(new Set(seen).size).toBeGreaterThan(5);
    const made = makeProblems(node, { count: 3, seed: 0, avoid: seen });
    expect(made).toHaveLength(3);
    for (const m of made) {
      expect(m.fresh).toBe(true);
      expect(seen).not.toContain(m.item.problem);
    }
    expect(new Set(made.map((m) => m.item.problem)).size).toBe(3);
    expect(made.every((m) => m.index < ITEM_SPAN + LEDGER_CAP)).toBe(true);
  });

  it('makes the problems as before when nothing is seen, and the seen ones when nothing else is left', () => {
    const plain = makeProblems(node, { count: 2, seed: 5 });
    expect(plain.map((m) => m.index)).toEqual([5, 6]);
    const tiny = mathsGraph.byId.get('fair-shares') as MathsNode;
    const all = Array.from({ length: ITEM_SPAN }, (_, i) => problemKey(tiny.item(i)));
    const none = makeProblems(tiny, { count: 2, seed: 5, avoid: all });
    expect(none).toHaveLength(2);
    expect(none.every((m) => !m.fresh)).toBe(true);
  });
});

describe("the spelling maker's avoid", () => {
  const node = spellingGraph.byId.get('short-vowel-dge') as SpellingNode;
  const words = node.items.map(wordKey);

  it('takes the unseen words first and the seen words after them', () => {
    const avoid = words.slice(0, 2);
    const picked = pickWords(node, { count: 3, seed: 0, avoid }).map(wordKey);
    expect(picked.slice(0, words.length - 2).every((w) => !avoid.includes(w))).toBe(true);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    if (words.length - 2 < 3) expect(avoid).toContain(picked[words.length - 2]);
  });

  it('serves the words as before when none has been seen, and when all have', () => {
    const plain = pickWords(node, { count: 3, seed: 2 }).map(wordKey);
    expect(plain).toEqual([0, 1, 2].map((i) => words[(2 + i) % words.length]));
    expect(pickWords(node, { count: 3, seed: 2, avoid: words }).map(wordKey)).toEqual(plain);
  });
});

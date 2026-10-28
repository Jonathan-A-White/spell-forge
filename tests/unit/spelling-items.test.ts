// mw-16yxp1k.2 (Kestrel 20b): the spelling-items grind writes fresh words for a pattern whose words a child has all seen. The mill is a fake
// here: the ask seam answers with whatever the test hands it. Proved: the check of the answer (pattern, seen, duplicate), the request's shape,
// one ask in flight, the triggers (opened, served, rightAfterMiss), that offline or unlicensed nothing waits, and that the drill never waits.
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFreshStore, MemoryStockStore, asked, type FreshStore } from 'learn-kit/fresh';
import { memoryStore } from 'learn-kit/graph';
import { SPELLING_ITEMS_GRIND, checkFreshWords, createSpellingAsk, isSpellingItemsAnswer, spellingItemsRequest } from '../../src/grist/spelling-items';
import type { SpellingItemsRequest } from '../../src/grist/spelling-items';
import { spellingStock } from '../../src/learn/fresh-store';
import { spellingGraph, type SpellingItem, type SpellingNode } from '../../src/learn/spelling';
import { setLicenceStatus } from '../../src/shell/licence-gate';
import { createSpellingFlow, memoryKeep, type SpellingFlow, type SpellingTurn } from '../../src/worlds/spelling/spelling-flow';
import { validate, type Schema } from '../fixtures/grist/grind-examples';

const NOW = Date.UTC(2026, 9, 25, 9, 0, 0);
const DGE = 'short-vowel-dge'; // edge, judge, bridge, badge
const nodeOf = (id: string): SpellingNode => spellingGraph.byId.get(id) as SpellingNode;
const dge = nodeOf(DGE);
const WORDS = dge.items.map((i) => i.word);

const say = (...words: string[]) => ({ words: words.map((word) => ({ word, sentence: `We saw the ${word} today.` })) });

describe('the answer, checked before it is kept', () => {
  it('reads an answer of words with a sentence each, and nothing else', () => {
    expect(isSpellingItemsAnswer(say('fudge', 'nudge'))).toBe(true);
    expect(isSpellingItemsAnswer({ words: [] })).toBe(true);
    expect(isSpellingItemsAnswer({ words: [{ word: 'fudge' }] })).toBe(false);
    expect(isSpellingItemsAnswer({ words: [{ word: 'fudge', sentence: '' }] })).toBe(false);
    expect(isSpellingItemsAnswer({ words: [{ word: 'fudge', sentence: 'x', hint: 'y' }] })).toBe(false);
    expect(isSpellingItemsAnswer({ words: say('a').words, extra: 1 })).toBe(false);
    expect(isSpellingItemsAnswer(null)).toBe(false);
  });

  it('keeps a word that place-words puts on the node, with its sentence', () => {
    const kept = checkFreshWords(dge, say('fudge', 'nudge'), []);
    expect(kept.map((i) => i.word)).toEqual(['fudge', 'nudge']);
    expect(kept[0]).toMatchObject({ word: 'fudge', pattern: 'dge', sentence: 'We saw the fudge today.' });
  });

  it('drops a word the pattern does not place on the node', () => {
    expect(checkFreshWords(dge, say('rain', 'cat', 'plan', 'ledge'), []).map((i) => i.word)).toEqual(['ledge']);
  });

  it('drops a word he has seen, and a word of the node itself', () => {
    expect(checkFreshWords(dge, say('fudge', 'nudge', 'ledge'), ['fudge']).map((i) => i.word)).toEqual(['nudge', 'ledge']);
    expect(checkFreshWords(dge, say('edge', 'judge', 'hedge'), []).map((i) => i.word)).toEqual(['hedge']);
  });

  it('drops a duplicate, in any case, and anything that is not one plain word', () => {
    expect(checkFreshWords(dge, say('fudge', 'Fudge', ' fudge ', 'nudge'), []).map((i) => i.word)).toEqual(['fudge', 'nudge']);
    expect(checkFreshWords(dge, say('fu dge', 'fudge!', 'nudge2', ''), []).map((i) => i.word)).toEqual([]);
  });

  it('places a letter-sound node\'s words by the letter, since place-words cannot place on a lone letter', () => {
    const shortA = nodeOf('short-vowel-a');
    expect(checkFreshWords(shortA, say('sad', 'rain', 'bake', 'dog'), []).map((i) => i.word)).toEqual(['sad']);
  });

  it('drops a word whose sentence does not use it, or hints at how it is spelt', () => {
    const answer = {
      words: [
        { word: 'fudge', sentence: 'We ate the sweet treat.' },
        { word: 'nudge', sentence: 'Nudge is spelt with a d.' },
        { word: 'ledge', sentence: 'The cat sat on a letter ledge.' },
        { word: 'hedge', sentence: 'A bird sat in the hedge.' },
      ],
    };
    expect(checkFreshWords(dge, answer, []).map((i) => i.word)).toEqual(['hedge']);
  });

  it('keeps no more than it was asked for', () => {
    expect(checkFreshWords(dge, say('fudge', 'nudge', 'ledge', 'hedge'), [], 2).map((i) => i.word)).toEqual(['fudge', 'nudge']);
  });
});

describe('the request', () => {
  const schema = JSON.parse(readFileSync('grinds/spelling-items.request.schema.json', 'utf8')) as Schema;

  it('carries the node, its pattern in words, up to 6 examples, the seen words, the count and the age band, and fits its schema', () => {
    const request = spellingItemsRequest(dge, { count: 6, avoid: ['edge', 'judge'] });
    expect(request).toMatchObject({ schemaVersion: '1', nodeId: DGE, name: dge.name, count: 6, ageBand: dge.band, seen: ['edge', 'judge'] });
    expect(request.examples).toEqual(WORDS.slice(0, 6));
    expect(request.rule).toMatch(/dge/);
    expect(validate(request, schema)).toEqual([]);
  });

  it('cuts the examples to 6, the count to 6 and the seen words to the newest 40', () => {
    const many = spellingItemsRequest({ ...dge, items: Array.from({ length: 9 }, (_, i) => ({ word: `w${i}`, pattern: 'dge', distractor: 'x' })) }, { count: 9, avoid: Array.from({ length: 50 }, (_, i) => `s${i}`) });
    expect(many.examples).toHaveLength(6);
    expect(many.count).toBe(6);
    expect(many.seen).toHaveLength(40);
    expect(many.seen[39]).toBe('s49');
    expect(validate(many, schema)).toEqual([]);
  });

  it('names the grind the app sends', () => {
    expect(SPELLING_ITEMS_GRIND).toEqual({ app: 'spellforge', kind: 'spelling-items', v: '1' });
  });
});

describe('the ask', () => {
  afterEach(() => setLicenceStatus(undefined));
  const online = () => true;
  const fakeMill = (answer: unknown = say('fudge', 'nudge', 'ledge')) => vi.fn<(request: SpellingItemsRequest) => Promise<unknown>>().mockResolvedValue(answer);
  const allSeen = { count: 6, avoid: WORDS };

  it('asks the mill for a node whose words are all seen, and returns the words that pass the check', async () => {
    const mill = fakeMill(say('fudge', 'rain', 'nudge'));
    const ask = createSpellingAsk({ mill, online });
    expect((await ask(DGE, allSeen)).map((i) => i.word)).toEqual(['fudge', 'nudge']);
    expect(mill).toHaveBeenCalledTimes(1);
    expect(mill.mock.calls[0][0].seen).toEqual(WORDS);
  });

  it('asks nothing for a node with 2 or more words still unseen', async () => {
    const mill = fakeMill();
    const ask = createSpellingAsk({ mill, online });
    expect(await ask(DGE, { count: 6, avoid: ['edge', 'judge'] })).toEqual([]);
    expect(await ask(DGE, { count: 6, avoid: [] })).toEqual([]);
    expect(mill).not.toHaveBeenCalled();
    expect((await ask(DGE, { count: 6, avoid: ['edge', 'judge', 'bridge'] })).length).toBe(3); // one unseen: under 2
  });

  it('asks once for a node in a sitting', async () => {
    const mill = fakeMill();
    const ask = createSpellingAsk({ mill, online });
    await ask(DGE, allSeen);
    expect(await ask(DGE, allSeen)).toEqual([]);
    expect(mill).toHaveBeenCalledTimes(1);
  });

  it('offline asks nothing', async () => {
    const mill = fakeMill();
    expect(await createSpellingAsk({ mill, online: () => false })(DGE, allSeen)).toEqual([]);
    expect(mill).not.toHaveBeenCalled();
  });

  it('with no licence asks nothing', async () => {
    setLicenceStatus({ state: 'none' } as never);
    const mill = fakeMill();
    expect(await createSpellingAsk({ mill, online })(DGE, allSeen)).toEqual([]);
    expect(mill).not.toHaveBeenCalled();
  });

  it('a failed grist, or an answer that is not words, resolves to nothing', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('the mill took too long'));
    expect(await createSpellingAsk({ mill: failing, online })(DGE, allSeen)).toEqual([]);
    expect(await createSpellingAsk({ mill: fakeMill({ svg: '<svg/>' }), online })(DGE, allSeen)).toEqual([]);
  });
});

describe('the stock of fresh words', () => {
  let fresh: FreshStore;
  let store: MemoryStockStore<SpellingItem>;
  beforeEach(() => {
    fresh = new MemoryFreshStore({ asked: [[DGE, WORDS]] });
    store = new MemoryStockStore<SpellingItem>();
  });
  const item = (word: string): SpellingItem => ({ word, pattern: 'dge', distractor: '', sentence: `The ${word} is here.` });
  const stockOver = (ask: (idea: string, request: { count: number; avoid: string[] }) => Promise<SpellingItem[]>) => spellingStock({ ask, fresh, store });

  it('keeps 6 at most and tops up under 2: cap 6, low water 2', async () => {
    const ask = vi.fn().mockResolvedValue(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((w) => item(`${w}dge`)));
    const stock = stockOver(ask);
    stock.opened(DGE);
    await stock.settle();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0][1].count).toBe(6);
    expect(await stock.count(DGE)).toBe(6);
    stock.opened(DGE); // 6 kept: not low
    await stock.settle();
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('tells the ask the words he has seen and the words kept, so it does not write them again', async () => {
    const ask = vi.fn().mockResolvedValue([item('fudge')]);
    const stock = stockOver(ask);
    await stock.topUp(DGE);
    await stock.topUp(DGE);
    expect(ask.mock.calls[0][1].avoid).toEqual(expect.arrayContaining(WORDS));
    expect(ask.mock.calls[1][1].avoid).toEqual(expect.arrayContaining([...WORDS, 'fudge']));
  });

  it('has one ask in flight for the whole stock', async () => {
    let release: (items: SpellingItem[]) => void = () => undefined;
    const ask = vi.fn(() => new Promise<SpellingItem[]>((resolve) => (release = resolve)));
    const stock = stockOver(ask);
    stock.opened(DGE);
    stock.rightAfterMiss(DGE);
    stock.opened('digraph-sh');
    await vi.waitFor(() => expect(stock.inFlight(DGE)).toBe(true));
    stock.rightAfterMiss(DGE);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ask).toHaveBeenCalledTimes(1);
    release([item('fudge')]);
    await stock.settle();
    expect(await stock.count(DGE)).toBe(1);
  });

  it('tops up when a word is served and the stock is low, and when a right answer lands on a node he had missed', async () => {
    const ask = vi.fn().mockResolvedValue([]);
    const stock = stockOver(ask);
    await store.put(DGE, [item('fudge'), item('nudge'), item('ledge')]);
    expect((await stock.take(DGE))?.word).toBe('fudge');
    await stock.settle();
    expect(ask).not.toHaveBeenCalled(); // two kept: not under low water
    expect((await stock.take(DGE))?.word).toBe('nudge');
    await stock.settle();
    expect(ask).toHaveBeenCalledTimes(1); // one kept: low
    await store.put(DGE, [item('a'), item('b'), item('c')]);
    stock.rightAfterMiss(DGE);
    await stock.settle();
    expect(ask).toHaveBeenCalledTimes(2); // asks even when not low
  });

  it('a failed ask leaves the stock as it was', async () => {
    const stock = stockOver(vi.fn().mockRejectedValue(new Error('offline')));
    await store.put(DGE, [item('fudge')]);
    stock.opened(DGE);
    await stock.settle();
    expect(await stock.count(DGE)).toBe(1);
  });

  it('is kept per node and does not keep a word he has seen', async () => {
    const stock = stockOver(vi.fn().mockResolvedValue([item('edge'), item('fudge')]));
    await stock.topUp(DGE);
    expect((await store.get(DGE)).map((i) => i.word)).toEqual(['fudge']);
    expect(await store.get('digraph-sh')).toEqual([]);
  });
});

describe('the spelling flow with a stock', () => {
  let fresh: FreshStore;
  let stockStore: MemoryStockStore<SpellingItem>;
  const item = (word: string): SpellingItem => ({ word, pattern: 'dge', distractor: '', sentence: `The ${word} is here.` });

  beforeEach(() => {
    fresh = new MemoryFreshStore({ asked: [[DGE, WORDS]] });
    stockStore = new MemoryStockStore<SpellingItem>();
  });

  type Ask = (idea: string, request: { count: number; avoid: string[] }) => Promise<SpellingItem[]>;

  function flowOver(ask: Ask): { flow: SpellingFlow; stock: ReturnType<typeof spellingStock> } {
    const stock = spellingStock({ ask, fresh, store: stockStore });
    const flow = createSpellingFlow({ store: memoryStore(), keep: memoryKeep(), fresh, stock, now: () => NOW, seed: 7, focus: async () => [DGE] });
    return { flow, stock };
  }

  /** A flow whose stock asks a fake mill through the real ask: the gate, the request, the check. */
  function flowOverMill(mill: (request: SpellingItemsRequest) => Promise<unknown>) {
    return flowOver(createSpellingAsk({ mill, online: () => true }));
  }

  async function atDge(flow: SpellingFlow): Promise<SpellingTurn> {
    for (let i = 0; i < 80; i += 1) {
      const q = (await flow.question())!;
      if (q.stage !== 'placement' && q.nodeId === DGE) return q;
      await flow.answer({ correct: 0, total: q.items.length });
    }
    throw new Error('no turn at the pattern');
  }

  const right = (turn: SpellingTurn) => ({ correct: turn.items.length, total: turn.items.length });

  it('serves the stock\'s words before the built list, with their sentences, and a fresh right is a try that counts', async () => {
    await stockStore.put(DGE, [item('fudge'), item('nudge'), item('ledge'), item('hedge')]);
    const { flow } = flowOver(async () => []);
    const q = await atDge(flow);
    expect(q.items.map((i) => i.word)).toEqual(['fudge', 'nudge', 'ledge']);
    expect(q.items[0].sentence).toBe('The fudge is here.');
    expect(q.waiting).toBe(false);
    expect((await flow.answer(right(q))).verdict).toBe('known');
    expect(await asked(fresh, DGE)).toEqual(expect.arrayContaining(['fudge', 'nudge', 'ledge']));
  });

  it('a pattern all seen asks ahead as it opens, the drill carries on with its words, and the next round has the fresh ones', async () => {
    const mill = vi.fn().mockResolvedValue(say('fudge', 'nudge', 'ledge', 'rain'));
    const { flow, stock } = flowOverMill(mill);
    const first = await atDge(flow);
    expect(first.items.map((i) => i.word).every((w) => WORDS.includes(w))).toBe(true); // nothing fresh yet: the words he has
    expect(first.waiting).toBe(true);
    await stock.settle();
    expect(mill).toHaveBeenCalledTimes(1);
    expect(mill.mock.calls[0][0]).toMatchObject({ nodeId: DGE, seen: WORDS, ageBand: '3-5' });
    expect(await stock.count(DGE)).toBe(3); // 'rain' did not pass the check
    expect((await flow.answer(right(first))).solid).toBe(false); // not solid on words he has met
    const second = await atDge(flow);
    expect(second.items.map((i) => i.word)).toEqual(['fudge', 'nudge', 'ledge']);
    expect(second.waiting).toBe(false);
    expect((await flow.answer(right(second))).verdict).toBe('known'); // a fresh right counts (the node's rule of 4 of 5 is met by a fourth)
    expect(mill).toHaveBeenCalledTimes(1); // one grist for the node in the sitting
  });

  it('a node whose words are all seen, with an empty stock, says the new words are on their way and is not solid on its words', async () => {
    const { flow } = flowOverMill(vi.fn().mockResolvedValue({ words: [] }));
    for (let i = 0; i < 6; i += 1) {
      const q = await atDge(flow);
      expect(q.waiting).toBe(true);
      expect((await flow.answer(right(q))).solid).toBe(false);
    }
  });

  it('offline, or with no licence, the words it has serve and nothing is asked', async () => {
    const mill = vi.fn();
    const stock = spellingStock({ ask: createSpellingAsk({ mill, online: () => false }), fresh, store: stockStore });
    const flow = createSpellingFlow({ store: memoryStore(), keep: memoryKeep(), fresh, stock, now: () => NOW, seed: 7, focus: async () => [DGE] });
    const q = await atDge(flow);
    await stock.settle();
    expect(q.items).toHaveLength(3);
    expect(q.waiting).toBe(true);
    expect(mill).not.toHaveBeenCalled();
    expect(await stock.count(DGE)).toBe(0);
  });

  it('a node with unseen words of its own does not ask, and does not say it waits', async () => {
    fresh = new MemoryFreshStore();
    const mill = vi.fn().mockResolvedValue(say('fudge'));
    const { flow, stock } = flowOverMill(mill);
    const q = await atDge(flow);
    await stock.settle();
    expect(q.waiting).toBe(false);
    expect(mill).not.toHaveBeenCalled();
  });

  it('never waits for the ask: with the mill pending, the turn and the next turn are shown at once', async () => {
    const mill = vi.fn(() => new Promise<unknown>(() => undefined)); // never answers
    const { flow, stock } = flowOverMill(mill);
    const q = await atDge(flow);
    const next = await Promise.race([flow.answer(right(q)).then(() => flow.question()), new Promise((resolve) => setTimeout(() => resolve('waited'), 2000))]);
    expect(next).not.toBe('waited');
    expect(next).not.toBeNull();
    expect(mill).toHaveBeenCalledTimes(1);
    expect(stock.inFlight(DGE)).toBe(true);
  });

  it('a right on words he has seen, after a miss, asks ahead again at once', async () => {
    const ask = vi.fn<Ask>().mockResolvedValue([]);
    const { flow, stock } = flowOver(ask);
    expect((await flow.answer({ correct: 0, total: (await atDge(flow)).items.length })).verdict).toBe('missed');
    const again = await atDge(flow);
    await stock.settle();
    const before = ask.mock.calls.length;
    expect((await flow.answer(right(again))).verdict).toBe('to-confirm');
    await stock.settle();
    expect(ask.mock.calls.length).toBe(before + 1);
  });
});

describe('the eval of the grind', () => {
  const schema = JSON.parse(readFileSync('grinds/spelling-items.request.schema.json', 'utf8')) as Schema;

  it('holds cases whose request fits the schema and whose forbidden words are the seen ones', () => {
    const cases = readdirSync('grinds/spelling-items.eval');
    expect(cases.length).toBeGreaterThan(0);
    for (const name of cases) {
      const input = JSON.parse(readFileSync(`grinds/spelling-items.eval/${name}/input.json`, 'utf8')) as SpellingItemsRequest;
      const expected = JSON.parse(readFileSync(`grinds/spelling-items.eval/${name}/expected.json`, 'utf8')) as { never_contains: string[] };
      expect(validate(input, schema), name).toEqual([]);
      expect([...expected.never_contains].sort(), name).toEqual([...new Set([...input.examples, ...input.seen])].sort());
    }
  });
});

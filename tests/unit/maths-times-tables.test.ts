// mw-w87e3oc.2, AC1, AC2 and AC4: the times tables are asked one table at a time, in school order, and the node 'times-tables' is solid only when
// all of x1 to x12 are open and solid. Pure rules first (src/learn/maths/times-tables.ts), then the flow (src/worlds/maths/maths-flow.ts).
import { beforeEach, describe, expect, it } from 'vitest';
import { memoryStore, type GraphStore } from 'learn-kit/graph';
import { makeProblems, mathsGraph, nodeProblems, type MathsNode } from '../../src/learn/maths';
import {
  SCHOOL_ORDER,
  allTablesSolid,
  newestTable,
  nextTable,
  openNext,
  recordTableTry,
  timesItem,
  type TableTries,
} from '../../src/learn/maths/times-tables';
import { createMathsFlow, memoryKeep, placeAt, triesSolid, type MathsKeep } from '../../src/worlds/maths';

const NOW = Date.UTC(2026, 10, 21, 9, 0, 0);
const node = mathsGraph.byId.get('times-tables') as MathsNode;
const solid = (tries: readonly boolean[]): boolean => triesSolid(tries, node.solid);
const FACT = /^(?:(\d+) × (\d+)|(\d+) × (\d+)) = \?$/;

/** The two numbers of a fact. */
function factOf(problem: string): [number, number] {
  const m = FACT.exec(problem);
  expect(m, problem).not.toBeNull();
  return [Number(m![1] ?? m![3]), Number(m![2] ?? m![4])];
}

describe('makeProblems for times-tables with open tables (AC1)', () => {
  it('with x1 open asks only x1 facts, 0 to 12, each answered right', () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 40; seed += 1) {
      for (const { item } of makeProblems(node, { count: 4, seed, open: [1] })) {
        const [a, b] = factOf(item.problem);
        expect(b === 1 || a === 1, item.problem).toBe(true);
        const other = b === 1 ? a : b;
        expect(other).toBeGreaterThanOrEqual(0);
        expect(other).toBeLessThanOrEqual(12);
        expect(item.answer).toBe(String(a * b));
        expect(item.table).toBe(1);
        seen.add(other);
      }
    }
    expect([...seen].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('with several open asks only those tables, a × n or n × a', () => {
    const tables = new Set<number>();
    for (const { item } of makeProblems(node, { count: 30, seed: 3, open: [2, 5] })) {
      const [a, b] = factOf(item.problem);
      const table = item.table as number;
      expect([2, 5]).toContain(table);
      expect(a === table || b === table, item.problem).toBe(true);
      tables.add(table);
    }
    expect([...tables].sort()).toEqual([2, 5]);
  });

  it('asks every fact of a table, in both orders, before it repeats one', () => {
    // 26 asks, one fewer different problem for the table's own square (7 × 7 is the same both ways)
    expect(new Set(Array.from({ length: 26 }, (_, i) => timesItem(i, [7]).problem)).size).toBe(25);
    expect(new Set(Array.from({ length: 26 }, (_, i) => timesItem(i, [4]).problem)).size).toBe(25);
    expect(new Set(Array.from({ length: 13 }, (_, i) => timesItem(i, [7, 8, 9]).problem)).size).toBe(13);
  });

  it('with no open tables asks what it always did (2 to 10, no table named)', () => {
    for (const { item } of makeProblems(node, { count: 6, seed: 9 })) {
      expect(item.table).toBeUndefined();
      const [a, b] = factOf(item.problem);
      expect(a).toBeGreaterThanOrEqual(2);
      expect(b).toBeLessThanOrEqual(10);
    }
  });

  it('every table, x0 to x12, makes items the node check accepts (a hint never gives the answer)', () => {
    expect(nodeProblems(node)).toEqual([]);
  });
});

describe('the order tables open in (AC2)', () => {
  it('is x1, x2, x5, x10, x3, x4, x6, x7, x8, x9, x11, x12', () => {
    expect([...SCHOOL_ORDER]).toEqual([1, 2, 5, 10, 3, 4, 6, 7, 8, 9, 11, 12]);
    let open: number[] = [];
    const order: number[] = [];
    for (let next = nextTable(open); next !== null; next = nextTable(open)) {
      order.push(next);
      open = [...open, next];
    }
    expect(order).toEqual([1, 2, 5, 10, 3, 4, 6, 7, 8, 9, 11, 12]);
  });

  it('the newest open table is the last of them in school order', () => {
    expect(newestTable([5, 1, 2])).toBe(5);
    expect(newestTable([])).toBeNull();
    expect(newestTable([0])).toBe(0);
  });

  it('the next table opens when the newest open one is solid over its own tries, and not before', () => {
    const rights = [true, true, true, true];
    expect(openNext([1], { '1': [true, true, false, false, true] }, solid)).toEqual([1]);
    expect(openNext([1], { '1': rights }, solid)).toEqual([1, 2]);
    // an older table solid does not open the next: the newest is what counts
    expect(openNext([1, 2], { '1': rights, '2': [true] }, solid)).toEqual([1, 2]);
    expect(openNext([1, 2], { '1': rights, '2': rights }, solid)).toEqual([1, 2, 5]);
  });

  it('a table the grown-up skipped is opened before the ones after it, one at a time', () => {
    const rights = [true, true, true, true];
    expect(openNext([1, 5], { '5': rights }, solid)).toEqual([1, 2, 5]);
  });

  it('records a try for its table, cut to the last few', () => {
    let tries: TableTries = {};
    for (let i = 0; i < 7; i += 1) tries = recordTableTry(tries, 3, i % 2 === 0, 5);
    expect(tries['3']).toHaveLength(5);
  });
});

describe('the node is solid only when x1 to x12 are all open and solid (AC4)', () => {
  const rights = [true, true, true, true];
  const all = [...SCHOOL_ORDER];
  const tries = (except?: number): TableTries => Object.fromEntries(all.map((t) => [String(t), t === except ? [true, true] : rights]));

  it('is not solid while a table is closed, however well the open ones go', () => {
    expect(allTablesSolid(all.filter((t) => t !== 12), tries(), solid)).toBe(false);
    expect(allTablesSolid([1, 2], tries(), solid)).toBe(false);
  });

  it('is not solid while an open table is not solid', () => {
    expect(allTablesSolid(all, tries(7), solid)).toBe(false);
  });

  it('is solid when all twelve are open and each is solid; x0 is not needed', () => {
    expect(allTablesSolid(all, tries(), solid)).toBe(true);
  });
});

describe('the flow', () => {
  let store: GraphStore;
  let keep: MathsKeep;

  beforeEach(() => {
    store = memoryStore();
    keep = memoryKeep();
  });

  const flow = (seed = 7) => createMathsFlow({ store, keep, now: () => NOW, seed });
  /** The next question about times-tables: questions about other nodes that the drill puts first are answered right and left behind. */
  const timesQuestion = async (f: ReturnType<typeof flow>) => {
    for (let i = 0; i < 150; i += 1) {
      const q = (await f.question())!;
      if (q.nodeId === 'times-tables') return q;
      await f.answer(q.item.answer);
    }
    throw new Error('the drill never asked times-tables');
  };
  const tablesOf = async (): Promise<number[] | undefined> => (await keep.load()).tables;

  it('a grown-up placement at times-tables opens x1 only, and the drill asks x1 only (AC2)', async () => {
    await placeAt({ store, keep, now: () => NOW }, 'times-tables');
    expect(await tablesOf()).toEqual([1]);
    const f = flow();
    for (let i = 0; i < 3; i += 1) {
      const q = await timesQuestion(f);
      expect(q.nodeId).toBe('times-tables');
      expect(q.item.table).toBe(1);
      await f.answer(q.item.answer);
    }
  });

  it('a placement at another topic opens no tables, and times-tables is asked as before', async () => {
    await placeAt({ store, keep, now: () => NOW }, 'divide-equal-groups');
    expect(await tablesOf()).toBeUndefined();
  });

  it('a placement at times-tables keeps the tables a grown-up had already chosen', async () => {
    await keep.save({ placement: null, tries: {}, tables: [1, 2] });
    await placeAt({ store, keep, now: () => NOW }, 'times-tables');
    expect(await tablesOf()).toEqual([1, 2]);
  });

  it('x2 opens when x1 is solid on its own facts, and not after fewer right answers (AC2)', async () => {
    await placeAt({ store, keep, now: () => NOW }, 'times-tables');
    const f = flow();
    for (let i = 0; i < 3; i += 1) await f.answer((await timesQuestion(f)).item.answer);
    expect(await tablesOf()).toEqual([1]);
    await f.answer((await timesQuestion(f)).item.answer);
    expect(await tablesOf()).toEqual([1, 2]);
    // and the drill goes on with both
    const tables = new Set<number | undefined>();
    for (let i = 0; i < 4; i += 1) {
      const q = await timesQuestion(f);
      tables.add(q.item.table);
      await f.answer(q.item.answer);
    }
    expect([...tables].sort()).toEqual([1, 2]);
  });

  it('answers wrong on x1 do not open x2', async () => {
    await placeAt({ store, keep, now: () => NOW }, 'times-tables');
    const f = flow();
    for (let i = 0; i < 8; i += 1) await f.answer('999');
    expect(await tablesOf()).toEqual([1]);
  });

  it('the node is not solid with x1 solid and the other tables closed, whatever its own tries say (AC4)', async () => {
    await placeAt({ store, keep, now: () => NOW }, 'times-tables');
    const f = flow();
    for (let i = 0; i < 4; i += 1) await f.answer((await timesQuestion(f)).item.answer);
    expect((await keep.load()).tries['times-tables']).toEqual([true, true, true, true]);
    expect((await store.get('times-tables'))?.level).not.toBe('solid');
  });

  it('with all twelve open the node goes solid only once the last table is solid too (AC4)', async () => {
    const rights = [true, true, true, true];
    const solidTries = Object.fromEntries(SCHOOL_ORDER.filter((t) => t !== 12).map((t) => [String(t), rights]));
    await keep.save({ placement: null, tries: {}, tables: [...SCHOOL_ORDER].sort((a, b) => a - b), tableTries: { ...solidTries, '12': [true] } });
    await placeAt({ store, keep, now: () => NOW }, 'times-tables');
    const f = flow();
    let answered = 0;
    while ((await store.get('times-tables'))?.level !== 'solid' && answered < 200) {
      const q = (await f.question())!;
      await f.answer(q.item.answer);
      answered += 1;
      const twelve = ((await keep.load()).tableTries ?? {})['12'] ?? [];
      if (!solid(twelve)) expect((await store.get('times-tables'))?.level).not.toBe('solid');
    }
    expect((await store.get('times-tables'))?.level).toBe('solid');
    expect(solid(((await keep.load()).tableTries ?? {})['12'] ?? [])).toBe(true);
  });

  it('the placement test asks the node as it always did, even with tables open', async () => {
    await keep.save({ placement: null, tries: {}, tables: [1] });
    const f = flow();
    const seen: Array<number | undefined> = [];
    for (let q = await f.question(); q && q.stage === 'placement' && seen.length < 30; q = await f.question()) {
      if (q.nodeId === 'times-tables') seen.push(q.item.table);
      await f.answer(q.item.answer);
    }
    for (const table of seen) expect(table).toBeUndefined();
  });
});

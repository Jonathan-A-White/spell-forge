// mw-w87e3oc.1: Grown-ups > Maths > 'Maths: where to start'. A grown-up places the child at a topic: every node the topic needs (transitively)
// is solid with source 'grown-up', the topic and what comes after are left as they were, the placement is done, and the next sitting starts at
// the topic. 'Redo the placement test' clears the placement. A grown-up placement never lowers a node the child proved himself.
import { beforeEach, describe, expect, it } from 'vitest';
import { below, memoryStore, type GraphStore } from 'learn-kit/graph';
import { mathsGraph } from '../../src/learn/maths';
import { createMathsFlow, memoryKeep, placeAt, redoPlacement, type MathsKeep } from '../../src/worlds/maths/maths-flow';

const NOW = Date.UTC(2026, 10, 21, 9, 0, 0);
let store: GraphStore;
let keep: MathsKeep;

beforeEach(() => {
  store = memoryStore();
  keep = memoryKeep();
});

const solidIds = async (): Promise<string[]> => [...(await store.entries())].filter(([, s]) => s.level === 'solid').map(([id]) => id).sort();

describe('placing the child at a topic', () => {
  it('marks exactly the topic\'s needs closure solid, with source grown-up, and not the topic', async () => {
    await placeAt({ store, keep, now: () => NOW }, 'times-tables');
    const closure = below(mathsGraph, 'times-tables').map((n) => n.id).sort();
    expect(closure.length).toBeGreaterThan(1);
    expect(await solidIds()).toEqual(closure);
    for (const id of closure) expect((await store.get(id))?.how).toBe('grown-up');
    expect((await store.get('times-tables'))?.level).not.toBe('solid');
    expect((await store.get('divide-equal-groups'))?.level).toBeUndefined();
  });

  it('marks the placement done', async () => {
    await placeAt({ store, keep, now: () => NOW }, 'times-tables');
    expect((await keep.load()).placement?.done).toBe('finished');
  });

  it('never lowers a node he proved himself', async () => {
    await store.put('skip-counting', { level: 'solid', since: 5, how: 'drill' });
    await placeAt({ store, keep, now: () => NOW }, 'times-tables');
    expect(await store.get('skip-counting')).toEqual({ level: 'solid', since: 5, how: 'drill' });
  });

  it('a topic he is already solid on stays as it was', async () => {
    await store.put('times-tables', { level: 'solid', since: 5, how: 'drill' });
    await placeAt({ store, keep, now: () => NOW }, 'times-tables');
    expect(await store.get('times-tables')).toEqual({ level: 'solid', since: 5, how: 'drill' });
  });

  it('throws on a node the graph does not have, writing nothing', async () => {
    await expect(placeAt({ store, keep, now: () => NOW }, 'no-such-node')).rejects.toThrow();
    expect(await solidIds()).toEqual([]);
    expect((await keep.load()).placement).toBeNull();
  });
});

describe('the next sitting after a grown-up placement', () => {
  it('asks nothing of the placement and starts at the picked topic', async () => {
    await placeAt({ store, keep, now: () => NOW }, 'times-tables');
    const flow = createMathsFlow({ store, keep, now: () => NOW, seed: 7 });
    const q = await flow.question();
    expect(q).not.toBeNull();
    expect(q!.stage).toBe('frontier');
    expect(q!.nodeId).toBe('times-tables');
    expect(q!.item.problem).toContain('×');
  });

  it('starts at the picked topic even when an earlier placement left another node at the frontier', async () => {
    const first = mathsGraph.nodes[0].id;
    await store.put(first, { level: 'frontier', since: 1, how: 'placement' });
    await placeAt({ store, keep, now: () => NOW }, 'times-tables');
    const q = await createMathsFlow({ store, keep, now: () => NOW, seed: 7 }).question();
    expect(q!.nodeId).toBe('times-tables');
  });
});

describe('Redo the placement test', () => {
  it('clears the placement so the next entry runs it again, and leaves what is solid', async () => {
    await placeAt({ store, keep, now: () => NOW }, 'times-tables');
    const before = await solidIds();
    await redoPlacement(keep);
    expect((await keep.load()).placement).toBeNull();
    expect(await solidIds()).toEqual(before);
    const q = await createMathsFlow({ store, keep, now: () => NOW, seed: 7 }).question();
    expect(q!.stage).toBe('placement');
  });

  it('keeps the tries it holds', async () => {
    await keep.save({ placement: null, tries: { 'times-tables': [true] } });
    await placeAt({ store, keep, now: () => NOW }, 'times-tables');
    await redoPlacement(keep);
    expect((await keep.load()).tries).toEqual({ 'times-tables': [true] });
  });
});


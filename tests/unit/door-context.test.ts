// mw-79en7t.73 (Kestrel follow-up to 13e): the front door feeds the tutor-talk request's goal and progress parts from what the
// app keeps, the child's place in each world's graph (localStorage, per child) and the goal chosen with the tutor. A part is
// in the request when the app holds it and left out when it does not (docs/what-the-tutor-is-told.md). Nothing is invented: a
// world he has not entered has no progress, and with no goal kept there is no goal.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { createDexieStore, type DexieTalkStore } from 'voice-kit/talks/dexie';
import type { GraphStore, NodeState } from 'learn-kit/graph';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { mathsGraph, MATHS_GOALS, SAT_MATHS_800, mathsScaffold } from '../../src/learn/maths';
import { spellingGraph } from '../../src/learn/spelling';
import { storageGraphStore as mathsStore } from '../../src/worlds/maths';
import { storageGraphStore as spellingStore } from '../../src/worlds/spelling';
import { doorContext, keepChosenGoal } from '../../src/features/front-door/door-context';
import { createFrontDoorFlow, type TutorTalkSend } from '../../src/features/front-door/front-door-flow';
import type { TutorTalkRequest } from '../../src/features/front-door/tutor-talk-request';
import { setLicenceStatus } from '../../src/shell/licence-gate';

const solid: NodeState = { level: 'solid', since: 1, how: 'tested-out' };

async function makeSolid(store: GraphStore, ids: readonly string[]) {
  for (const id of ids) await store.put(id, solid);
}

/** The ids of every node of a band lower than `band`: all the child has to be solid on to be working in it. */
const idsBefore = (graph: typeof spellingGraph | typeof mathsGraph, band: string) => {
  const nodes = graph.nodes as readonly { id: string; band: string; level: number }[];
  const level = nodes.find((node) => node.band === band)!.level;
  return nodes.filter((node) => node.level < level).map((node) => node.id);
};

const P = 'child-1';

beforeEach(() => {
  localStorage.clear();
});

describe('the door feeds the goal and progress parts (mw-79en7t.73)', () => {
  it('AC2: a child who has entered no world has no progress and no goal, only the goals the app can scaffold', async () => {
    const context = await doorContext(P);

    expect(context.progress).toBeUndefined();
    expect(context.goal).toBeUndefined();
    expect(context.goals).toEqual(MATHS_GOALS.map(({ id, title }) => ({ id, title })));
  });

  it('AC1/AC2: spelling progress is the band he works in and the next nodes by name, from the spelling store', async () => {
    const before = idsBefore(spellingGraph, '1-2');
    await makeSolid(spellingStore(P), before);

    const { progress } = await doorContext(P);

    expect(progress?.maths).toBeUndefined();
    expect(progress?.spelling?.band).toBe('1-2');
    const next = progress!.spelling!.next;
    expect(next.length).toBeGreaterThan(0);
    expect(next.length).toBeLessThanOrEqual(5);
    const names = spellingGraph.nodes.map((node) => node.name);
    for (const name of next) expect(names).toContain(name);
    // every named node is one whose needs are all solid and which is not solid itself
    const nodes = spellingGraph.nodes.filter((node) => next.includes(node.name));
    for (const node of nodes) {
      expect(before).not.toContain(node.id);
      for (const need of node.needs) expect(before).toContain(need);
    }
  });

  it('AC1/AC2: maths progress is read from the maths store, and the spelling part stays out', async () => {
    await makeSolid(mathsStore(P), idsBefore(mathsGraph, '3-5'));

    const { progress } = await doorContext(P);

    expect(progress?.spelling).toBeUndefined();
    expect(progress?.maths?.band).toBe('3-5');
    expect(progress?.maths?.next.length).toBeGreaterThan(0);
  });

  it('AC2: a store that holds nothing for this child leaves progress out; another child\'s place is not read', async () => {
    await makeSolid(spellingStore('someone-else'), idsBefore(spellingGraph, '1-2'));

    expect((await doorContext(P)).progress).toBeUndefined();
  });

  it('AC2: a world with every node solid has nothing next, so it is left out', async () => {
    await makeSolid(
      spellingStore(P),
      spellingGraph.nodes.map((node) => node.id),
    );

    expect((await doorContext(P)).progress?.spelling).toBeUndefined();
  });

  it('AC1/AC2: the chosen goal is in the request with its progress taken from the maths store, and absent when none is kept', async () => {
    const ids = idsBefore(mathsGraph, '6-8');
    await makeSolid(mathsStore(P), ids);
    expect((await doorContext(P)).goal).toBeUndefined();

    keepChosenGoal(P, SAT_MATHS_800.id);
    const { goal } = await doorContext(P);

    expect(goal).toEqual({
      id: SAT_MATHS_800.id,
      title: SAT_MATHS_800.title,
      progress: mathsScaffold(SAT_MATHS_800, new Set(ids)).progress,
    });
    expect(goal!.progress).toBeGreaterThan(0);
    expect(goal!.progress).toBeLessThan(1);

    keepChosenGoal(P, null);
    expect((await doorContext(P)).goal).toBeUndefined();
  });

  it('AC2: a goal that is kept for a child with nothing solid has progress 0, and a kept id the app no longer knows is no goal', async () => {
    keepChosenGoal(P, SAT_MATHS_800.id);
    expect((await doorContext(P)).goal).toEqual({ id: SAT_MATHS_800.id, title: SAT_MATHS_800.title, progress: 0 });

    localStorage.setItem(`sf-door-goal:${P}`, JSON.stringify('a-goal-from-another-version'));
    expect((await doorContext(P)).goal).toBeUndefined();
  });

  it('AC2: a broken value in storage is no goal and no progress, not an error', async () => {
    localStorage.setItem(`sf-door-goal:${P}`, '{not json');
    localStorage.setItem(`sf-spelling-graph:${P}`, 'nonsense');

    const context = await doorContext(P);

    expect(context.goal).toBeUndefined();
    expect(context.progress).toBeUndefined();
  });
});

describe('the flow puts them in the request (mw-79en7t.73)', () => {
  let store: DexieTalkStore;
  let count = 0;
  let profileId: string;

  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
    store = createDexieStore({ name: `door-context-test-${++count}`, indexedDB, IDBKeyRange });
    profileId = (await profileRepo.createLearner('Sam', 'dragon-forge', { ...DEFAULT_SETTINGS })).id;
  });

  afterEach(() => {
    store.close();
    setLicenceStatus(undefined);
  });

  async function requestOf(): Promise<TutorTalkRequest> {
    const send = vi.fn<TutorTalkSend>(async () => ({ words: 'Hello!' }));
    const flow = createFrontDoorFlow({
      send,
      store,
      profileId,
      open: () => undefined,
      context: () => doorContext(profileId),
    });
    await flow.ask(await flow.start(), 'Hi');
    return send.mock.calls[0][0];
  }

  it('AC1/AC2: the request carries goal and progress when the app holds them', async () => {
    await makeSolid(spellingStore(profileId), idsBefore(spellingGraph, '1-2'));
    await makeSolid(mathsStore(profileId), idsBefore(mathsGraph, '3-5'));
    keepChosenGoal(profileId, SAT_MATHS_800.id);

    const request = await requestOf();

    expect(request.goal).toMatchObject({ id: SAT_MATHS_800.id, title: SAT_MATHS_800.title });
    expect(request.progress?.spelling?.band).toBe('1-2');
    expect(request.progress?.maths?.band).toBe('3-5');
  });

  it('AC2: the request has neither when the app holds neither', async () => {
    const request = await requestOf();

    expect(request).not.toHaveProperty('goal');
    expect(request).not.toHaveProperty('progress');
    expect(request.goals).toEqual(MATHS_GOALS.map(({ id, title }) => ({ id, title })));
  });
});

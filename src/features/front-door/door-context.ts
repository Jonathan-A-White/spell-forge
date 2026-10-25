// src/features/front-door/door-context.ts — what the app keeps of the child, read for each turn of the front door's talk (the
// request's goal, goals and progress parts: docs/what-the-tutor-is-told.md). Progress is the child's place in each world's graph
// (the graph stores the worlds write, one per child in localStorage); the goal is the one chosen with the tutor, kept here by id
// and read against MATHS_GOALS. A part is given only when the app holds it: a world he has not entered has no progress, and
// with no goal kept there is no goal. Nothing is guessed from the graph's roots.
import { frontierOf, type Graph, type GraphNode, type GraphStore } from 'learn-kit/graph';
import { goalProgress } from 'learn-kit/learner';
import { MATHS_GOALS, mathsGraph } from '../../learn/maths';
import { spellingGraph } from '../../learn/spelling';
import { storageGraphStore as mathsStore } from '../../worlds/maths';
import { storageGraphStore as spellingStore } from '../../worlds/spelling';
import type { FrontDoorContext } from './front-door-flow';
import type { SubjectProgress } from './tutor-talk-request';

/** The most nodes the request names as next (the request schema's maxItems). */
export const NEXT_MAX = 5;

type Banded = GraphNode & { name: string; band: string; level: number };

const goalKey = (profileId: string): string => `sf-door-goal:${profileId}`;

/** Keeps the id of the goal the child chose with the tutor (null forgets it). One goal at a time, per child, on the phone. */
export function keepChosenGoal(profileId: string, goalId: string | null, storage: Storage = localStorage): void {
  try {
    if (goalId === null) storage.removeItem(goalKey(profileId));
    else storage.setItem(goalKey(profileId), JSON.stringify(goalId));
  } catch {
    // a full or blocked storage loses the goal, never the talk
  }
}

function chosenGoalId(profileId: string, storage: Storage): string | undefined {
  try {
    const raw = storage.getItem(goalKey(profileId));
    const id: unknown = raw === null ? undefined : JSON.parse(raw);
    return typeof id === 'string' ? id : undefined;
  } catch {
    return undefined;
  }
}

/** The ids of the solid nodes, and whether the store holds any state of this graph at all. */
async function placeIn(store: GraphStore, graph: Graph): Promise<{ held: boolean; solid: Set<string> }> {
  let entries: Awaited<ReturnType<GraphStore['entries']>>;
  try {
    entries = await store.entries();
  } catch {
    return { held: false, solid: new Set() };
  }
  const known = [...entries].filter(([id]) => graph.byId.has(id));
  return { held: known.length > 0, solid: new Set(known.filter(([, state]) => state?.level === 'solid').map(([id]) => id)) };
}

/**
 * Where he is in one world: the band of the lowest nodes ready to learn now, and the next few by their child-facing names.
 * Undefined when the world holds nothing of him, or has nothing left to learn.
 */
function progressOf<Band extends string>(graph: Graph<Banded>, held: boolean, solid: ReadonlySet<string>): SubjectProgress<Band> | undefined {
  if (!held) return undefined;
  const ready = frontierOf(graph, solid)
    .map((node, order) => ({ node, order }))
    .sort((a, b) => a.node.level - b.node.level || a.order - b.order)
    .map(({ node }) => node);
  if (ready.length === 0) return undefined;
  return { band: ready[0].band as Band, next: ready.slice(0, NEXT_MAX).map((node) => node.name) };
}

/** The goal, goals and progress parts of the request for this child, from what the app keeps. */
export async function doorContext(profileId: string, storage: Storage = localStorage): Promise<FrontDoorContext> {
  const [spelling, maths] = await Promise.all([placeIn(spellingStore(profileId, storage), spellingGraph), placeIn(mathsStore(profileId, storage), mathsGraph)]);

  const spellingProgress = progressOf<NonNullable<NonNullable<FrontDoorContext['progress']>['spelling']>['band']>(spellingGraph as Graph<Banded>, spelling.held, spelling.solid);
  const mathsProgress = progressOf<NonNullable<NonNullable<FrontDoorContext['progress']>['maths']>['band']>(mathsGraph as Graph<Banded>, maths.held, maths.solid);

  const chosen = MATHS_GOALS.find(({ id }) => id === chosenGoalId(profileId, storage));

  return {
    goals: MATHS_GOALS.map(({ id, title }) => ({ id, title })),
    ...(chosen ? { goal: { id: chosen.id, title: chosen.title, progress: goalProgress(chosen, mathsGraph, maths.solid) } } : {}),
    ...(spellingProgress || mathsProgress ? { progress: { ...(spellingProgress ? { spelling: spellingProgress } : {}), ...(mathsProgress ? { maths: mathsProgress } : {}) } } : {}),
  };
}

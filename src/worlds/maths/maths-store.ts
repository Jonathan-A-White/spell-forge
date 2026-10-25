// src/worlds/maths/maths-store.ts: where the maths world keeps a child's place in the maths graph on the phone: each node's state (learn-kit's
// GraphStore) and what the flow adds to it (the placement being done, the last tries of each node). One small JSON value for each,
// per child, in localStorage: a few hundred nodes at most, read and written whole, with no network and no Dexie version of its own.
import type { GraphStore, NodeState } from 'learn-kit/graph';
import type { PlacementState } from 'learn-kit/drill';

/** What the flow keeps besides the graph's node states. */
export interface MathsKept {
  /** The placement, while it is being done and once it is done (its `done` says which); null before the first entry. */
  placement: PlacementState | null;
  /** The last tries at each node, oldest first: true for a right answer that counted (no hint). Cut to the node's `of` by the flow. */
  tries: Record<string, boolean[]>;
}

export interface MathsKeep {
  load(): Promise<MathsKept>;
  save(kept: MathsKept): Promise<void>;
}

const empty = (): MathsKept => ({ placement: null, tries: {} });

/** A keep in memory, for a test. */
export function memoryKeep(initial?: MathsKept): MathsKeep {
  let kept = structuredClone(initial ?? empty());
  return {
    load: async () => structuredClone(kept),
    save: async (next) => {
      kept = structuredClone(next);
    },
  };
}

const graphKey = (profileId: string): string => `sf-maths-graph:${profileId}`;
const keepKey = (profileId: string): string => `sf-maths-keep:${profileId}`;

function readJson<T>(storage: Storage, key: string): T | undefined {
  try {
    const raw = storage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

function writeJson(storage: Storage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // a full or blocked storage loses the place, never the session
  }
}

/** A GraphStore over a Storage (localStorage), one value for the child's whole graph. */
export function storageGraphStore(profileId: string, storage: Storage = localStorage): GraphStore {
  const load = (): Map<string, NodeState> => new Map(readJson<[string, NodeState][]>(storage, graphKey(profileId)) ?? []);
  const save = (states: Map<string, NodeState>): void => writeJson(storage, graphKey(profileId), [...states]);
  return {
    get: async (id) => load().get(id),
    put: async (id, state) => {
      const states = load();
      states.set(id, structuredClone(state));
      save(states);
    },
    delete: async (id) => {
      const states = load();
      states.delete(id);
      save(states);
    },
    entries: async () => load(),
  };
}

/** The flow's own keep over a Storage (localStorage). */
export function storageKeep(profileId: string, storage: Storage = localStorage): MathsKeep {
  return {
    load: async () => ({ ...empty(), ...readJson<Partial<MathsKept>>(storage, keepKey(profileId)) }),
    save: async (kept) => writeJson(storage, keepKey(profileId), kept),
  };
}

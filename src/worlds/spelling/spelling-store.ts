// src/worlds/spelling/spelling-store.ts: where the spelling world keeps a child's place in the spelling graph on the phone: each node's state
// (learn-kit's GraphStore) and what the flow adds to it (the placement being done, the last tries of each node). One small JSON value for
// each, per child, in localStorage, read and written whole, with no network and no Dexie version of its own. Same shape as the maths world's
// (src/worlds/maths/maths-store.ts) under keys of its own; a library candidate once a third subject wants it.
import type { GraphStore, NodeState } from 'learn-kit/graph';
import type { PlacementState } from 'learn-kit/drill';

/** What the flow keeps besides the graph's node states. */
export interface SpellingKept {
  /** The placement, while it is being done and once it is done (its `done` says which); null before the first entry. */
  placement: PlacementState | null;
  /** The last tries at each node, oldest first: true for a word spelt right. Cut to the node's `of` by the flow. */
  tries: Record<string, boolean[]>;
}

export interface SpellingKeep {
  load(): Promise<SpellingKept>;
  save(kept: SpellingKept): Promise<void>;
}

const empty = (): SpellingKept => ({ placement: null, tries: {} });

/** A keep in memory, for a test. */
export function memoryKeep(initial?: SpellingKept): SpellingKeep {
  let kept = structuredClone(initial ?? empty());
  return {
    load: async () => structuredClone(kept),
    save: async (next) => {
      kept = structuredClone(next);
    },
  };
}

const graphKey = (profileId: string): string => `sf-spelling-graph:${profileId}`;
const keepKey = (profileId: string): string => `sf-spelling-keep:${profileId}`;

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
export function storageKeep(profileId: string, storage: Storage = localStorage): SpellingKeep {
  return {
    load: async () => ({ ...empty(), ...readJson<Partial<SpellingKept>>(storage, keepKey(profileId)) }),
    save: async (kept) => writeJson(storage, keepKey(profileId), kept),
  };
}

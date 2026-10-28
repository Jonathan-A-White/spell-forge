// src/learn/fresh-store.ts: where a child's seen ledger lives on the phone, for learn-kit/fresh (Kestrel 20a): per subject and per child, the
// question keys asked on each node (a word; a maths problem) and the nodes marked to confirm, as one small JSON value in localStorage, the same
// shape and place as the worlds' own keeps (spelling-store.ts, maths-store.ts); and the StockStore for the ask-ahead stock (story 20b), a value of
// its own. Data and pure code: no screen, no network. docs/spelling-graph.md and docs/maths-graph.md say how the worlds use the rule.
import { createStock, type AskRequest, type FreshStore, type Stock, type StockStore } from 'learn-kit/fresh';
import { DAY, type NodeState } from 'learn-kit/graph';
import type { SpellingItem } from './spelling';

export { MemoryFreshStore, MemoryStockStore } from 'learn-kit/fresh';

/** The subjects that keep a ledger: each has a value of its own beside its graph (`sf-<subject>-graph:<profile>`). */
export type FreshSubject = 'spelling' | 'maths';

interface Kept {
  asked: Record<string, string[]>;
  toConfirm: string[];
}

const freshKey = (subject: FreshSubject, profileId: string): string => `sf-${subject}-fresh:${profileId}`;
const stockKey = (subject: FreshSubject, profileId: string): string => `sf-${subject}-stock:${profileId}`;

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
    // a full or blocked storage loses the ledger (every item is fresh again), never the session
  }
}

/** A FreshStore over a Storage (localStorage): the child's whole ledger is one value, read and written whole. */
export function storageFreshStore(subject: FreshSubject, profileId: string, storage: Storage = localStorage): FreshStore {
  const key = freshKey(subject, profileId);
  const load = (): Kept => {
    const read = readJson<Partial<Kept>>(storage, key);
    return { asked: read?.asked ?? {}, toConfirm: read?.toConfirm ?? [] };
  };
  const save = (kept: Kept): void => writeJson(storage, key, kept);
  return {
    getAsked: async (idea) => [...(load().asked[idea] ?? [])],
    putAsked: async (idea, keys) => {
      const kept = load();
      kept.asked[idea] = [...keys];
      save(kept);
    },
    listToConfirm: async () => [...load().toConfirm],
    markToConfirm: async (idea) => {
      const kept = load();
      if (!kept.toConfirm.includes(idea)) save({ ...kept, toConfirm: [...kept.toConfirm, idea] });
    },
    clearToConfirm: async (idea) => {
      const kept = load();
      if (kept.toConfirm.includes(idea)) save({ ...kept, toConfirm: kept.toConfirm.filter((i) => i !== idea) });
    },
  };
}

/** A StockStore over a Storage (localStorage), for the fresh items the mill writes ahead (story 20b): the child's items of every node, one value. */
export function storageStockStore<T>(subject: FreshSubject, profileId: string, storage: Storage = localStorage): StockStore<T> {
  const key = stockKey(subject, profileId);
  const load = (): Record<string, T[]> => readJson<Record<string, T[]>>(storage, key) ?? {};
  return {
    get: async (idea) => [...(load()[idea] ?? [])],
    put: async (idea, items) => {
      const kept = load();
      kept[idea] = [...items];
      writeJson(storage, key, kept);
    },
  };
}

/** Most fresh words kept per node (learn-kit's STOCK_CAP, Lampas's MAX_KEPT). PROVISIONAL. */
export const SPELLING_STOCK_CAP = 6;
/** A node with fewer fresh words kept than this is topped up in the background (learn-kit's STOCK_LOW_WATER). PROVISIONAL. */
export const SPELLING_STOCK_LOW_WATER = 2;

/**
 * The Spelling world's ask-ahead stock (story 20b, grinds/spelling-items.json): the fresh words the mill wrote for each node, kept in `store` (storageStockStore),
 * served oldest first and once, never a word in the child's ledger. `ask` is the mill call and its check (src/grist/spelling-items.ts); it resolves to none
 * when it cannot ask, so offline, with no licence or on a failed grist the stock stays as it was.
 */
export function spellingStock(options: {
  ask: (idea: string, request: AskRequest) => Promise<SpellingItem[]>;
  fresh: FreshStore;
  store: StockStore<SpellingItem>;
}): Stock<SpellingItem> {
  return createStock<SpellingItem>({
    ask: options.ask,
    keyOf: (item) => item.word,
    store: options.store,
    fresh: options.fresh,
    lowWater: SPELLING_STOCK_LOW_WATER,
    cap: SPELLING_STOCK_CAP,
  });
}

/**
 * The app's reading of a node's review row for learn-kit/fresh's `missedBefore`: was the last answer a miss, not made good since? A miss is
 * the one answer that counts a lapse and leaves the node due after a day with no rights in a row (learn-kit/graph's nextReview); two rights
 * in a row move the node up a step (a longer gap), and one right leaves a right in a row, so either makes it good.
 */
export function missedLast(state: NodeState | undefined): boolean {
  const review = state?.review;
  if (!review) return false;
  return review.lapses > 0 && review.rights === 0 && review.due - review.lastWhen === DAY;
}

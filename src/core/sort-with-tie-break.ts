// src/core/sort-with-tie-break.ts: newest first on a timestamp, an equal timestamp broken by a unique key.
// Rows made in one millisecond share a timestamp, and sorting on it alone leaves their order to the sort and to
// the order they were read in (random ids), so a list could come back differently on each read. The key (the row's
// id) makes the order the same on every read.

type Stamp = Date | number;

const msOf = (stamp: Stamp): number => (typeof stamp === 'number' ? stamp : stamp.getTime());

/** A comparator: newer `at` first; an equal `at` falls back to the greater `key` first. */
export function newestFirstBy<T>(at: (item: T) => Stamp, key: (item: T) => string): (a: T, b: T) => number {
  return (a, b) => {
    const diff = msOf(at(b)) - msOf(at(a));
    if (diff !== 0) return diff;
    const ka = key(a);
    const kb = key(b);
    return ka < kb ? 1 : ka > kb ? -1 : 0;
  };
}

/** `items` as a new array, newest first by `at`, an equal `at` broken by `key` (the row's unique id). */
export function sortNewestFirst<T>(items: readonly T[], at: (item: T) => Stamp, key: (item: T) => string): T[] {
  return [...items].sort(newestFirstBy(at, key));
}

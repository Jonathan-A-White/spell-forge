// mw-6ww.175.66: one sort for "newest first", an equal timestamp broken by a unique key, so rows made in one
// millisecond come back in the same order on every read (class equal-timestamp-sort-has-no-tiebreak).
import { describe, expect, it } from 'vitest';
import { newestFirstBy, sortNewestFirst } from '../../src/core/sort-with-tie-break';

interface Row {
  id: string;
  at: Date;
}

const T = 1_700_000_000_000;
const row = (id: string, offset = 0): Row => ({ id, at: new Date(T + offset) });

function shuffled<A>(items: readonly A[], seed: number): A[] {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe('sortNewestFirst', () => {
  it('puts rows of an equal timestamp in one fixed order (greater id first) for 20 shuffles of the input', () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map((id) => row(id));
    for (let run = 0; run < 20; run++) {
      const ids = sortNewestFirst(shuffled(rows, run + 1), (r) => r.at, (r) => r.id).map((r) => r.id);
      expect(ids).toEqual(['e', 'd', 'c', 'b', 'a']);
    }
  });

  it('puts different timestamps newest first, whatever their ids', () => {
    const rows = [row('z', 0), row('a', 2), row('m', 1)];
    for (let run = 0; run < 20; run++) {
      const ids = sortNewestFirst(shuffled(rows, run + 1), (r) => r.at, (r) => r.id).map((r) => r.id);
      expect(ids).toEqual(['a', 'm', 'z']);
    }
  });

  it('takes numbers as well as dates, and leaves the input as it was', () => {
    const rows = [{ k: 'a', n: 1 }, { k: 'b', n: 1 }, { k: 'c', n: 2 }];
    const copy = [...rows];
    expect(sortNewestFirst(rows, (r) => r.n, (r) => r.k).map((r) => r.k)).toEqual(['c', 'b', 'a']);
    expect(rows).toEqual(copy);
  });

  it('newestFirstBy is the comparator of it', () => {
    const rows = [row('a'), row('b')];
    expect([...rows].sort(newestFirstBy((r) => r.at, (r) => r.id)).map((r) => r.id)).toEqual(['b', 'a']);
  });
});

// src/features/dashboard/attempt-order.ts: a word's attempts, newest first.
import type { TechniqueResult } from '../../contracts/types';
import { sortNewestFirst } from '../../core/sort-with-tie-break';

/**
 * A word's attempts, newest first. A TechniqueResult has no id, so attempts at one millisecond are broken by
 * their place in the stored history: the later one first.
 */
export function newestAttemptsFirst(history: readonly TechniqueResult[]): TechniqueResult[] {
  const placed = history.map((result, index) => ({ result, key: String(index).padStart(9, '0') }));
  return sortNewestFirst(
    placed,
    (p) => new Date(p.result.timestamp),
    (p) => p.key,
  ).map((p) => p.result);
}

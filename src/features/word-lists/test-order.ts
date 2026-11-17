// src/features/word-lists/test-order.ts: the order of the Test History list.
import type { TestResult } from '../../contracts/types';
import { sortNewestFirst } from '../../core/sort-with-tie-break';

/** Tests newest first; two on one date keep one order (by id), not the order read. */
export function newestTestFirst(testResults: readonly TestResult[]): TestResult[] {
  return sortNewestFirst(testResults, (r) => new Date(r.testDate), (r) => r.id);
}

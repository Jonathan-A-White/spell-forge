// src/features/dashboard/day-order.ts: the order of a day's attempts and sessions on the day detail screen.
// Rows at one millisecond keep one order, not the order they were read in (class equal-timestamp-sort-has-no-tiebreak).
import type { SessionLog } from '../../contracts/types';
import { newestFirstBy } from '../../core/sort-with-tie-break';

export interface WordAttempt {
  wordId: string;
  wordText: string;
  correct: boolean;
  responseTimeMs: number;
  techniqueId: string;
  struggled: boolean;
  scaffoldingUsed: boolean;
  userInput?: string;
  timestamp: Date;
}

/** The day's attempts, oldest first; two at one millisecond keep one order (by what they say), not the order read. */
export function orderAttempts(attempts: readonly WordAttempt[]): WordAttempt[] {
  const newestFirst = newestFirstBy<WordAttempt>(
    (a) => a.timestamp,
    (a) => [a.wordId, a.techniqueId, a.correct, a.responseTimeMs, a.userInput ?? ''].join('|'),
  );
  return [...attempts].sort((a, b) => newestFirst(b, a));
}

/** The day's sessions, oldest first; two starting at one millisecond keep one order (by id). */
export function orderSessions(sessions: readonly SessionLog[]): SessionLog[] {
  const newestFirst = newestFirstBy<SessionLog>((s) => new Date(s.startedAt), (s) => s.id);
  return [...sessions].sort((a, b) => newestFirst(b, a));
}

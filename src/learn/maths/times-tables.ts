// src/learn/maths/times-tables.ts — The times tables taught one at a time, as a school does (docs/maths-graph.md): which tables are open, the
// order they open in, the facts of an open table, and when the node 'times-tables' counts as solid. Data and pure code, no screen and no storage;
// where the open list and the tries are kept is src/worlds/maths/maths-store.ts, and the flow that drives them is maths-flow.ts.

import type { MathsItem } from './items.ts';

/** The node these rules are for. */
export const TIMES_TABLES = 'times-tables';

/** Every table a grown-up can open: ×0 to ×12. */
export const ALL_TABLES: readonly number[] = Array.from({ length: 13 }, (_, i) => i);

/** The order a school teaches the tables in, and the order the next one opens in. ×0 is not in it: a grown-up may open it, and it is not needed for solid. */
export const SCHOOL_ORDER: readonly number[] = [1, 2, 5, 10, 3, 4, 6, 7, 8, 9, 11, 12];

/** How many facts a table has: 0 to 12 times it. */
export const FACTS_PER_TABLE = 13;

/** The tries of each table (true for a right answer that counted), by the table's number as text, oldest first. */
export type TableTries = Record<string, boolean[]>;

const SKIP_HINT = 'Skip count by either number, as many jumps as the other number says. Or start from a fact you know and add a group.';
const NONE_HINT = 'Nothing in any group, or no groups at all, so how much is there in all?';
const SINGLE_HINT = 'Each group has a single thing in it, so the total is just the number of groups.';

/** The k-th fact of a table, a × table or table × a with a from 0 to 12: all 26 are different before they come round again. */
export function timesFact(table: number, k: number): MathsItem {
  const a = (k * 5 + 3) % FACTS_PER_TABLE;
  const swapped = Math.floor(k / FACTS_PER_TABLE) % 2 === 1;
  return {
    problem: swapped ? `${table} × ${a} = ?` : `${a} × ${table} = ?`,
    answer: String(a * table),
    hint: table === 0 ? NONE_HINT : table === 1 ? SINGLE_HINT : SKIP_HINT,
    table,
  };
}

/** The item at an index when only the `open` tables are asked: the tables take turns, and each table goes through its own facts. */
export function timesItem(index: number, open: readonly number[]): MathsItem {
  const n = Math.max(open.length, 1);
  return timesFact(open[index % n] ?? 1, Math.floor(index / n));
}

/** The open tables as a tidy list: whole numbers from 0 to 12, once each, smallest first. */
export function tidyTables(tables: readonly number[]): number[] {
  return [...new Set(tables.filter((t) => Number.isInteger(t) && t >= 0 && t <= 12))].sort((a, b) => a - b);
}

/** Where a table falls in the order tables open: ×0 first, then the school order. */
const rank = (table: number): number => (table === 0 ? -1 : SCHOOL_ORDER.indexOf(table));

/** The open table that came last in the school order, or null when none is open. */
export function newestTable(open: readonly number[]): number | null {
  let newest: number | null = null;
  for (const table of open) if (newest === null || rank(table) > rank(newest)) newest = table;
  return newest;
}

/** The table that opens next: the first in the school order that is not open yet, or null when every table of ×1 to ×12 is open. */
export function nextTable(open: readonly number[]): number | null {
  return SCHOOL_ORDER.find((t) => !open.includes(t)) ?? null;
}

/** The tries of a table with one more on the end, cut to the last `keepLast`. */
export function recordTableTry(tries: TableTries, table: number, counted: boolean, keepLast: number): TableTries {
  return { ...tries, [String(table)]: [...(tries[String(table)] ?? []), counted].slice(-keepLast) };
}

/**
 * The open tables after a try: when the newest open table is solid by the node's rule over its own tries (`isSolid`), the next in school order opens,
 * and again if that one is already solid from before. Never more than the twelve of ×1 to ×12 and ×0 if it was ticked.
 */
export function openNext(open: readonly number[], tries: TableTries, isSolid: (tries: readonly boolean[]) => boolean): number[] {
  let now = tidyTables(open);
  let newest = newestTable(now);
  while (newest !== null && isSolid(tries[String(newest)] ?? [])) {
    const next = nextTable(now);
    if (next === null) break;
    now = tidyTables([...now, next]);
    newest = next;
  }
  return now;
}

/** Is the node solid: every table of ×1 to ×12 open, and each solid by the node's rule over its own tries? */
export function allTablesSolid(open: readonly number[], tries: TableTries, isSolid: (tries: readonly boolean[]) => boolean): boolean {
  return SCHOOL_ORDER.every((t) => open.includes(t) && isSolid(tries[String(t)] ?? []));
}

// src/shell/report-screen.ts: every screen tells the tutor where the child is (M37). A world calls useReportScreen with its
// name and a few short facts about what it shows; the front door's next tutor request carries them (screenContext, in the
// request's `screen`), and the Shell's one Ask button opens the tutor with them (askTheTutor). The report is what the screen
// shows right now, so it goes when the screen does; Ask keeps a copy for the tutor it opens, taken by the next request.
import { useEffect, useSyncExternalStore } from 'react';
import { openView, type ViewId } from './worlds';

/** What the tutor-talk request takes of a screen (grinds/tutor-talk.request.schema.json): a name and at most 10 facts of 200 characters. */
export interface ScreenReport {
  name: string;
  facts: string[];
}

export const SCREEN_MAX_FACTS = 10;
export const SCREEN_FACT_MAX_CHARS = 200;

let current: ScreenReport | undefined;
let carried: ScreenReport | undefined;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

/** Sets what the screen shows now (null when it goes). A report with no name is no report; facts past the request's limits are cut. */
export function reportScreen(report: ScreenReport | null): void {
  const name = report?.name.trim();
  current = report && name ? { name, facts: report.facts.slice(0, SCREEN_MAX_FACTS).map((fact) => fact.slice(0, SCREEN_FACT_MAX_CHARS)) } : undefined;
  changed();
}

/** The screen that has reported itself, if one has. */
export function currentScreen(): ScreenReport | undefined {
  return current;
}

/** For useSyncExternalStore: tells `listener` when the report changes. */
export function subscribeScreen(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A world reports itself while it is drawn: its name and facts, kept up to date, forgotten when it goes. */
export function useReportScreen(name: string, facts: readonly string[]): void {
  const key = JSON.stringify(facts);
  useEffect(() => {
    reportScreen({ name, facts: JSON.parse(key) as string[] });
    return () => reportScreen(null);
  }, [name, key]);
}

/** Opens the tutor, and keeps the screen it was asked from for the tutor's next request. False when the tutor cannot be opened. */
export function askTheTutor(open: (view: ViewId) => void): boolean {
  const from = current;
  const opened = openView('tutor', open);
  if (opened) carried = from;
  return opened;
}

/** What the tutor's next request adds to its context: the screen on show, else the one Ask came from (taken once). `{}` when none. */
export function screenContext(): { screen?: ScreenReport } {
  const screen = current ?? carried;
  carried = undefined;
  return screen ? { screen } : {};
}

/** Whether a screen has reported itself (for the Ask button). */
export function useScreenReported(): boolean {
  return useSyncExternalStore(subscribeScreen, () => current !== undefined);
}

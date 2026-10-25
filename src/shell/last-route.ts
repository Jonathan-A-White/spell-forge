// src/shell/last-route.ts: SpellForge reopens where he left off (M13). A phone call or a swipe away must not drop a
// child out of his drill: the route of the screen he is on, and the last 20 places he visited (the trail), are kept in
// localStorage, and a cold open rebuilds the browser's own history from them, so Back walks the trail as if he had never
// left. Every history entry carries its place in the trail (history.state.i); the trail is kept up to the entry he is on.
// A route that no longer exists is let go, and a reopen with nothing to go back to lands on the front door (Home).
import { HOME_VIEW, TRANSIENT_VIEWS, viewAtRoute, type ViewId } from './worlds';

const ROUTE_KEY = 'sf-last-route';
const TRAIL_KEY = 'sf-trail';

/** How many places are kept across a close. */
export const KEPT_PLACES = 20;
/** How many entries one page life holds in memory before the oldest are let go. */
const TRAIL_IN_MEMORY = 100;

/** The guard entry useBackButton keeps under the app so Back on Home does not leave it. */
const GUARD = '__guard__';

/** Places that need a choice made again (a profile, a word, a list, a result) or are a step of setting up: a reopen lands on the one before. */
const NOT_KEPT: readonly ViewId[] = [
  ...TRANSIENT_VIEWS,
  'onboarding', 'profile-select', 'word-detail', 'word-list-detail', 'list-editor', 'record-test-results', 'test-result-detail',
];

type EntryState = { sfView?: string; i?: number } | null;

function store(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** Whether a route is a screen that still exists and is somewhere to come back to. */
export function isKeptRoute(route: string): boolean {
  const entry = viewAtRoute(route);
  return !!entry && !NOT_KEPT.includes(entry.id as ViewId);
}

function entryState(): EntryState {
  return window.history.state as EntryState;
}

// The trail: the routes of this app's history entries, oldest first. `trail[i - base]` is the entry whose
// history.state.i is `i`; `cursor` is the entry he is on.
let trail: string[] = [];
let base = 0;
let cursor = -1;

/** The kept routes of the trail up to the entry he is on, in order, no two alike in a row. */
function keptTrail(): string[] {
  const kept: string[] = [];
  for (const route of trail.slice(0, cursor - base + 1)) {
    if (isKeptRoute(route) && route !== kept[kept.length - 1]) kept.push(route);
  }
  return kept.slice(-KEPT_PLACES);
}

function persistTrail(): void {
  try {
    store()?.setItem(TRAIL_KEY, JSON.stringify(keptTrail()));
  } catch {
    // Storage full or refused: a reopen has fewer places to walk back through.
  }
}

/** The trail as stored, a route that no longer exists let go. */
function readTrail(): string[] {
  try {
    const stored = JSON.parse(store()?.getItem(TRAIL_KEY) ?? 'null') as unknown;
    if (!Array.isArray(stored)) return [];
    return stored.filter((r): r is string => typeof r === 'string' && isKeptRoute(r)).slice(-KEPT_PLACES);
  } catch {
    return [];
  }
}

/** The route he was last at, or null when none was kept or the screen is gone. */
export function readLastRoute(): string | null {
  const saved = store()?.getItem(ROUTE_KEY) ?? null;
  return saved && isKeptRoute(saved) ? saved : null;
}

/**
 * Notes that the entry he is on shows `route` (the shell calls it on every move, after useBackButton has pushed the
 * entry): a new entry joins the trail and cuts any forward entries; one already numbered (Back, Forward, a replace)
 * only moves the cursor and the route.
 */
export function saveLastRoute(route: string): void {
  const state = entryState();
  let i: number;
  if (typeof state?.i === 'number') {
    i = state.i;
    if (trail.length === 0 || i < base || i - base >= trail.length) {
      // an entry from before this page's trail: it becomes the trail's start
      trail = [];
      base = i;
    }
  } else {
    i = cursor + 1;
    window.history.replaceState({ ...(state ?? {}), i }, '');
    if (i - base < trail.length) trail.length = i - base;
  }
  trail[i - base] = route;
  cursor = i;
  if (trail.length > TRAIL_IN_MEMORY) {
    trail.shift();
    base += 1;
  }
  persistTrail();
  if (isKeptRoute(route)) {
    try {
      store()?.setItem(ROUTE_KEY, route);
    } catch {
      // As above: he opens on Home, as before.
    }
  }
}

/** Starts the trail again (a new page life, or a test's). */
export function forgetTrail(): void {
  trail = [];
  base = 0;
  cursor = -1;
}

/**
 * Called once at boot. Returns the screen to open on: the last one he was at, else `fallback` (Home). The browser's history is
 * rebuilt from the kept trail (a guard, then each place, the last one current) so Back walks it, past the oldest
 * landing on the guard, which stays on Home. A reload or a remount (the history is still there, numbered) only
 * re-learns where in the trail he is.
 */
export function restoreLastRoute(fallback: ViewId = HOME_VIEW): ViewId {
  forgetTrail();
  let entries = readTrail();
  const legacy = readLastRoute();
  if (entries.length === 0 && legacy) entries = [legacy];
  if (entries.length === 0) return fallback;

  const here = entries[entries.length - 1];
  const view = viewAtRoute(here)!.id as ViewId;
  const state = entryState();
  if (typeof state?.i === 'number' && state.sfView !== GUARD) {
    trail = entries;
    cursor = state.i;
    base = cursor - (entries.length - 1);
    return view;
  }

  const path = window.location.pathname + window.location.search;
  window.history.replaceState({ sfView: GUARD, i: 0 }, '', path);
  entries.forEach((route, k) => {
    window.history.pushState({ sfView: viewAtRoute(route)!.id, i: k + 1 }, '', path);
  });
  trail = entries;
  base = 1;
  cursor = entries.length;
  return view;
}

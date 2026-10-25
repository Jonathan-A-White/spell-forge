// src/shell/worlds.ts: the four worlds and the route of every kept screen.
// One table: App.tsx's view switch, its back button and the tutor's "go" answer all read it,
// so a screen has one id, one world and one route, and a new screen is added here on purpose.
// The screens are drawn by src/shell/WorldSwitch.tsx, a world at a time.

export type WorldId = 'front-door' | 'spelling' | 'maths' | 'grown-ups';

export interface World {
  id: WorldId;
  title: string;
}

export const WORLDS: readonly World[] = [
  { id: 'front-door', title: 'Front door' },
  { id: 'spelling', title: 'Spelling' },
  { id: 'maths', title: 'Maths' },
  { id: 'grown-ups', title: 'Grown-ups' },
];

export interface ViewEntry {
  id: string;
  world: WorldId;
  /** Where the screen lives: /<world>/<screen>. */
  route: string;
}

function inWorld(world: WorldId, ids: readonly string[]): ViewEntry[] {
  return ids.map((id) => ({ id, world, route: `/${world}/${id}` }));
}

/** Every kept screen, in the order the old AppView listed them within each world. */
export const VIEWS = [
  ...inWorld('front-door', ['loading', 'db-blocked', 'onboarding', 'profile-select', 'home', 'tutor']),
  ...inWorld('spelling', [
    'progress', 'practice', 'practice-games', 'quiz', 'learning', 'list-editor', 'word-lists',
    'word-list-detail', 'word-detail', 'monster-stable', 'qr-import', 'coin-history',
    'practice-calendar', 'record-test-results', 'test-history', 'test-result-detail', 'trouble-words',
  ]),
  // Maths has no screen yet.
  ...inWorld('grown-ups', ['settings', 'feedback', 'share', 'about']),
] as const satisfies readonly ViewEntry[];

export type ViewId = (typeof VIEWS)[number]['id'];

export const HOME_VIEW: ViewId = 'home';

/** Screens that are a moment, not a place: never in history, never opened by a tutor "go". */
export const TRANSIENT_VIEWS: readonly ViewId[] = ['loading', 'db-blocked'];

const byId = new Map<string, ViewEntry>(VIEWS.map((v) => [v.id, v]));
const byRoute = new Map<string, ViewEntry>(VIEWS.map((v) => [v.route, v]));

export function viewRoute(id: ViewId): string {
  return byId.get(id)!.route;
}

export function viewWorld(id: ViewId): WorldId {
  return byId.get(id)!.world;
}

/** The screen at a route, or undefined for a route that no longer exists. */
export function viewAtRoute(route: string): ViewEntry | undefined {
  return byRoute.get(route);
}

/** The world a route is in, even a world with no screen yet (Maths); undefined when no world has the route. */
export function worldAtRoute(route: string): WorldId | undefined {
  const entry = byRoute.get(route);
  if (entry) return entry.world;
  const first = route.split('/')[1];
  return WORLDS.find((w) => w.id === first)?.id;
}

/** The screen a world opens on, the way the front door's tutor opens a world he chose; a world with no screen yet has none. */
export const WORLD_ENTRY: Readonly<Record<WorldId, ViewId | undefined>> = {
  'front-door': 'home',
  spelling: 'progress',
  maths: undefined,
  'grown-ups': 'settings',
};

/** Open a world by its id, on its entry screen (through openView); false for a world with no screen yet. */
export function openWorld(world: WorldId, open: (view: ViewId) => void): boolean {
  const entry = WORLD_ENTRY[world];
  return entry !== undefined && openView(entry, open);
}

/**
 * Open a screen by its id (or its route), the way a tutor "go" answer asks.
 * Calls `open` with the view id and returns true; an unknown id, a dropped screen or a
 * transient one opens nothing and returns false.
 */
export function openView(id: string, open: (view: ViewId) => void): boolean {
  const entry = byId.get(id) ?? byRoute.get(id);
  if (!entry || TRANSIENT_VIEWS.includes(entry.id as ViewId)) return false;
  open(entry.id as ViewId);
  return true;
}

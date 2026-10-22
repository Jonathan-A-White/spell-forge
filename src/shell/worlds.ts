// src/shell/worlds.ts: the four worlds and the route of every kept screen.
// One table: App.tsx's view switch, its back button and the tutor's "go" answer all read it,
// so a screen has one id, one world and one route, and a new screen is added here on purpose.
// The screens themselves have not moved yet (story 14 builds the worlds shell).

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

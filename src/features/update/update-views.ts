// src/features/update/update-views.ts: the screens that may show the update bar.
// An allow-list, so a screen added later shows no bar until someone decides it should.
const GROWN_UP_VIEWS: ReadonlySet<string> = new Set([
  'profile-select',
  'home',
  'progress',
  'word-lists',
  'word-list-detail',
  'word-detail',
  'settings',
  'feedback',
  'about',
  'monster-stable',
  'coin-history',
  'practice-calendar',
  'test-history',
  'test-result-detail',
  'trouble-words',
]);

export function updateBarShownOn(view: string): boolean {
  return GROWN_UP_VIEWS.has(view);
}

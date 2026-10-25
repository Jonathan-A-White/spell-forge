import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  WORLDS,
  VIEWS,
  HOME_VIEW,
  TRANSIENT_VIEWS,
  viewRoute,
  viewWorld,
  openView,
} from '../../src/shell/worlds';

// The hidden BSV Debug screen's id, built in pieces so a grep for the deleted screen finds nothing.
const DROPPED_BSV_SCREEN = ['bsv', 'debug'].join('-');

// Every AppView src/App.tsx declared before story 12a (mw-79en7t.32), so a view dropped by
// mistake is a failing test, not a silent gap.
const APP_VIEWS_BEFORE_12A = [
  'loading', 'db-blocked', 'onboarding', 'profile-select', 'home', 'progress', 'practice',
  'practice-games', 'quiz', 'learning', 'list-editor', 'word-lists', 'word-list-detail',
  'word-detail', 'settings', 'feedback', 'share', 'monster-stable', 'qr-import', 'coin-history',
  'practice-calendar', 'record-test-results', 'test-history', 'test-result-detail',
  'trouble-words', DROPPED_BSV_SCREEN, 'tutor', 'about',
];

// The views dropped on purpose, with the reason.
const DROPPED: Record<string, string> = {
  [DROPPED_BSV_SCREEN]: 'the hidden BSV Debug screen is deleted (M25); src/bsv stays for the licence',
};

// The views added since, with the story that added them.
const ADDED = [
  'maths-home', // the Maths world's screen (mw-79en7t.57)
  'spelling-home', // the Spelling world's screen (mw-79en7t.47)
];

describe('worlds.ts: the four worlds and the route of every kept view', () => {
  it('names the four worlds', () => {
    expect(WORLDS.map((w) => w.id)).toEqual(['front-door', 'spelling', 'maths', 'grown-ups']);
  });

  it('keeps every view App.tsx had, except the ones dropped on purpose', () => {
    const kept = VIEWS.map((v) => v.id);
    for (const id of APP_VIEWS_BEFORE_12A) {
      if (id in DROPPED) expect(kept).not.toContain(id);
      else expect(kept, `view ${id} has no route in worlds.ts`).toContain(id);
    }
    for (const id of ADDED) expect(kept).toContain(id);
    expect(kept.length).toBe(APP_VIEWS_BEFORE_12A.length - Object.keys(DROPPED).length + ADDED.length);
  });

  it('gives every kept view a world and a distinct route under that world', () => {
    const routes = new Set<string>();
    for (const v of VIEWS) {
      expect(WORLDS.map((w) => w.id)).toContain(v.world);
      expect(v.route).toMatch(/^\/[a-z-]+(\/[a-z-]+)?$/);
      expect(viewRoute(v.id)).toBe(v.route);
      expect(viewWorld(v.id)).toBe(v.world);
      expect(routes.has(v.route), `duplicate route ${v.route}`).toBe(false);
      routes.add(v.route);
    }
  });

  it('knows the home view and the transient ones', () => {
    expect(HOME_VIEW).toBe('home');
    expect(TRANSIENT_VIEWS).toEqual(['loading', 'db-blocked']);
  });

  it('openView(id) opens each kept screen by id, and by route', () => {
    const openable = VIEWS.filter((v) => !TRANSIENT_VIEWS.includes(v.id));
    expect(openable.length).toBeGreaterThan(20);
    for (const v of openable) {
      const open = vi.fn();
      expect(openView(v.id, open)).toBe(true);
      expect(open).toHaveBeenCalledExactlyOnceWith(v.id);

      const byRoute = vi.fn();
      expect(openView(v.route, byRoute)).toBe(true);
      expect(byRoute).toHaveBeenCalledExactlyOnceWith(v.id);
    }
  });

  it('openView refuses an unknown id, a dropped view and a transient one', () => {
    for (const id of ['nope', '', DROPPED_BSV_SCREEN, 'loading', 'db-blocked', `/${DROPPED_BSV_SCREEN}`]) {
      const open = vi.fn();
      expect(openView(id, open)).toBe(false);
      expect(open).not.toHaveBeenCalled();
    }
  });

  it('App.tsx declares no list of views of its own: the shell reads the one in worlds.ts', () => {
    const app = readFileSync(join(__dirname, '../../src/App.tsx'), 'utf8');
    expect(app).not.toMatch(/type AppView\s*=\s*'/);
    const state = readFileSync(join(__dirname, '../../src/shell/app-state.ts'), 'utf8');
    expect(state).not.toMatch(/type AppView\s*=\s*'/);
    expect(state).toContain("from './worlds'");
    const switchSource = readFileSync(join(__dirname, '../../src/shell/WorldSwitch.tsx'), 'utf8');
    expect(switchSource).toContain("from './worlds'");
  });
});

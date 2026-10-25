// mw-79en7t.67: where the app opens when nothing says where. With the Tutor on it is the door (worlds.ts WORLD_ENTRY['front-door']), with
// the Tutor off Home, so no child's app changes until the Tutor is switched on; a kept screen still wins (last-route.ts).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TUTOR_FLAG_STORAGE_KEY } from '../../src/debug';
import { DOOR_VIEW, isTutorView, landingView } from '../../src/shell/landing';
import { forgetTrail, restoreLastRoute } from '../../src/shell/last-route';

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  forgetTrail();
});
afterEach(() => localStorage.clear());

describe('where the app opens', () => {
  it('is Home with the Tutor off, and the door with it on', () => {
    expect(DOOR_VIEW).toBe('door');
    expect(landingView()).toBe('home');
    localStorage.setItem(TUTOR_FLAG_STORAGE_KEY, '1');
    expect(landingView()).toBe('door');
  });

  it('is what a reopen with nothing kept lands on, and a kept screen wins', () => {
    expect(restoreLastRoute('door')).toBe('door');
    localStorage.setItem('sf-last-route', '/spelling/progress');
    forgetTrail();
    expect(restoreLastRoute('door')).toBe('progress');
  });

  it('names the screens that only the Tutor has', () => {
    expect(isTutorView('door')).toBe(true);
    expect(isTutorView('tutor')).toBe(true);
    expect(isTutorView('home')).toBe(false);
  });
});

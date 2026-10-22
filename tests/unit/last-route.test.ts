import { beforeEach, describe, expect, it } from 'vitest';
import {
  KEPT_PLACES,
  forgetTrail,
  isKeptRoute,
  readLastRoute,
  restoreLastRoute,
  saveLastRoute,
} from '../../src/shell/last-route';
import { viewRoute } from '../../src/shell/worlds';

const TRAIL_KEY = 'sf-trail';
const savedTrail = (): string[] => JSON.parse(localStorage.getItem(TRAIL_KEY) ?? '[]');

/** What the shell does on a move: useBackButton pushes the entry, then the shell notes the place. */
const visit = (route: string) => {
  const sfView = route.split('/').pop();
  window.history.pushState({ sfView }, '', window.location.pathname);
  saveLastRoute(route);
};

/** A new page life: the browser's own history is gone, the phone's storage is not. */
const reopen = () => {
  forgetTrail();
  window.history.replaceState(null, '', window.location.pathname);
};

const goBack = () =>
  new Promise<string | undefined>((resolve) => {
    window.addEventListener('popstate', () => resolve((window.history.state as { sfView?: string } | null)?.sfView), { once: true });
    window.history.back();
  });

// The routes below are the real ones of src/shell/worlds.ts.
const PLACES = ['practice', 'word-lists', 'learning', 'settings', 'about', 'progress', 'quiz', 'practice-games', 'trouble-words', 'test-history'] as const;
const route = (id: (typeof PLACES)[number]) => viewRoute(id);

beforeEach(() => {
  localStorage.clear();
  reopen();
});

describe('reopen where he left off', () => {
  it('lands on the last address', () => {
    visit(viewRoute('home'));
    visit(route('practice'));
    visit(route('quiz'));
    expect(readLastRoute()).toBe(route('quiz'));

    reopen();
    expect(restoreLastRoute()).toBe('quiz');
  });

  it('opens on the front door when nothing was kept', () => {
    expect(restoreLastRoute()).toBe('home');
  });

  it('falls back to the front door when the route no longer exists', () => {
    localStorage.setItem('sf-last-route', '/spelling/a-screen-that-was-dropped');
    localStorage.setItem(TRAIL_KEY, JSON.stringify(['/spelling/a-screen-that-was-dropped']));
    expect(readLastRoute()).toBeNull();
    expect(restoreLastRoute()).toBe('home');
  });

  it('skips a dropped route in the trail and lands on the one before it', () => {
    localStorage.setItem(TRAIL_KEY, JSON.stringify([route('practice'), '/spelling/gone']));
    localStorage.setItem('sf-last-route', '/spelling/gone');
    expect(restoreLastRoute()).toBe('practice');
  });

  it('does not keep a moment (loading) or a place that needs a choice to be made again', () => {
    expect(isKeptRoute(viewRoute('loading'))).toBe(false);
    expect(isKeptRoute(viewRoute('db-blocked'))).toBe(false);
    expect(isKeptRoute(viewRoute('onboarding'))).toBe(false);
    expect(isKeptRoute(viewRoute('profile-select'))).toBe(false);
    expect(isKeptRoute(viewRoute('word-detail'))).toBe(false);
    expect(isKeptRoute(viewRoute('word-list-detail'))).toBe(false);
    expect(isKeptRoute(viewRoute('test-result-detail'))).toBe(false);
    expect(isKeptRoute(viewRoute('practice'))).toBe(true);
    expect(isKeptRoute(viewRoute('settings'))).toBe(true);
    expect(isKeptRoute(viewRoute('tutor'))).toBe(true);

    visit(route('practice'));
    visit(viewRoute('word-detail'));
    reopen();
    expect(restoreLastRoute()).toBe('practice');
  });
});

describe('the trail of places he visited', () => {
  it('keeps the last 20 and no more', () => {
    for (let n = 0; n < 30; n += 1) visit(route(PLACES[n % PLACES.length]));
    expect(savedTrail()).toHaveLength(KEPT_PLACES);
    expect(KEPT_PLACES).toBe(20);
  });

  it('drops repeats in a row', () => {
    visit(route('practice'));
    visit(route('practice'));
    visit(route('quiz'));
    visit(route('practice'));
    expect(savedTrail()).toEqual([route('practice'), route('quiz'), route('practice')]);
  });

  it('is kept only up to the place he is on, so Back from there is not undone', async () => {
    visit(route('practice'));
    visit(route('quiz'));
    visit(route('settings'));
    await goBack();
    saveLastRoute(route('quiz'));
    expect(savedTrail()).toEqual([route('practice'), route('quiz')]);
  });

  it('is walked by Back after a reopen, oldest last, then the guard', async () => {
    const order: string[] = [];
    for (let n = 0; n < 25; n += 1) {
      const id = PLACES[n % PLACES.length];
      visit(route(id));
      order.push(id);
    }
    const kept = order.slice(-KEPT_PLACES);

    reopen();
    expect(restoreLastRoute()).toBe(kept[kept.length - 1]);
    expect((window.history.state as { sfView?: string }).sfView).toBe(kept[kept.length - 1]);

    const walked: (string | undefined)[] = [];
    for (let n = 0; n < KEPT_PLACES - 1; n += 1) walked.push(await goBack());
    expect(walked).toEqual(kept.slice(0, -1).reverse());
    // past the oldest kept place the guard is under him
    expect(await goBack()).toBe('__guard__');
  });

  it('a reload (the history is still there) does not rebuild it', () => {
    visit(route('practice'));
    visit(route('quiz'));
    reopen();
    restoreLastRoute();
    const length = window.history.length;
    forgetTrail();
    expect(restoreLastRoute()).toBe('quiz');
    expect(window.history.length).toBe(length);
  });
});

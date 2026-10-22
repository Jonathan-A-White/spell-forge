// features/steps/share-target.steps.ts: runs features/share-target.feature. The worker half runs src/sw.ts in jsdom (tests/support/share-worker.ts);
// the page half renders the whole app at the address the worker redirects to.
import '@testing-library/react/dont-cleanup-after-each';
import { createElement } from 'react';
import { afterAll, beforeAll, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import App from '../../src/App';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { TUTOR_FLAG_STORAGE_KEY } from '../../src/debug';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { shareDb } from '../../src/share/share-store';
import { SHARE_TARGET_PATH, shareIdFromHash, takeShare } from '../../src/share/share-target';
import type { SharedItem } from '../../src/share/share-target';
import { answerTo, picture, post, startWorker, SCOPE } from '../../tests/support/share-worker';

vi.mock('workbox-precaching', () => ({ precacheAndRoute: vi.fn(), createHandlerBoundToURL: vi.fn() }));
vi.mock('workbox-routing', () => ({ registerRoute: vi.fn(), NavigationRoute: class {} }));

const feature = await loadFeature('features/share-target.feature');

let answer: Response | undefined;
let taken: SharedItem | undefined;
let redirectedTo = '';
let fetches: ReturnType<typeof vi.fn>;

beforeAll(startWorker);

// Each step is a test of its own, so the phone is reset once per scenario (BeforeEachScenario), not before every step.
const freshPhone = async (): Promise<void> => {
  cleanup();
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  answer = undefined;
  taken = undefined;
  redirectedTo = '';
  fetches = vi.fn(async () => new Response('{}'));
  vi.stubGlobal('fetch', fetches);
  // jsdom has no canvas (the themes draw on one) and no object URLs (the shared picture's thumbnail).
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
  URL.createObjectURL = vi.fn(() => 'blob:shared-picture');
  URL.revokeObjectURL = vi.fn();
  await Promise.all([db.delete(), shareDb.shares.clear()]);
  await db.open();
};

afterAll(() => {
  cleanup();
  vi.unstubAllGlobals();
  db.close();
  shareDb.close();
});

const sharedPicture = async (name: string): Promise<void> => {
  const form = new FormData();
  form.append('files', picture(name, [1, 2, 3]));
  answer = await answerTo(post(form));
  redirectedTo = answer?.headers.get('Location') ?? '';
};

const holdsProfile = () =>
  profileRepo.create({ name: 'Rowan', avatar: 'dragon-forge-1', themeId: 'dragon-forge', createdAt: new Date(), settings: { ...DEFAULT_SETTINGS }, status: 'active' });

/** The page the worker's redirect opens: the address after the scope. */
const openAtRedirect = (): void => {
  const to = new URL(redirectedTo);
  window.history.replaceState(null, '', `${to.pathname}${to.search}${to.hash}`);
  render(createElement(App));
};

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  BeforeEachScenario(freshPhone);

  Scenario('AC5: A picture and words shared from Photos are parked and the app opens at the tutor', ({ Given, When, Then, And }) => {
    Given('the service worker is running', () => undefined);
    When('Photos shares the picture "homework.png" with the title "Homework" and the words "Question 4" to SpellForge', async () => {
      const form = new FormData();
      form.append('files', picture('homework.png', [1, 2, 3]));
      form.append('title', 'Homework');
      form.append('text', 'Question 4');
      answer = await answerTo(post(form));
    });
    Then('the worker answers with a redirect to the tutor', () => {
      expect(answer?.status).toBe(303);
      expect(shareIdFromHash(new URL(answer?.headers.get('Location') ?? '').hash)).not.toBeNull();
    });
    And('one share waits holding the picture "homework.png" and the words "Homework" then "Question 4"', async () => {
      const rows = await shareDb.shares.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0].files.map((file) => file.name)).toEqual(['homework.png']);
      expect(rows[0].text).toBe('Homework\nQuestion 4');
    });
  });

  Scenario('AC5: The app takes the parked share once', ({ Given, And, When, Then }) => {
    Given('the service worker is running', () => undefined);
    And('Photos has shared the picture "homework.png" to SpellForge', () => sharedPicture('homework.png'));
    When('the app takes the share', async () => {
      taken = await takeShare(shareIdFromHash(new URL(redirectedTo).hash) ?? undefined);
    });
    Then('it holds the picture "homework.png"', () => {
      expect(taken?.pictures.map((file) => file.name)).toEqual(['homework.png']);
    });
    And('taking the share again finds nothing', async () => {
      expect(await takeShare(shareIdFromHash(new URL(redirectedTo).hash) ?? undefined)).toBeUndefined();
    });
  });

  Scenario('AC5: A share with nothing in it opens Home and parks nothing', ({ Given, When, Then, And }) => {
    Given('the service worker is running', () => undefined);
    When('Photos shares nothing to SpellForge', async () => {
      answer = await answerTo(post(new FormData()));
    });
    Then('the worker answers with a redirect to Home', () => {
      expect(answer?.status).toBe(303);
      expect(answer?.headers.get('Location')).toBe(SCOPE);
    });
    And('no share waits', async () => {
      expect(await shareDb.shares.count()).toBe(0);
    });
  });

  Scenario('AC5: Opening the share address is a page load, not a share', ({ Given, When, Then, And }) => {
    Given('the service worker is running', () => undefined);
    When('the share address is opened with a GET', async () => {
      answer = await answerTo(new Request(new URL(SHARE_TARGET_PATH, SCOPE).href));
    });
    Then('the worker leaves it to the app', () => {
      expect(answer).toBeUndefined();
    });
    And('no share waits', async () => {
      expect(await shareDb.shares.count()).toBe(0);
    });
  });

  Scenario("AC5: With the Tutor on, a shared picture waits on the tutor's start screen and is not sent", ({ Given, And, When, Then }) => {
    Given('the Tutor is on and the phone holds the profile "Rowan"', async () => {
      localStorage.setItem(TUTOR_FLAG_STORAGE_KEY, '1');
      await holdsProfile();
    });
    And('Photos has shared the picture "homework.png" to SpellForge', () => sharedPicture('homework.png'));
    When('SpellForge opens at the address the worker redirected to', openAtRedirect);
    Then('the Tutor shows the shared picture with "Send this picture" and "Not this one"', async () => {
      expect(await screen.findByRole('heading', { name: 'Tutor' })).toBeInTheDocument();
      expect(await screen.findByTestId('shared-picture')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send this picture' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Not this one' })).toBeInTheDocument();
    });
    And('nothing has been sent to the factory', async () => {
      expect(fetches.mock.calls.filter(([url]) => String(url).includes('postern'))).toEqual([]);
      expect(await db.tutorTurns.count()).toBe(0);
    });
  });

  Scenario('AC5: With the Tutor off, a shared picture opens Home and is dropped', ({ Given, And, When, Then }) => {
    Given('the phone holds the profile "Rowan"', () => holdsProfile());
    And('Photos has shared the picture "homework.png" to SpellForge', () => sharedPicture('homework.png'));
    When('SpellForge opens at the address the worker redirected to', openAtRedirect);
    Then('Home greets "Hey, Rowan!"', async () => {
      expect(await screen.findByRole('heading', { name: 'Hey, Rowan!' })).toBeInTheDocument();
    });
    And('no share waits', async () => {
      expect(await shareDb.shares.count()).toBe(0);
    });
  });
});

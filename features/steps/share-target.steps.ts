// features/steps/share-target.steps.ts: runs features/share-target.feature. The worker half runs src/sw.ts in jsdom (tests/support/share-worker.ts);
// the page half renders the whole app at the address the worker redirects to.
import '@testing-library/react/dont-cleanup-after-each';
import { createElement } from 'react';
import { afterAll, beforeAll, expect, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { PrivateKey } from '@bsv/sdk';
import { stop } from 'voice-kit/speech';
import { installSpeech, type SpeechFake } from 'voice-kit/testing/speech';
import { clips, installMic } from 'voice-kit/testing/mic';
import App from '../../src/App';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { TUTOR_FLAG_STORAGE_KEY } from '../../src/debug';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { FRONT_DOOR_TALKS_DB } from '../../src/features/front-door/front-door-flow';
import { sendGrist, type SendGristParams } from '../../src/grist';
import { shareDb } from '../../src/share/share-store';
import { SHARE_TARGET_PATH, shareIdFromHash, takeShare } from '../../src/share/share-target';
import type { SharedItem } from '../../src/share/share-target';
import { answerTo, picture, post, startWorker, SCOPE } from '../../tests/support/share-worker';
import { readAnswer } from '../../src/grist';

vi.mock('workbox-precaching', () => ({ precacheAndRoute: vi.fn(), createHandlerBoundToURL: vi.fn() }));
vi.mock('workbox-routing', () => ({ registerRoute: vi.fn(), NavigationRoute: class {} }));
// The factory's door: the front door's grist is sent and its answer read through these two, so the steps play the mill.
vi.mock('../../src/grist/factory', async (original) => ({
  ...(await original<typeof import('../../src/grist/factory')>()),
  sendGrist: vi.fn(),
  readAnswer: vi.fn(),
}));

const feature = await loadFeature('features/share-target.feature');

let answer: Response | undefined;
let taken: SharedItem | undefined;
let redirectedTo = '';
let fetches: ReturnType<typeof vi.fn>;
let speech: SpeechFake | undefined;
let mic: ReturnType<typeof installMic> | undefined;
const sent = vi.mocked(sendGrist);
const read = vi.mocked(readAnswer);

beforeAll(startWorker);

// Each step is a test of its own, so the phone is reset once per scenario (BeforeEachScenario), not before every step.
const freshPhone = async (): Promise<void> => {
  cleanup();
  act(() => stop());
  mic?.uninstall();
  speech?.uninstall();
  speech = undefined;
  mic = undefined;
  sent.mockReset();
  read.mockReset();
  await indexedDB.deleteDatabase(FRONT_DOOR_TALKS_DB);
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
  mic?.uninstall();
  speech?.uninstall();
  vi.unstubAllGlobals();
  db.close();
  shareDb.close();
});

const sharedPicture = async (name: string, words?: string): Promise<void> => {
  const form = new FormData();
  form.append('files', picture(name, [1, 2, 3]));
  if (words) form.append('text', words);
  answer = await answerTo(post(form));
  redirectedTo = answer?.headers.get('Location') ?? '';
};

/** The tutor's front door speaks and listens: voice-kit's honest fakes stand in for the phone's voice and microphone. */
const phoneWithVoice = async (): Promise<void> => {
  speech = installSpeech(window, { msPerWord: 1, baseMs: 1, voicesDelayMs: 1 });
  mic = installMic(window, { clip: clips.english, grantMs: 1, openMs: 1, silenceMs: 1 });
  await new Promise((resolve) => setTimeout(resolve, 20));
};

/** The device holds a key, as it does once the Grown-ups screen has made one. */
const holdsDeviceKey = async (): Promise<void> => {
  const key = PrivateKey.fromRandom();
  await db.bsvWallet.put({ id: 'key-1', kind: 'wif', network: 'testnet', material: key.toWif([0xef]), address: key.toAddress('testnet'), createdAt: new Date() });
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

  Scenario("AC3: With the Tutor on, a shared picture waits in the front door's talk and is not sent", ({ Given, And, When, Then }) => {
    Given('the Tutor is on and the phone holds the profile "Rowan"', async () => {
      localStorage.setItem(TUTOR_FLAG_STORAGE_KEY, '1');
      await phoneWithVoice();
      await holdsProfile();
    });
    And('Photos has shared the picture "homework.png" to SpellForge', () => sharedPicture('homework.png'));
    When('SpellForge opens at the address the worker redirected to', openAtRedirect);
    Then('the front door shows the shared picture with "Send this picture" and "Not this one"', async () => {
      expect(await screen.findByText(/Hello! I am your tutor/)).toBeInTheDocument();
      expect(await screen.findByTestId('shared-picture')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send this picture' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Not this one' })).toBeInTheDocument();
    });
    And('nothing has been sent to the factory', async () => {
      expect(sent).not.toHaveBeenCalled();
      expect(fetches.mock.calls.filter(([url]) => String(url).includes('postern'))).toEqual([]);
      expect(await db.tutorTurns.count()).toBe(0);
    });
  });

  Scenario("AC3: Tapping Send this picture lands the shared picture in the talk as the learner's turn", ({ Given, And, When, Then }) => {
    Given('the Tutor is on and the phone holds the profile "Rowan"', async () => {
      localStorage.setItem(TUTOR_FLAG_STORAGE_KEY, '1');
      await phoneWithVoice();
      await holdsProfile();
      await holdsDeviceKey();
    });
    And('Photos has shared the picture "homework.png" with the words "Question 4" to SpellForge', () => sharedPicture('homework.png', 'Question 4'));
    And('the factory answers the talk with "I can see your homework. Which question is the hard one?"', () => {
      sent.mockResolvedValue({ txid: `direct:${'ab'.repeat(32)}`, seq: 1, mill: 'cd'.repeat(33) });
      read.mockResolvedValue({
        answer: { status: 'answered', answer: { words: 'I can see your homework. Which question is the hard one?' } },
        next: 2,
      });
    });
    When('SpellForge opens at the address the worker redirected to', openAtRedirect);
    And('the learner taps "Send this picture"', async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Send this picture' }));
    });
    Then('the talk shows the learner\'s turn "Question 4" and the tutor\'s answer "I can see your homework. Which question is the hard one?"', async () => {
      expect(await screen.findByText('I can see your homework. Which question is the hard one?')).toBeInTheDocument();
      expect(screen.getByText('Question 4')).toBeInTheDocument();
      expect(screen.queryByTestId('shared-picture')).toBeNull();
    });
    And('one tutor-talk grist went to the factory carrying the picture "homework.png"', () => {
      expect(sent).toHaveBeenCalledTimes(1);
      const params = sent.mock.calls[0][0] as SendGristParams;
      expect(params.header).toMatchObject({ app: 'spellforge', kind: 'tutor-talk' });
      expect(params.input).toMatchObject({ message: 'Question 4', pictures: 1 });
      expect(params.files).toHaveLength(1);
    });
  });

  Scenario('AC3: A share lands on the door even when the app was last left on another screen', ({ Given, And, When, Then }) => {
    Given('the Tutor is on and the phone holds the profile "Rowan"', async () => {
      localStorage.setItem(TUTOR_FLAG_STORAGE_KEY, '1');
      await phoneWithVoice();
      await holdsProfile();
    });
    And("the app was last left on the Spelling world's progress screen", () => {
      localStorage.setItem('sf-last-route', '/spelling/progress');
    });
    And('Photos has shared the picture "homework.png" to SpellForge', () => sharedPicture('homework.png'));
    When('SpellForge opens at the address the worker redirected to', openAtRedirect);
    Then('the front door shows the shared picture with "Send this picture" and "Not this one"', async () => {
      expect(await screen.findByText(/Hello! I am your tutor/)).toBeInTheDocument();
      expect(await screen.findByTestId('shared-picture')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send this picture' })).toBeInTheDocument();
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

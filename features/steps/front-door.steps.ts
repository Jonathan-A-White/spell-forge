// features/steps/front-door.steps.ts: runs features/front-door.feature. The front door's screen is rendered in jsdom over the real flow
// (the talk kept in the talks store on fake-indexeddb), the tutor-talk grind a fake that answers the same words each time, and speech
// voice-kit's honest fake. What another app shared is parked in the real share store and taken as the app takes it at boot.
import '@testing-library/react/dont-cleanup-after-each';
import { createElement, useState } from 'react';
import { afterAll, expect, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { stop } from 'voice-kit/speech';
import { installSpeech, type SpeechFake } from 'voice-kit/testing/speech';
import { clips, installMic } from 'voice-kit/testing/mic';
import { createDexieStore, type DexieTalkStore } from 'voice-kit/talks/dexie';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { FRONT_DOOR_GREETING, FrontDoor } from '../../src/features/front-door/FrontDoor';
import { createFrontDoorFlow, type FrontDoorFlow, type TutorTalkSend } from '../../src/features/front-door/front-door-flow';
import { NO_LICENCE_LINE, setLicenceStatus } from '../../src/shell/licence-gate';
import { parkShare, shareDb } from '../../src/share/share-store';
import { takeShare } from '../../src/share/share-target';
import type { SharedItem } from '../../src/share/share-target';

const feature = await loadFeature('features/front-door.feature');

const CHECKED_AT = 1_760_000_000_000;
const SHARE_ID = 'share-1';
const TUTOR_SAYS = 'I can see your homework. Which question is the hard one?';

let speech: SpeechFake | undefined;
let mic: ReturnType<typeof installMic> | undefined;
let store: DexieTalkStore | undefined;
let storeCount = 0;
let send: ReturnType<typeof vi.fn<TutorTalkSend>>;
let flow: FrontDoorFlow;
let talk: string | undefined;
let profileId = '';
let parked = false;
// The talks the screen has started: the store is closed only after they are written.
let starting: Promise<string>[] = [];

// Each step is a test of its own, so the phone is reset once per scenario (BeforeEachScenario), not before every step.
const freshPhone = async (): Promise<void> => {
  cleanup();
  await Promise.allSettled(starting);
  starting = [];
  setLicenceStatus(undefined);
  stop();
  speech?.uninstall();
  mic?.uninstall();
  store?.close();
  localStorage.clear();
  parked = false;
  talk = undefined;
  speech = installSpeech(window, { msPerWord: 1, baseMs: 1, voicesDelayMs: 1 });
  mic = installMic(window, { clip: clips.english, grantMs: 1, openMs: 1, silenceMs: 1 });
  // jsdom has no object URLs (the shared picture's thumbnail).
  URL.createObjectURL = vi.fn(() => 'blob:shared-picture');
  URL.revokeObjectURL = vi.fn();
  db.close();
  await Promise.all([db.delete(), shareDb.shares.clear()]);
  await db.open();
  store = createDexieStore({ name: `front-door-feature-${++storeCount}`, indexedDB, IDBKeyRange });
  send = vi.fn<TutorTalkSend>(async () => ({ words: TUTOR_SAYS }));
};

afterAll(async () => {
  cleanup();
  await Promise.allSettled(starting);
  stop();
  speech?.uninstall();
  mic?.uninstall();
  store?.close();
  setLicenceStatus(undefined);
  db.close();
  shareDb.close();
});

const holdsProfile = async (_ctx: unknown, name: string): Promise<void> => {
  profileId = (await profileRepo.createLearner(name, 'dragon-forge', { ...DEFAULT_SETTINGS })).id;
  const real = createFrontDoorFlow({ send, store: store!, profileId, open: () => undefined, now: () => CHECKED_AT });
  flow = {
    ...real,
    start: () => {
      const started = real.start();
      starting.push(started);
      return started;
    },
  };
};

const sharedWith = (_ctx: unknown, name: string, words: string): Promise<void> => {
  parked = true;
  return parkShare({ id: SHARE_ID, createdAt: CHECKED_AT, text: words, files: [{ name, type: 'image/png', bytes: new Uint8Array([1, 2, 3]).buffer }] });
};

/** The screen the way the app draws it: the share it was given is dropped when it is sent or turned away. */
function Door({ shared }: { shared: SharedItem | null }) {
  const [waiting, setWaiting] = useState(shared);
  return createElement(FrontDoor, { flow, open: () => undefined, shared: waiting, onSharedUsed: () => setWaiting(null) });
}

/** Opens the door the way the app boots: the share is taken once (a second boot finds nothing) and handed to the screen. */
const openDoor = async (): Promise<void> => {
  cleanup();
  const shared = parked ? ((await takeShare(SHARE_ID)) ?? null) : null;
  render(createElement(Door, { shared }));
};

const tap = (_ctx: unknown, label: string): void => {
  fireEvent.click(screen.getByRole('button', { name: label }));
};

const nothingSent = (): void => {
  expect(send).not.toHaveBeenCalled();
};

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  BeforeEachScenario(freshPhone);

  Scenario("AC2: The tutor greets by voice and there is no keyboard", ({ Given, When, Then, And }) => {
    Given('the phone holds the profile {string}', holdsProfile);
    When('the front door opens', openDoor);
    Then("the tutor's greeting is spoken", async () => {
      await waitFor(() => expect(speech!.spoken().join(' ')).toBe(FRONT_DOOR_GREETING));
    });
    And('there is a bar to hold to talk and a camera, and no place to type', async () => {
      expect(await screen.findByRole('button', { name: 'Hold to talk' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Take a photo' })).toBeInTheDocument();
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(document.querySelector('textarea, input[type="text"]')).toBeNull();
    });
  });

  Scenario('AC2: A shared picture and words wait in the talk and land once they are sent', ({ Given, And, When, Then }) => {
    Given('the phone holds the profile {string}', holdsProfile);
    And('Photos has shared the picture {string} with the words {string} to SpellForge', sharedWith);
    When('the front door opens with what was shared', openDoor);
    Then('the shared picture waits with {string} and {string}', async (_ctx, yes: string, no: string) => {
      expect(await screen.findByTestId('shared-picture')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: yes })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: no })).toBeInTheDocument();
    });
    And('nothing has been sent to the tutor', nothingSent);
    When('he taps {string}', tap);
    Then('the tutor was sent {string} with the picture {string}', async (_ctx, words: string, name: string) => {
      await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
      const [request, files] = send.mock.calls[0];
      expect(request.message).toBe(words);
      expect(request.pictures).toBe(1);
      expect(files.map((file) => file.name)).toEqual([name]);
    });
    And("the tutor's answer is drawn and spoken", async () => {
      expect(await screen.findByText(TUTOR_SAYS)).toBeInTheDocument();
      await waitFor(() => expect(speech!.spoken().join(' ')).toContain(TUTOR_SAYS));
      expect(screen.queryByTestId('shared-picture')).toBeNull();
    });
    And("the talk is kept with his turn and the tutor's answer", async () => {
      talk = (await store!.list()).at(-1)?.id;
      const kept = await store!.get(talk!);
      expect(kept?.turns.map(({ role, text }) => ({ role, text }))).toEqual([
        { role: 'user', text: 'Question 4' },
        { role: 'assistant', text: TUTOR_SAYS },
      ]);
    });
  });

  Scenario('AC2: A shared picture that is not wanted is dropped and nothing is sent', ({ Given, And, When, Then }) => {
    Given('the phone holds the profile {string}', holdsProfile);
    And('Photos has shared the picture {string} with the words {string} to SpellForge', sharedWith);
    When('the front door opens with what was shared', openDoor);
    And('he taps {string}', tap);
    Then('the shared picture is gone', () => {
      expect(screen.queryByTestId('shared-picture')).toBeNull();
    });
    And('nothing has been sent to the tutor', nothingSent);
  });

  Scenario('AC2: A share lands once and opening the front door again does not land it again', ({ Given, And, When, Then }) => {
    Given('the phone holds the profile {string}', holdsProfile);
    And('Photos has shared the picture {string} with the words {string} to SpellForge', sharedWith);
    When('the front door opens with what was shared', openDoor);
    And('he taps {string}', tap);
    And('the front door opens again', async () => {
      await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
      await act(async () => openDoor());
    });
    Then('no shared picture waits', async () => {
      expect(await screen.findByRole('button', { name: 'Hold to talk' })).toBeInTheDocument();
      expect(screen.queryByTestId('shared-picture')).toBeNull();
      expect(await shareDb.shares.count()).toBe(0);
    });
    And('the tutor was asked once', () => {
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  Scenario('AC2: Words shared with no picture wait to be sent too', ({ Given, And, When, Then }) => {
    Given('the phone holds the profile {string}', holdsProfile);
    And('Photos has shared the words {string} to SpellForge', async (_ctx, words: string) => {
      parked = true;
      await parkShare({ id: SHARE_ID, createdAt: CHECKED_AT, text: words, files: [] });
    });
    When('the front door opens with what was shared', openDoor);
    Then('the shared words wait with {string} and {string}', async (_ctx, yes: string, no: string) => {
      expect(await screen.findByTestId('shared-words')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: yes })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: no })).toBeInTheDocument();
      nothingSent();
    });
    When('he taps {string}', tap);
    Then('the tutor was sent {string} with no picture', async (_ctx, words: string) => {
      await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
      const [request, files] = send.mock.calls[0];
      expect(request.message).toBe(words);
      expect(request.pictures).toBeUndefined();
      expect(files).toEqual([]);
    });
  });

  Scenario('AC2: If the tutor cannot answer, the shared picture stays to be sent again', ({ Given, And, When, Then }) => {
    Given('the phone holds the profile {string}', holdsProfile);
    And('Photos has shared the picture {string} with the words {string} to SpellForge', sharedWith);
    And('the tutor cannot answer just now', () => {
      send.mockRejectedValue(new Error('offline'));
    });
    When('the front door opens with what was shared', openDoor);
    And('he taps {string}', tap);
    Then('he is told to try again', async () => {
      expect(await screen.findByText(/could not answer just now/)).toBeInTheDocument();
    });
    And('the shared picture waits with {string} and {string}', async (_ctx, yes: string, no: string) => {
      expect(await screen.findByTestId('shared-picture')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: yes })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: no })).toBeInTheDocument();
      expect(screen.queryByText('Question 4')).toBeInTheDocument();
    });
  });

  Scenario('AC2: With no licence the tutor is asleep and a share is not sent', ({ Given, And, When, Then }) => {
    Given('the phone holds the profile {string}', holdsProfile);
    And('Photos has shared the picture {string} with the words {string} to SpellForge', sharedWith);
    And('the phone has no licence', () => {
      setLicenceStatus({ state: 'none', checkedAt: '2026-10-24T10:00:00Z' });
    });
    When('the front door opens with what was shared', openDoor);
    Then('the worlds are offered as big pictures', () => {
      expect(screen.getByText(NO_LICENCE_LINE)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Spelling' })).toBeInTheDocument();
      expect(screen.queryByTestId('shared-picture')).toBeNull();
      expect(screen.queryByRole('textbox')).toBeNull();
    });
    And('nothing has been sent to the tutor', nothingSent);
  });
});

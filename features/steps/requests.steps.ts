// features/steps/requests.steps.ts: runs features/requests.feature. The front door is rendered in jsdom over the real flow (the talk
// kept in the talks store on fake-indexeddb), the tutor-talk grind a fake that answers with or without maker_request, and the
// grind that carries a request to the maker a fake sender; requests are kept as the app keeps them, in localStorage through
// @pwa-kit/requests. Grown-ups' Requests screen is rendered over the same requests. What another app shared is the way a turn is
// sent without a microphone (the tap on Send these words). Speech is voice-kit's honest fake.
import '@testing-library/react/dont-cleanup-after-each';
import { createElement, useState } from 'react';
import { afterAll, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { GROWN_UP, type MakerRequest } from 'pwa-kit/requests';
import { stop } from 'voice-kit/speech';
import { installSpeech, type SpeechFake } from 'voice-kit/testing/speech';
import { createDexieStore, type DexieTalkStore } from 'voice-kit/talks/dexie';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { FrontDoor } from '../../src/features/front-door/FrontDoor';
import { createFrontDoorFlow, type FrontDoorFlow, type TutorTalkSend } from '../../src/features/front-door/front-door-flow';
import {
  EXPECTED_ASKS,
  MakerRequestError,
  Requests as RequestsScreen,
  createMakerRequests,
  sendToMaker,
  type ExpectedAsk,
} from '../../src/features/requests';
import { setLicenceStatus } from '../../src/shell/licence-gate';
import { parkShare, shareDb } from '../../src/share/share-store';
import { takeShare } from '../../src/share/share-target';

const feature = await loadFeature('features/requests.feature');

const NOW = 1_760_000_000_000;
const SHARE_ID = 'share-1';
const SEND = 'Send this to the maker';

let speech: SpeechFake | undefined;
let store: DexieTalkStore | undefined;
let storeCount = 0;
let send: ReturnType<typeof vi.fn<TutorTalkSend>>;
let flow: FrontDoorFlow;
let profileId = '';
let makerSend: ReturnType<typeof vi.fn<(request: MakerRequest) => Promise<{ id: string }>>>;
let makerDown = false;
let asked: ExpectedAsk | undefined;
let parked = false;
let starting: Promise<string>[] = [];

const requests = () => createMakerRequests({ send: (request) => makerSend(request), appVersion: '0.1.0', now: () => NOW });

// Each step is a test of its own, so the phone is reset once per scenario (BeforeEachScenario), not before every step.
const freshPhone = async (): Promise<void> => {
  cleanup();
  await Promise.allSettled(starting);
  starting = [];
  setLicenceStatus(undefined);
  stop();
  speech?.uninstall();
  store?.close();
  localStorage.clear();
  parked = false;
  asked = undefined;
  makerDown = false;
  speech = installSpeech(window, { msPerWord: 1, baseMs: 1, voicesDelayMs: 1 });
  db.close();
  await Promise.all([db.delete(), shareDb.shares.clear()]);
  await db.open();
  store = createDexieStore({ name: `requests-feature-${++storeCount}`, indexedDB, IDBKeyRange });
  send = vi.fn<TutorTalkSend>(async () => ({ words: 'Thanks. Tell me more.' }));
  let sent = 0;
  makerSend = vi.fn(async (request: MakerRequest) => {
    if (makerDown) throw new MakerRequestError('The request could not be sent just now. Tap Send again.');
    sent += 1;
    return { id: `${request.reference}-${sent}` };
  });
};

afterAll(async () => {
  cleanup();
  await Promise.allSettled(starting);
  stop();
  speech?.uninstall();
  store?.close();
  setLicenceStatus(undefined);
  db.close();
  shareDb.close();
});

const holdsProfile = async (_ctx: unknown, name: string): Promise<void> => {
  profileId = (await profileRepo.createLearner(name, 'dragon-forge', { ...DEFAULT_SETTINGS })).id;
  const real = createFrontDoorFlow({ send, store: store!, profileId, open: () => undefined, now: () => NOW });
  flow = {
    ...real,
    start: () => {
      const started = real.start();
      starting.push(started);
      return started;
    },
  };
};

const sharedWords = async (_ctx: unknown, words: string): Promise<void> => {
  parked = true;
  await parkShare({ id: SHARE_ID, createdAt: NOW, text: words, files: [] });
};

function Door({ shared }: { shared: Awaited<ReturnType<typeof takeShare>> | null }) {
  const [waiting, setWaiting] = useState(shared);
  return createElement(FrontDoor, {
    flow,
    open: () => undefined,
    shared: waiting,
    onSharedUsed: () => setWaiting(null),
    maker: { requests: requests(), who: profileId },
  });
}

const openDoor = async (): Promise<void> => {
  cleanup();
  const shared = parked ? ((await takeShare(SHARE_ID)) ?? null) : null;
  render(createElement(Door, { shared }));
};

const tap = (_ctx: unknown, label: string): void => {
  fireEvent.click(screen.getByRole('button', { name: label }));
};

const asksFor = async (who: string, words: string, askId?: string): Promise<void> => {
  await sendToMaker(requests(), { talkId: `talk-${words.length}`, words, summary: words }, who, askId);
};

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  BeforeEachScenario(freshPhone);

  Scenario('AC1: The tutor offers to pass on what the app cannot do and one tap sends one request', ({ Given, And, When, Then }) => {
    Given('the phone holds the profile {string}', holdsProfile);
    And('the tutor says the app cannot read a book aloud and offers to pass it on', () => {
      send.mockResolvedValue({ words: 'The app cannot read a book aloud yet. Shall I pass that on to the maker?', maker_request: { summary: 'Read a maths book aloud' } });
    });
    And('Photos has shared the words {string} to SpellForge', sharedWords);
    When('the front door opens with what was shared', openDoor);
    And('he taps {string}', tap);
    Then('the tutor offers {string}', async (_ctx, label: string) => {
      expect(await screen.findByRole('button', { name: label })).toBeInTheDocument();
    });
    And('nothing has been sent to the maker', () => {
      expect(makerSend).not.toHaveBeenCalled();
    });
    When('he taps {string}', tap);
    Then('one request was sent to the maker with his words and his id', async () => {
      await waitFor(() => expect(makerSend).toHaveBeenCalledTimes(1));
      expect(makerSend.mock.calls[0][0]).toMatchObject({
        kind: 'tutor-ask',
        text: 'Can you read my maths book out loud to me?',
        summary: 'Read a maths book aloud',
        who: profileId,
      });
      expect(await requests().list()).toHaveLength(1);
    });
    And('he is told it was sent', async () => {
      expect(await screen.findByText(/^Sent\./)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: SEND })).toBeNull();
    });
  });

  Scenario('AC1: An answer that offers nothing shows no Send button', ({ Given, And, When, Then }) => {
    Given('the phone holds the profile {string}', holdsProfile);
    And('the tutor answers with no offer', () => {
      send.mockResolvedValue({ words: 'Tell me more about that question.' });
    });
    And('Photos has shared the words {string} to SpellForge', sharedWords);
    When('the front door opens with what was shared', openDoor);
    And('he taps {string}', tap);
    Then("the tutor's answer is drawn", async () => {
      expect(await screen.findByText('Tell me more about that question.')).toBeInTheDocument();
    });
    And('the tutor offers no {string}', (_ctx, label: string) => {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    });
  });

  Scenario('AC1: If the request cannot be sent he is told and may tap again', ({ Given, And, When, Then }) => {
    Given('the phone holds the profile {string}', holdsProfile);
    And('the tutor says the app cannot read a book aloud and offers to pass it on', () => {
      send.mockResolvedValue({ words: 'The app cannot read a book aloud yet. Shall I pass that on to the maker?', maker_request: { summary: 'Read a maths book aloud' } });
    });
    And('the maker cannot be reached', () => {
      makerDown = true;
    });
    And('Photos has shared the words {string} to SpellForge', sharedWords);
    When('the front door opens with what was shared', openDoor);
    And('he taps {string}', tap);
    Then('the tutor offers {string}', async (_ctx, label: string) => {
      expect(await screen.findByRole('button', { name: label })).toBeInTheDocument();
    });
    When('he taps {string}', tap);
    Then('he is told it was not sent', async () => {
      expect(await screen.findByRole('alert')).toHaveTextContent(/could not be sent/);
      expect(await requests().list()).toEqual([]);
    });
    And('the tutor offers {string}', async (_ctx, label: string) => {
      expect(await screen.findByRole('button', { name: label })).toBeEnabled();
    });
  });

  Scenario('AC4: Requests lists who asked and where each stands', ({ Given, And, When, Then }) => {
    Given('the phone holds the profile {string}', holdsProfile);
    And('Rowan asked the maker for {string}', (_ctx, words: string) => asksFor(profileId, words));
    And('a grown-up asked the maker for {string}', (_ctx, words: string) => asksFor(GROWN_UP, words));
    When('Grown-ups opens Requests', async () => {
      cleanup();
      render(createElement(RequestsScreen, { requests: requests(), names: { [profileId]: 'Rowan' }, onAsk: (ask: ExpectedAsk) => (asked = ask), onBack: () => undefined }));
      await screen.findByRole('heading', { name: 'Rowan' });
    });
    Then('the requests are listed under {string} and {string}', (_ctx, child: string, grownUp: string) => {
      expect(screen.getByRole('heading', { name: child })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: grownUp })).toBeInTheDocument();
    });
    And('{string} and {string} both stand at {string}', (_ctx, first: string, second: string, status: string) => {
      for (const words of [first, second]) {
        const row = screen.getByText(words).closest('li');
        expect(row).not.toBeNull();
        expect(within(row as HTMLElement).getByText(status)).toBeInTheDocument();
      }
    });
  });

  Scenario('AC4: Requests lists the expected asks and picking one goes to the tutor', ({ Given, And, When, Then }) => {
    Given('the phone holds the profile {string}', holdsProfile);
    And('Rowan asked the maker for {string} as the expected ask {string}', (_ctx, words: string, title: string) =>
      asksFor(profileId, words, EXPECTED_ASKS.find((ask) => ask.title === title)?.id),
    );
    When('Grown-ups opens Requests', async () => {
      cleanup();
      render(createElement(RequestsScreen, { requests: requests(), names: { [profileId]: 'Rowan' }, onAsk: (ask: ExpectedAsk) => (asked = ask), onBack: () => undefined }));
      await screen.findByRole('heading', { name: 'Rowan' });
    });
    Then('the expected asks are listed', () => {
      const list = screen.getByRole('list', { name: 'Things people ask for' });
      expect(within(list).getAllByRole('listitem')).toHaveLength(EXPECTED_ASKS.length);
    });
    And('the expected ask {string} says it was asked and stands at {string}', (_ctx, title: string, status: string) => {
      const row = within(screen.getByRole('list', { name: 'Things people ask for' })).getByText(title).closest('li') as HTMLElement;
      expect(row).toHaveTextContent('Asked');
      expect(row).toHaveTextContent(status);
    });
    When('he picks the expected ask {string}', (_ctx, title: string) => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(title) }));
    });
    Then('the tutor is opened to talk about {string}', (_ctx, title: string) => {
      expect(asked?.title).toBe(title);
    });
  });
});

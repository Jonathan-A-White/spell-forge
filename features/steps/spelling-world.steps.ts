// features/steps/spelling-world.steps.ts: runs features/spelling-world.feature, the Spelling world. The whole app is rendered in jsdom; a
// stand-in button plays the tutor's "go" answer (the world has no Home card yet). The real games are drawn: the clock is pinned (only
// Date is faked) so the flow's seed, and so the game it opens, is the same on every run. Nothing touches the network: a picture is
// "kept" by writing it where the picture module looks first, so no grind is asked.
import '@testing-library/react/dont-cleanup-after-each';
import { createElement } from 'react';
import { afterAll, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { Shell } from '../../src/shell/Shell';
import { AppProvider } from '../../src/shell/app-context';
import { useApp } from '../../src/shell/app-state';
import { setLicenceStatus } from '../../src/shell/licence-gate';
import { currentScreen } from '../../src/shell/report-screen';
import { db } from '../../src/data/db';
import { coinRepo, learningProgressRepo, profileRepo, wordListRepo, wordRepo } from '../../src/data/repositories';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { SPELLING_NODES } from '../../src/learn/spelling';

const feature = await loadFeature('features/spelling-world.feature');

const NOW = new Date('2026-10-25T09:00:00Z');
const PICTURE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="48" r="30" fill="#c33"/></svg>';
const PLACEMENT_LIMIT = 60;
const PLACEMENT_LINE = /Let's see what you know/;

let profileId = '';

// Each step is a test of its own, so the phone is reset once per scenario (BeforeEachScenario), not before every step.
const freshPhone = async (): Promise<void> => {
  cleanup();
  vi.useRealTimers();
  setLicenceStatus(undefined);
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  // jsdom has no canvas; the themes and some games draw on one.
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
  await db.delete();
  await db.open();
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
};

afterAll(() => {
  cleanup();
  vi.useRealTimers();
  setLicenceStatus(undefined);
  vi.unstubAllGlobals();
  db.close();
});

/** Stands in for the tutor: a "go" answer reaches the shell as an id. */
function TutorGo({ id }: { id: string }) {
  const { go } = useApp();
  return createElement('button', { onClick: () => go(id) }, `tutor goes to ${id}`);
}

/** The app, opened: Home greets the child before a scenario goes anywhere (the boot lands on Home when it has the profile). */
async function renderApp(): Promise<void> {
  render(
    createElement(AppProvider, null, createElement(Shell), ...['spelling-home', 'practice-games'].map((id) => createElement(TutorGo, { id, key: id }))),
  );
  await screen.findByRole('heading', { name: /^Hey, / });
}

const holdProfile = async (_ctx: unknown, name: string): Promise<void> => {
  const profile = await profileRepo.create({
    name,
    avatar: 'dragon-forge-1',
    themeId: 'dragon-forge',
    createdAt: new Date(),
    settings: { ...DEFAULT_SETTINGS },
    status: 'active',
  });
  profileId = profile.id;
};

const tutorGoes = async (_ctx: unknown, id: string): Promise<void> => {
  fireEvent.click(await screen.findByText(`tutor goes to ${id}`));
};

const screenShown = async (_ctx: unknown, heading: string): Promise<void> => {
  expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
};

/** Which of a placement question's two spellings is the word (the other is the node's distractor for it). */
function rightSpelling(first: string, second: string): string {
  for (const node of SPELLING_NODES) {
    for (const item of node.items) {
      if ((item.word === first && item.distractor === second) || (item.word === second && item.distractor === first)) return item.word;
    }
  }
  throw new Error(`neither ${first} nor ${second} is a word and its distractor in the spelling graph`);
}

/** The two spellings on screen: the buttons of the pick, which are not the "Hear the word" button. */
function spellings(): [string, string] {
  const hear = screen.getByRole('button', { name: 'Hear the word' });
  const names = [...(hear.nextElementSibling?.querySelectorAll('button') ?? [])].map((b) => b.textContent ?? '');
  expect(names).toHaveLength(2);
  return [names[0], names[1]];
}

const tapSpelling = async (right: boolean): Promise<void> => {
  const hear = await screen.findByRole('button', { name: 'Hear the word' });
  expect(hear).toBeInTheDocument();
  const [a, b] = spellings();
  const word = rightSpelling(a, b);
  fireEvent.click(screen.getByRole('button', { name: right ? word : word === a ? b : a }));
};

const settled = () => waitFor(() => expect(screen.queryByText('One moment...')).toBeNull());

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  BeforeEachScenario(freshPhone);

  Scenario("AC1: A child's first time in Spelling starts by finding out what they know", ({ Given, When, And, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    When('SpellForge opens', renderApp);
    And('the tutor says go to {string}', tutorGoes);
    Then('the screen {string} is shown', screenShown);
    And('Spelling says {string}', async (_ctx, line: string) => {
      expect(await screen.findByText(new RegExp(line))).toBeInTheDocument();
    });
    And('the child can hear the word and choose between two spellings', async () => {
      expect(await screen.findByRole('button', { name: 'Hear the word' })).toBeInTheDocument();
      expect(spellings()).toHaveLength(2);
      expect(screen.queryByRole('textbox')).toBeNull();
    });
  });

  Scenario('AC1: A word spelt wrong is met with the word and a way on', ({ Given, When, And, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    When('SpellForge opens', renderApp);
    And('the tutor says go to {string}', tutorGoes);
    And('the child taps the wrong spelling', () => tapSpelling(false));
    Then('Spelling says {string}', async (_ctx, line: string) => {
      expect(await screen.findByText(new RegExp(line))).toBeInTheDocument();
    });
    And('there is a {string} button', async (_ctx, name: string) => {
      expect(await screen.findByRole('button', { name })).toBeInTheDocument();
    });
  });

  const overThePlacement = async (): Promise<void> => {
    await screen.findByText(PLACEMENT_LINE);
    for (let asked = 0; asked < PLACEMENT_LIMIT; asked++) {
      await settled();
      if (!screen.queryByText(PLACEMENT_LINE)) return;
      await tapSpelling(true);
      fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    }
    throw new Error(`the placement was not over after ${PLACEMENT_LIMIT} questions`);
  };

  const aGameIsOpen = async (): Promise<void> => {
    await settled();
    await waitFor(() => expect(currentScreen()?.facts).toContain('Learning something new'));
    expect(screen.queryByText('All done for today. Come back later for more.')).toBeNull();
    expect(screen.queryByText(PLACEMENT_LINE)).toBeNull();
  };

  Scenario("AC1: After the placement a drill plays with the pattern's picture beside it", ({ Given, When, And, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    And('the phone keeps a picture for every pattern', async () => {
      for (const node of SPELLING_NODES) await db.mnemonicPictures.put({ nodeId: node.id, svg: PICTURE, createdAt: NOW });
    });
    When('SpellForge opens', renderApp);
    And('the tutor says go to {string}', tutorGoes);
    And('the child spells every word right until the placement is over', overThePlacement);
    Then("a game is open with the pattern's picture beside it", async () => {
      await aGameIsOpen();
      expect(await screen.findByTestId('mnemonic-picture')).toBeInTheDocument();
    });
    And('the placement question is gone', () => {
      expect(screen.queryByText(PLACEMENT_LINE)).toBeNull();
    });
  });

  Scenario('AC1: A drill with no picture kept shows no picture', ({ Given, When, And, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    When('SpellForge opens', renderApp);
    And('the tutor says go to {string}', tutorGoes);
    And('the child spells every word right until the placement is over', overThePlacement);
    Then('a game is open', aGameIsOpen);
    And('there is no picture beside it', () => {
      expect(screen.queryByTestId('mnemonic-picture')).toBeNull();
    });
  });

  Scenario('AC1: A game in Practice Games takes a coin', ({ Given, When, And, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    And('the child holds 1 coin and words to play', async () => {
      const list = await wordListRepo.create({
        profileId,
        name: 'Week 1',
        language: 'en',
        testDate: null,
        createdAt: NOW,
        source: 'manual',
        active: true,
        archived: false,
      });
      for (const text of ['cat', 'dog', 'sun']) {
        const word = await wordRepo.create({ listId: list.id, profileId, text, phonemes: [], syllables: [], patterns: [], imageUrl: null, imageCached: false, createdAt: NOW });
        await learningProgressRepo.save({
          id: `${profileId}:${word.id}`,
          profileId,
          wordId: word.id,
          wordListId: list.id,
          stage: 3,
          consecutiveSuccesses: 2,
          consecutiveFailures: 0,
          mastered: true,
          totalAttempts: 3,
          totalErrors: 0,
          lastAttemptAt: NOW,
          createdAt: NOW,
        });
      }
      await coinRepo.addCoins(profileId, 1);
    });
    When('SpellForge opens', renderApp);
    And('the tutor says go to {string}', tutorGoes);
    And('{string} is chosen in Practice Games', async (_ctx, game: string) => {
      fireEvent.click(await screen.findByRole('button', { name: new RegExp(game) }));
    });
    Then('Practice Games asks {string}', async (_ctx, question: string) => {
      expect(await screen.findByText(question)).toBeInTheDocument();
    });
    When('{string} is tapped', async (_ctx, label: string) => {
      fireEvent.click(await screen.findByRole('button', { name: label }));
    });
    Then('the child holds {int} coins', async (_ctx, coins: number) => {
      await waitFor(async () => expect((await coinRepo.get(profileId))?.coins).toBe(coins));
    });
  });
});

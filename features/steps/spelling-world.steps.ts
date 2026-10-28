// features/steps/spelling-world.steps.ts: runs features/spelling-world.feature, the Spelling world. The whole app is rendered in jsdom; a
// stand-in button plays the tutor's "go" answer (the world has no Home card yet). The real games are drawn: the clock is pinned (only
// Date is faked) so the flow's seed, and so the game it opens, is the same on every run. Nothing touches the network: a picture is
// "kept" by writing it where the picture module looks first, so no grind is asked.
import '@testing-library/react/dont-cleanup-after-each';
import { createElement } from 'react';
import { afterAll, expect, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { Shell } from '../../src/shell/Shell';
import { AppProvider } from '../../src/shell/app-context';
import { useApp } from '../../src/shell/app-state';
import { setLicenceStatus } from '../../src/shell/licence-gate';
import { currentScreen } from '../../src/shell/report-screen';
import { db } from '../../src/data/db';
import { coinRepo, learningProgressRepo, profileRepo, wordListRepo, wordRepo } from '../../src/data/repositories';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { MemoryFreshStore, MemoryStockStore, type FreshStore, type Stock } from 'learn-kit/fresh';
import { memoryStore, validate, type Graph } from 'learn-kit/graph';
import { createSpellingAsk } from '../../src/grist/spelling-items';
import { spellingStock } from '../../src/learn/fresh-store';
import { SPELLING_NODES, spellingNode, type SpellingItem, type SpellingNode } from '../../src/learn/spelling';
import { SpellingWorld } from '../../src/worlds/spelling/SpellingWorld';
import { createSpellingFlow, memoryKeep, type SpellingFlow } from '../../src/worlds/spelling/spelling-flow';

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

// The pattern of the AC4 scenarios: seven words, so after the placement's two and a round of three there are two he has not met, and the preK rule of 3 right out of 4.
const SEVEN = ['edge', 'judge', 'bridge', 'badge', 'ledge', 'fudge', 'hedge'];
let flow: SpellingFlow;
let ledger: FreshStore;

/** A game that ends the way the scenario says: a button for each count of words right, and the words it was given. */
const stubGame = (_form: string, items: readonly { word: string }[], ctx: { onComplete: (r: { correct: number; total: number }) => void }) =>
  createElement(
    'div',
    null,
    createElement('p', { 'data-testid': 'round-words' }, items.map((i) => i.word).join(',')),
    ...Array.from({ length: items.length + 1 }, (_, n) => createElement('button', { key: n, type: 'button', onClick: () => ctx.onComplete({ correct: n, total: items.length }) }, `Finish with ${n} right`)),
  );

async function onFivePattern(): Promise<void> {
  const pattern = spellingNode({ id: 'dge-seven', band: 'preK', name: 'Words with dge', items: SEVEN.map((w) => [w, 'dge', w.replace('dge', 'ge')] as const) });
  ledger = new MemoryFreshStore();
  flow = createSpellingFlow({ store: memoryStore(), keep: memoryKeep(), fresh: ledger, graph: validate([pattern]) as never, now: () => NOW.getTime(), seed: 3 });
  for (let q = await flow.question(); q && q.stage === 'placement'; q = await flow.question()) await flow.answer({ correct: 0, total: 1 });
  await act(async () => void render(createElement(SpellingWorld, { flow, openGame: stubGame as never })));
  await screen.findByTestId('round-words');
}

/** The seven words all met, a stock over a stubbed mill that writes `written` (or is out of reach), and the world past its placement on that pattern. */
let stock: Stock<SpellingItem>;
let mill: ReturnType<typeof vi.fn>;

async function onMetPattern(written: readonly string[], connected: boolean): Promise<void> {
  const pattern = spellingNode({ id: 'dge-seven', band: 'preK', name: 'Words with dge', items: SEVEN.map((w) => [w, 'dge', w.replace('dge', 'ge')] as const) });
  const graph = validate([pattern]);
  ledger = new MemoryFreshStore({ asked: [['dge-seven', SEVEN]] });
  mill = vi.fn().mockResolvedValue({ words: written.map((word) => ({ word, sentence: `We saw the ${word} today.` })) });
  const ask = createSpellingAsk({ mill, online: () => connected, graph: graph as unknown as Graph<SpellingNode> });
  stock = spellingStock({ ask, fresh: ledger, store: new MemoryStockStore<SpellingItem>() });
  flow = createSpellingFlow({ store: memoryStore(), keep: memoryKeep(), fresh: ledger, stock, graph: graph as never, now: () => NOW.getTime(), seed: 3 });
  for (let q = await flow.question(); q && q.stage === 'placement'; q = await flow.question()) await flow.answer({ correct: 0, total: 1 });
  await act(async () => void render(createElement(SpellingWorld, { flow, openGame: stubGame as never })));
  await screen.findByTestId('round-words');
}

const roundWords = async (): Promise<string[]> => (await screen.findByTestId('round-words')).textContent!.split(',');

async function finishRound(right: number): Promise<void> {
  await act(async () => void fireEvent.click(screen.getByRole('button', { name: `Finish with ${right} right` })));
  await screen.findByRole('status');
}

async function nextRound(): Promise<void> {
  await act(async () => void fireEvent.click(await screen.findByRole('button', { name: 'Next' })));
  await screen.findByTestId('round-words');
}

const statusSays = async (line: string): Promise<void> => {
  expect(await screen.findByRole('status')).toHaveTextContent(line);
};

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
  Scenario('AC4: A round missed and then spelt right again is no proof, the pattern is solid only on words he has not met', ({ Given, When, Then }) => {
    Given('a Spelling world on a pattern of 7 words that needs 3 right out of 4, past its placement', onFivePattern);
    When('the child finishes the round with 1 word right', () => finishRound(1));
    Then('Spelling says "You spelt 1 of 3 right"', () => statusSays('You spelt 1 of 3 right'));
    When('"Next" is tapped', nextRound);
    Then('the next round has 2 words the child has not met and 1 he has', async () => {
      const words = await roundWords();
      const met = await ledger.getAsked('dge-seven');
      expect(words.filter((w) => !met.includes(w))).toHaveLength(2);
      expect(words.filter((w) => met.includes(w))).toHaveLength(1);
    });
    When('the child finishes the round with all 3 words right', () => finishRound(3));
    Then('Spelling says "You have got this one"', () => statusSays('You have got this one'));
  });

  Scenario('AC4: A pattern whose words are all met is not solid on them', ({ Given, And, When, Then }) => {
    Given('a Spelling world on a pattern of 7 words that needs 3 right out of 4, past its placement', onFivePattern);
    And('the child has met all 7 words', async () => {
      await ledger.putAsked('dge-seven', SEVEN);
      cleanup();
      await act(async () => void render(createElement(SpellingWorld, { flow, openGame: stubGame as never })));
      await screen.findByTestId('round-words');
    });
    When('the child finishes 4 rounds in a row with every word right', async () => {
      for (let i = 0; i < 4; i += 1) {
        await finishRound(3);
        await statusSays('Well done');
        if (i < 3) await nextRound();
      }
    });
    Then('Spelling does not say "You have got this one"', () => {
      expect(screen.queryByText(/You have got this one/)).toBeNull();
    });
  });

  const sayingNothingNew = () => expect(screen.queryByText(/You have got this one/)).toBeNull();

  Scenario('AC3: A pattern whose words are all met gets fresh words written ahead, and a fresh right goes solid', ({ Given, And, When, Then }) => {
    Given('a Spelling world on a pattern of 7 words that needs 3 right out of 4, all met, with a mill that writes nudge, wedge and smudge', () => onMetPattern(['nudge', 'wedge', 'smudge'], true));
    Then('Spelling says "New words are on their way"', async () => {
      expect(await screen.findByTestId('new-words-note')).toHaveTextContent('New words are on their way');
    });
    And('the round has 3 words the child has met', async () => {
      const words = await roundWords();
      expect(words).toHaveLength(3);
      expect(words.every((w) => SEVEN.includes(w))).toBe(true);
    });
    When("the mill's words have arrived", () => stock.settle());
    And('the child finishes the round with all 3 words right', () => finishRound(3));
    Then('Spelling does not say "You have got this one"', sayingNothingNew);
    When('"Next" is tapped', nextRound);
    Then('the next round is nudge, wedge and smudge', async () => {
      expect(await roundWords()).toEqual(['nudge', 'wedge', 'smudge']);
    });
    And('Spelling does not say "New words are on their way"', () => {
      expect(screen.queryByTestId('new-words-note')).toBeNull();
    });
    When('the child finishes the round with all 3 words right', () => finishRound(3));
    Then('Spelling says "You have got this one"', () => statusSays('You have got this one'));
  });

  Scenario('AC3: With no connection the words it has serve, nothing waits and nothing is asked', ({ Given, And, When, Then }) => {
    Given('a Spelling world on a pattern of 7 words that needs 3 right out of 4, all met, with no connection to the mill', () => onMetPattern(['nudge', 'wedge', 'smudge'], false));
    Then('Spelling says "New words are on their way"', async () => {
      expect(await screen.findByTestId('new-words-note')).toHaveTextContent('New words are on their way');
    });
    And('the round has 3 words the child has met', async () => {
      const words = await roundWords();
      expect(words).toHaveLength(3);
      expect(words.every((w) => SEVEN.includes(w))).toBe(true);
    });
    And('the mill is not asked', async () => {
      await stock.settle();
      expect(mill).not.toHaveBeenCalled();
    });
    When('the child finishes the round with all 3 words right', () => finishRound(3));
    Then('Spelling does not say "You have got this one"', sayingNothingNew);
  });
});

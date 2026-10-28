// features/steps/maths-world.steps.ts: runs features/maths-world.feature, the Maths world. The whole app is rendered for the first scenario (a
// stand-in button plays the tutor's "go" answer, the world has no Home card yet); the others draw the world, or the homework picture, on its
// own so that a scenario can name the form a problem is put in. Nothing touches the network: a picture is "kept" by writing it where the
// picture module looks first, so no grind is asked.
import '@testing-library/react/dont-cleanup-after-each';
import { createElement } from 'react';
import { afterAll, expect, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { memoryStore, validate } from 'learn-kit/graph';
import { Shell } from '../../src/shell/Shell';
import { AppProvider } from '../../src/shell/app-context';
import { useApp } from '../../src/shell/app-state';
import { setLicenceStatus } from '../../src/shell/licence-gate';
import { db } from '../../src/data/db';
import { profileRepo, tutorRepo } from '../../src/data/repositories';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { MATHS_NODES, PROBLEM_KIND_NODES, mathsNode, wrongAnswerFor } from '../../src/learn/maths';
import { MathsWorld } from '../../src/worlds/maths/MathsWorld';
import { Homework } from '../../src/worlds/maths/homework';
import { canDo, type MathsFormId } from '../../src/worlds/maths/drill-forms';
import { createMathsFlow, memoryKeep, type MathsFlow } from '../../src/worlds/maths/maths-flow';

const feature = await loadFeature('features/maths-world.feature');

const NOW = new Date('2026-10-25T09:00:00Z');
const PICTURE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="48" r="30" fill="#c33"/></svg>';
const HOMEWORK = PROBLEM_KIND_NODES[1].problems[1];

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

const holdProfile = async (_ctx: unknown, name: string): Promise<void> => {
  await profileRepo.create({
    name,
    avatar: 'dragon-forge-1',
    themeId: 'dragon-forge',
    createdAt: new Date(),
    settings: { ...DEFAULT_SETTINGS },
    status: 'active',
  });
};

/** The app, opened: Home greets the child before a scenario goes anywhere (the boot lands on Home when it has the profile). */
async function renderApp(): Promise<void> {
  render(createElement(AppProvider, null, createElement(Shell), createElement(TutorGo, { id: 'maths-home' })));
  await screen.findByRole('heading', { name: /^Hey, / });
}

const tutorGoes = async (_ctx: unknown, id: string): Promise<void> => {
  fireEvent.click(await screen.findByText(`tutor goes to ${id}`));
};

const screenShown = async (_ctx: unknown, heading: string): Promise<void> => {
  expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
};

let flow: MathsFlow;

const newFlow = (seed = 3): MathsFlow => createMathsFlow({ store: memoryStore(), keep: memoryKeep(), now: () => NOW.getTime(), seed });

/** A child who gets every placement question right, so what follows is the frontier (the placement shows no pictures). */
async function pastThePlacement(over: MathsFlow): Promise<void> {
  for (let q = await over.question(); q && q.stage === 'placement'; q = await over.question()) await over.answer(q.item.answer);
}

/** The world on its own over a flow, its problems all put in one form; its first problem has arrived. */
async function worldIn(form: MathsFormId, over: MathsFlow): Promise<void> {
  flow = over;
  await act(async () => void render(createElement(MathsWorld, { flow, forms: [form] })));
  await screen.findByText((await flow.question())!.item.problem);
}

const keepPictures = async (): Promise<void> => {
  for (const node of MATHS_NODES) await db.mnemonicPictures.put({ nodeId: node.id, svg: PICTURE, createdAt: NOW });
};

const boxForTheAnswer = () => expect(screen.getByLabelText('Your answer')).toBeInTheDocument();

/** The problems the child has been given in this scenario, in order (a problem he meets again is listed once). */
let met: string[] = [];

/** Types an answer into the box and taps "Check". */
async function answerOnScreen(answer: string): Promise<void> {
  const q = (await flow.question())!;
  if (!met.includes(q.item.problem)) met.push(q.item.problem);
  fireEvent.change(await screen.findByLabelText('Your answer'), { target: { value: answer } });
  await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Check' })));
  await screen.findByRole('status');
}

const nextTapped = async (): Promise<void> => {
  await act(async () => void fireEvent.click(await screen.findByRole('button', { name: 'Next' })));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Next' })).toBeNull());
};

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  BeforeEachScenario(freshPhone);

  Scenario("AC2: A child's first time in Maths starts by finding out what they know", ({ Given, When, And, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    When('SpellForge opens', renderApp);
    And('the tutor says go to {string}', tutorGoes);
    Then('the screen {string} is shown', screenShown);
    And('Maths says {string}', async (_ctx, line: string) => {
      expect(await screen.findByText(new RegExp(line))).toBeInTheDocument();
    });
    And('there is a problem with a box for the answer and a {string} button', async (_ctx, name: string) => {
      expect(await screen.findByLabelText('Your answer')).toBeInTheDocument();
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
      expect(screen.queryByText('One moment...')).toBeNull();
    });
  });

  Scenario('AC2: A problem can be heard', ({ Given, Then, And }) => {
    Given('a Maths world that puts every problem to be heard', () => worldIn('hear', newFlow()));
    Then('there is a {string} button', (_ctx, name: string) => {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    });
    And('there is a box for the answer', boxForTheAnswer);
  });

  Scenario('AC2: A problem can be seen', ({ Given, Then, And }) => {
    Given('a Maths world that puts every problem to be seen', () => worldIn('see', newFlow()));
    Then('the problem is drawn as a picture', async () => {
      const q = (await flow.question())!;
      expect(screen.getByRole('img', { name: q.item.problem })).toBeInTheDocument();
    });
    And('there is a box for the answer', boxForTheAnswer);
  });

  Scenario('AC2: A problem can be done with number tiles', ({ Given, When, Then }) => {
    Given('a Maths world that puts every problem to be done', async () => {
      // a seed whose first problem has an answer the tiles can build
      let seed = 3;
      while (!canDo((await newFlow(seed).question())!.item)) seed += 1;
      await worldIn('do', newFlow(seed));
      expect(screen.getByTestId('answer-zone')).toBeInTheDocument();
    });
    When('the child taps the tiles of the right answer and then {string}', async (_ctx, button: string) => {
      const answer = (await flow.question())!.item.answer.trim();
      for (const tile of answer) fireEvent.click(screen.getByRole('button', { name: tile }));
      await waitFor(() => expect(screen.getByTestId('answer-zone')).toHaveTextContent(answer));
      await act(async () => void fireEvent.click(screen.getByRole('button', { name: button })));
    });
    Then('Maths says {string}', async (_ctx, line: string) => {
      expect(await screen.findByRole('status')).toHaveTextContent(new RegExp(line));
    });
  });

  Scenario("AC2: After the placement a concept's picture sits beside the problem", ({ Given, And, Then }) => {
    Given('a Maths world past its placement', async () => {
      const over = newFlow();
      await pastThePlacement(over);
      flow = over;
    });
    And('the phone keeps a picture for every concept', keepPictures);
    Then("a problem is shown with the concept's picture beside it", async () => {
      await act(async () => void render(createElement(MathsWorld, { flow, forms: ['type'] })));
      const q = (await flow.question())!;
      expect(q.stage).not.toBe('placement');
      await screen.findByText(q.item.problem);
      expect(await screen.findByTestId('mnemonic-picture')).toBeInTheDocument();
    });
  });

  Scenario('AC2: A concept with no picture kept shows no picture', ({ Given, Then }) => {
    Given('a Maths world past its placement', async () => {
      const over = newFlow();
      await pastThePlacement(over);
      flow = over;
    });
    Then('a problem is shown with no picture beside it', async () => {
      // no licence, so the picture module makes no call and keeps nothing
      setLicenceStatus({ state: 'none', checkedAt: Date.now() } as never);
      await act(async () => void render(createElement(MathsWorld, { flow, forms: ['type'] })));
      await screen.findByText((await flow.question())!.item.problem);
      expect(screen.queryByTestId('mnemonic-picture')).toBeNull();
    });
  });

  Scenario("AC2: A homework picture shows its concept's picture", ({ Given, And, Then }) => {
    Given('a homework problem the maths graph knows', () => undefined);
    And('the phone keeps a picture for every concept', keepPictures);
    Then("the homework problem is shown with the concept's picture", async () => {
      const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated', problemKind: 'word', targetText: HOMEWORK });
      await act(async () => {
        render(createElement(Homework, { session, targetText: HOMEWORK, turns: [], deps: { say: async () => undefined }, onFinished: () => undefined }));
      });
      expect(screen.getByText(HOMEWORK)).toBeInTheDocument();
      expect(await screen.findByTestId('mnemonic-picture')).toBeInTheDocument();
    });
  });
  Scenario('AC4: A problem missed and then answered right again is no proof, the concept is solid only on new problems', ({ Given, When, Then }) => {
    Given('a Maths world on a concept that needs 3 right out of 4, past its placement', async () => {
      // one concept that makes a new problem for every index, so the child can always be given one he has not met
      const concept = mathsNode({ id: 'adding-one', band: 'preK', name: 'Adding one', item: (i) => [`What is ${i} + 1?`, String(i + 1), 'Count on one.'], solid: { right: 3, of: 4 } });
      flow = createMathsFlow({ store: memoryStore(), keep: memoryKeep(), graph: validate([concept]) as never, now: () => NOW.getTime(), seed: 3 });
      for (let q = await flow.question(); q && q.stage === 'placement'; q = await flow.question()) await flow.answer(wrongAnswerFor(q.item));
      met = [];
      await act(async () => void render(createElement(MathsWorld, { flow, forms: ['type'] })));
      await screen.findByText((await flow.question())!.item.problem);
    });
    When('the child answers the problem wrong', async () => {
      await answerOnScreen(wrongAnswerFor((await flow.question())!.item));
    });
    Then('Maths says "Not quite yet"', async () => {
      expect(await screen.findByRole('status')).toHaveTextContent('Not quite yet');
    });
    When('"Next" is tapped', nextTapped);
    When('the child goes on with "Next"', nextTapped);
    Then('the same problem is asked again', async () => {
      const q = (await flow.question())!;
      expect(q.item.problem).toBe(met[0]);
      await screen.findByText(q.item.problem);
    });
    When('the child answers it right', async () => {
      await answerOnScreen((await flow.question())!.item.answer);
    });
    Then('a different problem is asked', async () => {
      const q = (await flow.question())!;
      expect(met).not.toContain(q.item.problem);
      await screen.findByText(q.item.problem);
    });
    When('the child answers {int} different problems right, one after another', async (_ctx, count: number) => {
      for (let i = 0; i < count; i += 1) {
        const q = (await flow.question())!;
        expect(met).not.toContain(q.item.problem);
        await screen.findByText(q.item.problem);
        await answerOnScreen(q.item.answer);
        expect(await screen.findByRole('status')).toHaveTextContent('Right! Well done.');
        await nextTapped();
      }
    });
    Then('Maths does not say "You have got this one"', async () => {
      const q = (await flow.question())!;
      await screen.findByText(q.item.problem);
      expect(screen.queryByText(/You have got this one/)).toBeNull();
    });
    Then('Maths says "Right! Well done."', async () => {
      expect(await screen.findByRole('status')).toHaveTextContent('Right! Well done.');
    });
    Then('Maths says "You have got this one"', async () => {
      expect(await screen.findByRole('status')).toHaveTextContent('You have got this one');
    });
    When('the child answers one more different problem right', async () => {
      const q = (await flow.question())!;
      expect(met).not.toContain(q.item.problem);
      await answerOnScreen(q.item.answer);
    });
  });
});

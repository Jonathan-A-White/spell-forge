// features/steps/grown-ups.steps.ts: runs features/grown-ups.feature, the Grown-ups world. The PIN gate and the Licence section are
// rendered on their own (the licence check and the device key are fakes: nothing here reaches the chain); Who is learning and Settings
// are reached through the whole app in jsdom, as a child's phone reaches them; How is it going is drawn from progress it is handed.
import '@testing-library/react/dont-cleanup-after-each';
import { createElement } from 'react';
import { afterAll, expect, vi } from 'vitest';
import { PrivateKey } from '@bsv/sdk';
import type { licence } from 'bsv-kit/bsv';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { frontierOf, order } from 'learn-kit/graph';
import { Shell } from '../../src/shell/Shell';
import { AppProvider } from '../../src/shell/app-context';
import { licenceState, setLicenceStatus } from '../../src/shell/licence-gate';
import { STORE_URL } from '../../src/shell/store';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { setParentPin } from '../../src/features/tutor/parent-pin';
import { GrownUps } from '../../src/worlds/grown-ups/GrownUps';
import { HowIsItGoing } from '../../src/worlds/grown-ups/HowIsItGoing';
import { Licence } from '../../src/worlds/grown-ups/Licence';
import { NOTHING_YET } from '../../src/worlds/grown-ups/describe-learner';
import { spellingGraph } from '../../src/learn/spelling';
import { storageGraphStore } from '../../src/worlds/spelling';

const feature = await loadFeature('features/grown-ups.feature');

const CHECKED_AT = '2026-10-25T10:00:00Z';
const HELD: licence.LicenceStatus = { state: 'held', outpoint: { txid: 'ab', vout: 0 }, collection: 'spell-forge', checkedAt: CHECKED_AT };
const NONE: licence.LicenceStatus = { state: 'none', checkedAt: CHECKED_AT };

let licenceFound: licence.LicenceStatus = NONE;
let solidSkills = 0;
let drillsLastWeek = 0;

// Each step is a test of its own, so the phone is reset once per scenario (BeforeEachScenario), not before every step.
const freshPhone = async (): Promise<void> => {
  cleanup();
  setLicenceStatus(undefined);
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  licenceFound = NONE;
  solidSkills = 0;
  drillsLastWeek = 0;
  // jsdom has no canvas; the themes draw on one.
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
  await db.delete();
  await db.open();
};

afterAll(() => {
  cleanup();
  setLicenceStatus(undefined);
  vi.unstubAllGlobals();
  db.close();
});

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

const holdProfiles = async (_ctx: unknown, first: string, second: string): Promise<void> => {
  await holdProfile(_ctx, first);
  await holdProfile(_ctx, second);
};

const openApp = (): void => {
  render(createElement(AppProvider, null, createElement(Shell)));
};

const screenShown = async (_ctx: unknown, heading: string): Promise<void> => {
  expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
};

const tappedOnHome = async (_ctx: unknown, label: string): Promise<void> => {
  fireEvent.click(await screen.findByRole('button', { name: label }));
};

const firstLineIs = (_ctx: unknown, line: string): void => {
  expect(screen.getByTestId('first-line').textContent).toBe(line);
};

// --- the PIN gate ---

const typePin = (digits: string): void => {
  for (const digit of digits) fireEvent.click(screen.getByRole('button', { name: digit }));
};

const choosePin = async (_ctx: unknown, pin: string): Promise<void> => {
  await setParentPin(pin, 'What is your favourite meal?', 'pasta');
};

const opensGrownUps = async (): Promise<void> => {
  const [profile] = await profileRepo.getActive();
  render(createElement(GrownUps, { profileId: profile.id, onExit: () => undefined }));
};

const typesPin = async (_ctx: unknown, pin: string): Promise<void> => {
  await screen.findByRole('heading', { name: 'Enter your PIN' });
  typePin(pin);
};

const grownUpsOpen = async (): Promise<void> => {
  expect(await screen.findByRole('heading', { name: 'Grown-ups' })).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: 'Licence' })).toBeInTheDocument();
};

// --- the Licence section ---

const holdsNoLicenceYet = (): void => {
  expect(licenceState()).toBe('unknown');
};

const licenceCheckFinds = (found: licence.LicenceStatus) => (): void => {
  licenceFound = found;
};

const opensLicence = (): void => {
  const key = PrivateKey.fromRandom();
  render(createElement(Licence, { getKey: async () => key, check: async () => licenceFound }));
};

const buyTapped = async (_ctx: unknown, label: string): Promise<void> => {
  fireEvent.click(screen.getByRole('button', { name: label }));
};

const noLink = async (_ctx: unknown, name: string): Promise<void> => {
  await screen.findByRole('button', { name: 'licensed' });
  expect(screen.queryByRole('link', { name })).toBeNull();
};

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  BeforeEachScenario(freshPhone);

  Scenario('AC1: The Grown-ups screen asks for a PIN the first time', ({ Given, When, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    When('the grown-up opens Grown-ups', opensGrownUps);
    Then('the PIN pad asks {string}', screenShown);
  });

  Scenario('AC1: Choosing a PIN and a question opens Grown-ups', ({ Given, When, And, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    When('the grown-up opens Grown-ups', opensGrownUps);
    And(
      'the grown-up chooses the PIN {string} and the question {string} with the answer {string}',
      async (_ctx, pin: string, question: string, answer: string) => {
        typePin(pin);
        await screen.findByRole('heading', { name: 'Type it again' });
        typePin(pin);
        await screen.findByRole('heading', { name: 'Pick a question' });
        fireEvent.change(screen.getByLabelText('Question'), { target: { value: question } });
        fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: answer } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      },
    );
    Then('the Grown-ups screen opens with the Licence section', grownUpsOpen);
  });

  Scenario('AC1: A PIN already chosen is asked for again', ({ Given, And, When, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    And('the grown-up has chosen the PIN {string}', choosePin);
    When('the grown-up opens Grown-ups', opensGrownUps);
    And('the grown-up types the PIN {string}', typesPin);
    Then('the PIN pad says {string}', async (_ctx, line: string) => {
      expect((await screen.findByRole('alert')).textContent).toBe(line);
    });
    And('the Grown-ups screen has not opened', () => {
      expect(screen.queryByRole('heading', { name: 'Grown-ups' })).toBeNull();
    });
  });

  Scenario('AC1: The right PIN opens Grown-ups', ({ Given, And, When, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    And('the grown-up has chosen the PIN {string}', choosePin);
    When('the grown-up opens Grown-ups', opensGrownUps);
    And('the grown-up types the PIN {string}', typesPin);
    Then('the Grown-ups screen opens with the Licence section', grownUpsOpen);
  });

  Scenario('AC1: Who is learning shows each learner and what the tutor knows of them', ({ Given, When, Then, And }) => {
    Given('a phone that holds the profiles {string} and {string}', holdProfiles);
    When('SpellForge opens', openApp);
    Then('the screen {string} is shown', screenShown);
    And('the learners {string} and {string} are listed, the tutor knowing nothing of them yet', (_ctx, first: string, second: string) => {
      for (const name of [first, second]) {
        const learner = screen.getByRole('button', { name: new RegExp(`^${name}`) });
        expect(learner).toHaveTextContent(NOTHING_YET);
      }
    });
    And('the first line is {string}', firstLineIs);
  });

  Scenario('AC1: Tapping a learner on Who is learning opens Home for them', ({ Given, When, And, Then }) => {
    Given('a phone that holds the profiles {string} and {string}', holdProfiles);
    When('SpellForge opens', openApp);
    And('the learner {string} is tapped', async (_ctx, name: string) => {
      fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${name}`) }));
    });
    Then('Home greets {string}', async (_ctx, greeting: string) => {
      expect(await screen.findByRole('heading', { name: greeting })).toBeInTheDocument();
    });
  });

  Scenario('AC1: How is it going shows each subject in plain words', ({ Given, When, Then, And }) => {
    Given('a learner who is solid on {number} spelling skills and did {number} spelling drills last week', (_ctx, skills: number, drills: number) => {
      solidSkills = Number(skills);
      drillsLastWeek = Number(drills);
    });
    When('the grown-up opens How is it going', () => {
      const solid = new Set(order(spellingGraph).slice(0, solidSkills));
      render(createElement(HowIsItGoing, { spelling: { solid, drillsLastWeek } }));
    });
    Then('the Spelling section shows the skills that are solid and the {number} drills', (_ctx, drills: number) => {
      const solid = new Set(order(spellingGraph).slice(0, solidSkills));
      const section = within(screen.getByRole('region', { name: 'Spelling' }));
      expect(section.getByTestId('solid-count').textContent).toContain(`${solidSkills} skills`);
      for (const node of frontierOf(spellingGraph, solid).slice(0, 3)) expect(section.getByText(node.name)).toBeInTheDocument();
      expect(section.getByTestId('last-week').textContent).toContain(`${Number(drills)} drills`);
    });
    And('the Maths section says there is nothing to show yet', () => {
      const section = within(screen.getByRole('region', { name: 'Maths' }));
      expect(section.getByTestId('no-data').textContent).toMatch(/nothing to show for maths yet/i);
    });
  });

  Scenario('AC2: The Grown-ups home draws How is it going', ({ Given, And, When, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    And('the grown-up has chosen the PIN {string}', choosePin);
    And('the learner is solid on {number} spelling skills', async (_ctx, skills: number) => {
      const [profile] = await profileRepo.getActive();
      const store = storageGraphStore(profile.id);
      for (const id of order(spellingGraph).slice(0, Number(skills))) await store.put(id, { level: 'solid', since: Date.now(), how: 'drill' });
    });
    When('the grown-up opens Grown-ups', opensGrownUps);
    And('the grown-up types the PIN {string}', typesPin);
    Then('the Grown-ups home shows How is it going', async () => {
      await grownUpsOpen();
      expect(await screen.findByRole('heading', { name: 'How is it going?' })).toBeInTheDocument();
    });
    And('its Spelling section shows {number} skills solid', async (_ctx, skills: number) => {
      const section = within(await screen.findByRole('region', { name: 'Spelling' }));
      expect((await section.findByTestId('solid-count')).textContent).toContain(`${Number(skills)} skills`);
      expect(section.queryByTestId('last-week')).toBeNull();
    });
    And('its Maths section says there is nothing to show yet', () => {
      const section = within(screen.getByRole('region', { name: 'Maths' }));
      expect(section.getByTestId('no-data').textContent).toMatch(/nothing to show for maths yet/i);
    });
  });

  Scenario('AC1: Licence Buy shows licensed when a licence is held', ({ Given, And, When, Then }) => {
    Given('a phone that holds no licence yet', holdsNoLicenceYet);
    And('the licence check finds a licence', licenceCheckFinds(HELD));
    When('the grown-up opens the Licence section', opensLicence);
    And('{string} is tapped', buyTapped);
    Then('the Licence section shows {string}', async (_ctx, label: string) => {
      expect(await screen.findByRole('button', { name: label })).toBeDisabled();
    });
    And('there is no {string}', noLink);
  });

  Scenario('AC1: Licence Buy says so when no licence is found, and Get a licence opens the store', ({ Given, And, When, Then }) => {
    Given('a phone that holds no licence yet', holdsNoLicenceYet);
    And('the licence check finds none', licenceCheckFinds(NONE));
    When('the grown-up opens the Licence section', opensLicence);
    And('{string} is tapped', buyTapped);
    Then('the Licence section says {string}', async (_ctx, line: string) => {
      expect((await screen.findByRole('status')).textContent).toBe(line);
    });
    And('{string} opens the store', (_ctx, name: string) => {
      const link = screen.getByRole('link', { name });
      expect(link.getAttribute('href')).toBe(STORE_URL);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    });
  });

  Scenario('AC1: Settings opens from Home with a first line and a search box', ({ Given, When, And, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    When('SpellForge opens', openApp);
    And('{string} is tapped on Home', tappedOnHome);
    Then('the screen {string} is shown', screenShown);
    And('the first line is {string}', firstLineIs);
    And('Settings has a search box', () => {
      expect(screen.getByRole('searchbox', { name: 'Search settings' })).toBeInTheDocument();
    });
  });

  Scenario('AC3: About & Credits opens from Settings', ({ Given, When, And, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    When('SpellForge opens', openApp);
    And('{string} is tapped on Home', tappedOnHome);
    And('{string} is tapped in Settings', async (_ctx, label: string) => {
      fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${label}`) }));
    });
    Then('the screen {string} is shown', screenShown);
  });
});

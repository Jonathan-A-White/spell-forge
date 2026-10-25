// features/steps/worlds.steps.ts: runs features/worlds.feature, the four worlds. The whole app is rendered in jsdom; a stand-in
// button plays the tutor's "go" answer (no tutor answer says go yet), and the Maths world is drawn from its route since no screen
// of the app leads to it.
import '@testing-library/react/dont-cleanup-after-each';
import { createElement } from 'react';
import { afterAll, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { Shell } from '../../src/shell/Shell';
import { WorldSwitch } from '../../src/shell/WorldSwitch';
import { AppProvider } from '../../src/shell/app-context';
import { useApp } from '../../src/shell/app-state';
import { setLicenceStatus } from '../../src/shell/licence-gate';
import { shareApp } from '../../src/shell/share-app';
import { STORE_URL } from '../../src/shell/store';
import { appLink } from '../../src/share/share-out';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';

const feature = await loadFeature('features/worlds.feature');

const CHECKED_AT = '2026-10-24T10:00:00Z';

let share: ReturnType<typeof vi.fn>;

// Each step is a test of its own, so the phone is reset once per scenario (BeforeEachScenario), not before every step.
const freshPhone = async (): Promise<void> => {
  cleanup();
  setLicenceStatus(undefined);
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
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

/** Stands in for the tutor: a "go" answer reaches the shell as an id. */
function TutorGo({ id }: { id: string }) {
  const { go } = useApp();
  return createElement('button', { onClick: () => go(id) }, `tutor goes to ${id}`);
}

/** The app with a stand-in tutor button for each screen a scenario sends the child to. */
function renderApp(): void {
  render(
    createElement(
      AppProvider,
      null,
      createElement(Shell),
      ...['progress', 'about', 'settings', 'share'].map((id) => createElement(TutorGo, { id, key: id })),
    ),
  );
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

const tutorGoes = async (_ctx: unknown, id: string): Promise<void> => {
  fireEvent.click(await screen.findByText(`tutor goes to ${id}`));
};

const screenShown = async (_ctx: unknown, heading: string): Promise<void> => {
  expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
};

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  BeforeEachScenario(freshPhone);

  Scenario('AC1: Home is the Front door', ({ Given, When, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    When('SpellForge opens', renderApp);
    Then('Home greets {string}', async (_ctx, greeting: string) => {
      expect(await screen.findByRole('heading', { name: greeting })).toBeInTheDocument();
    });
  });

  Scenario('AC1: Home opens a Spelling screen', ({ Given, When, And, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    When('SpellForge opens', renderApp);
    And('{string} is tapped on Home', async (_ctx, label: string) => {
      fireEvent.click(await screen.findByRole('button', { name: new RegExp(label) }));
    });
    Then('the screen {string} is shown', async (_ctx, heading: string) => {
      expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    });
  });

  Scenario("AC1: Home opens the Grown-ups' Settings", ({ Given, When, And, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    When('SpellForge opens', renderApp);
    And('{string} is tapped on Home', async (_ctx, label: string) => {
      fireEvent.click(await screen.findByRole('button', { name: label }));
    });
    Then('the screen {string} is shown', async (_ctx, heading: string) => {
      expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    });
  });

  Scenario('AC1: The tutor sends a child to an old Spelling screen', ({ Given, When, And, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    When('SpellForge opens', renderApp);
    And('the tutor says go to {string}', tutorGoes);
    Then('the screen {string} is shown', screenShown);
  });

  Scenario('AC1: The tutor sends a grown-up to an old Grown-ups screen', ({ Given, When, And, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    When('SpellForge opens', renderApp);
    And('the tutor says go to {string}', tutorGoes);
    Then('the screen {string} is shown', screenShown);
  });

  Scenario('AC1: Maths says it is coming', ({ Given, Then }) => {
    Given('the route {string}', (_ctx, route: string) => {
      render(createElement(WorldSwitch, { route }));
    });
    Then('the screen {string} is shown', (_ctx, heading: string) => {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    });
  });

  Scenario('AC1: Get a licence opens the store where there is no licence', ({ Given, When, And, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    And('the phone holds no licence', () => setLicenceStatus({ state: 'none', checkedAt: CHECKED_AT }));
    When('SpellForge opens', renderApp);
    And('the tutor says go to {string}', async (_ctx, id: string) => {
      fireEvent.click(await screen.findByText(`tutor goes to ${id}`));
    });
    Then('the screen {string} is shown', async (_ctx, heading: string) => {
      expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    });
    And('{string} opens the store', (_ctx, name: string) => {
      const link = screen.getByRole('link', { name });
      expect(link.getAttribute('href')).toBe(STORE_URL);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    });
  });

  Scenario('AC1: Get a licence is not shown in Spelling', ({ Given, When, And, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    And('the phone holds no licence', () => setLicenceStatus({ state: 'none', checkedAt: CHECKED_AT }));
    When('SpellForge opens', renderApp);
    And('the tutor says go to {string}', async (_ctx, id: string) => {
      fireEvent.click(await screen.findByText(`tutor goes to ${id}`));
    });
    Then('there is no {string}', async (_ctx, name: string) => {
      await screen.findByRole('heading', { name: 'Progress' });
      expect(screen.queryByRole('link', { name })).toBeNull();
    });
  });

  Scenario('AC1: Get a licence is not shown with a licence', ({ Given, When, And, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    And('the phone holds a licence', () =>
      setLicenceStatus({ state: 'held', outpoint: { txid: 'ab', vout: 0 }, collection: 'spell-forge', checkedAt: CHECKED_AT }),
    );
    When('SpellForge opens', renderApp);
    And('the tutor says go to {string}', async (_ctx, id: string) => {
      fireEvent.click(await screen.findByText(`tutor goes to ${id}`));
    });
    Then('there is no {string}', async (_ctx, name: string) => {
      await screen.findByRole('heading', { name: 'Settings' });
      expect(screen.queryByRole('link', { name })).toBeNull();
    });
  });

  Scenario('AC1: Get a licence is not shown before the licence is known', ({ Given, When, And, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    When('SpellForge opens', renderApp);
    And('the tutor says go to {string}', async (_ctx, id: string) => {
      fireEvent.click(await screen.findByText(`tutor goes to ${id}`));
    });
    Then('there is no {string}', async (_ctx, name: string) => {
      await screen.findByRole('heading', { name: 'Settings' });
      expect(screen.queryByRole('link', { name })).toBeNull();
    });
  });

  Scenario('AC1: The app is shared from the Grown-ups world', ({ Given, When, And, Then }) => {
    Given('a phone that holds the profile {string}', holdProfile);
    When('SpellForge opens', renderApp);
    And('the tutor says go to {string}', async (_ctx, id: string) => {
      fireEvent.click(await screen.findByText(`tutor goes to ${id}`));
    });
    Then('the Share screen is shown', async () => {
      expect(await screen.findByRole('heading', { name: 'Share SpellForge' })).toBeInTheDocument();
    });
  });

  Scenario("AC1: The app shares itself through the phone's share sheet", ({ Given, When, Then }) => {
    Given('a phone with a share sheet', () => {
      share = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { share, clipboard: { writeText: vi.fn() } });
    });
    When('SpellForge shares itself', async () => {
      expect(await shareApp()).toBe('shared');
    });
    Then("the share sheet is given the app's link", () => {
      expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: appLink() }));
    });
  });
});


// features/steps/app-opens.steps.ts: runs features/app-opens.feature, the first screen of the app, rendered whole in jsdom.
import '@testing-library/react/dont-cleanup-after-each';
import { createElement } from 'react';
import { afterAll, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import App from '../../src/App';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import type { licence } from 'bsv-kit/bsv';
import { setLicenceStatus } from '../../src/shell/licence-gate';
import { forgetTrail } from '../../src/shell/last-route';

const feature = await loadFeature('features/app-opens.feature');

// Each step is a test of its own, so the phone is reset once per scenario (BeforeEachScenario), not before every step.
const freshPhone = async (): Promise<void> => {
  cleanup();
  setLicenceStatus(undefined);
  localStorage.clear();
  // a new page life: no history of the last scenario's, as a swiped-away phone has none
  window.history.replaceState(null, '', window.location.pathname);
  forgetTrail();
  // jsdom has no canvas; the themes draw on one.
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
  await db.delete();
  await db.open();
};

afterAll(() => {
  cleanup();
  db.close();
});

describeFeature(feature, ({ Scenario, BeforeEachScenario }) => {
  BeforeEachScenario(freshPhone);

  Scenario('AC3: A phone with no profile opens on the welcome', ({ Given, When, Then }) => {
    Given('a phone that has never opened SpellForge', () => {
      expect(localStorage.length).toBe(0);
    });
    When('SpellForge opens', () => {
      render(createElement(App));
    });
    Then('the welcome "Welcome to Kestrel!" is shown', async () => {
      expect(await screen.findByRole('heading', { name: 'Welcome to Kestrel!' })).toBeInTheDocument();
    });
  });

  const holdsRowan = async () => {
    await profileRepo.create({
      name: 'Rowan',
      avatar: 'dragon-forge-1',
      themeId: 'dragon-forge',
      createdAt: new Date(),
      settings: { ...DEFAULT_SETTINGS },
      status: 'active',
    });
  };
  const opens = () => {
    render(createElement(App));
  };
  const greetsOnTheDoor = async () => {
    expect(await screen.findByText(/Hello! I am your tutor/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Hey, Rowan!' })).not.toBeInTheDocument();
  };

  Scenario('AC1: A phone with a profile opens on the front door, with no Developer setting touched', ({ Given, When, Then }) => {
    Given('a phone that holds the profile "Rowan"', holdsRowan);
    When('SpellForge opens', opens);
    Then('the tutor greets with "Hello! I am your tutor."', greetsOnTheDoor);
  });

  Scenario('AC2: A phone that stored the old Tutor switch as off still opens on the front door', ({ Given, And, When, Then }) => {
    Given('a phone that holds the profile "Rowan"', holdsRowan);
    And('the phone stored the old Tutor switch "sf-tutor" as "0"', () => localStorage.setItem('sf-tutor', '0'));
    When('SpellForge opens', opens);
    Then('the tutor greets with "Hello! I am your tutor."', greetsOnTheDoor);
  });

  Scenario('AC3: With the licence known to be missing the app opens on Home', ({ Given, And, When, Then }) => {
    Given('a phone that holds the profile "Rowan"', holdsRowan);
    And('the licence is known to be missing', () => setLicenceStatus({ state: 'none' } as licence.LicenceStatus));
    When('SpellForge opens', opens);
    Then('Home greets "Hey, Rowan!"', async () => {
      expect(await screen.findByRole('heading', { name: 'Hey, Rowan!' })).toBeInTheDocument();
    });
  });

  const leftOn = (...routes: string[]) => () => {
    localStorage.setItem('sf-last-route', routes[routes.length - 1]);
    localStorage.setItem('sf-trail', JSON.stringify(routes));
  };
  const homeGreets = async () => {
    expect(await screen.findByRole('heading', { name: 'Hey, Rowan!' })).toBeInTheDocument();
  };

  Scenario('AC4: A phone last left on Home opens on the front door, not on Home (mw-79en7t.84)', ({ Given, And, When, Then }) => {
    Given('a phone that holds the profile "Rowan"', holdsRowan);
    And('the phone last left on Home', leftOn('/front-door/home'));
    When('SpellForge opens', opens);
    Then('the tutor greets with "Hello! I am your tutor."', greetsOnTheDoor);
  });

  Scenario('AC5: With the licence known to be missing a phone last left on Home opens on Home', ({ Given, And, When, Then }) => {
    Given('a phone that holds the profile "Rowan"', holdsRowan);
    And('the phone last left on Home', leftOn('/front-door/home'));
    And('the licence is known to be missing', () => setLicenceStatus({ state: 'none' } as licence.LicenceStatus));
    When('SpellForge opens', opens);
    Then('Home greets "Hey, Rowan!"', homeGreets);
  });

  Scenario('AC6: A phone last left inside a world opens there', ({ Given, And, When, Then }) => {
    Given('a phone that holds the profile "Rowan"', holdsRowan);
    And('the phone last left on Word Lists, after Home', leftOn('/front-door/home', '/spelling/word-lists'));
    When('SpellForge opens', opens);
    Then('the screen "Word Lists" is shown', async () => {
      expect(await screen.findByRole('heading', { name: 'Word Lists' })).toBeInTheDocument();
    });
  });
});

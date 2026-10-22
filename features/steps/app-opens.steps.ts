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

const feature = await loadFeature('features/app-opens.feature');

// Each step is a test of its own, so the phone is reset once per scenario (BeforeEachScenario), not before every step.
const freshPhone = async (): Promise<void> => {
  cleanup();
  localStorage.clear();
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
    Then('the welcome "Welcome to SpellForge!" is shown', async () => {
      expect(await screen.findByRole('heading', { name: 'Welcome to SpellForge!' })).toBeInTheDocument();
    });
  });

  Scenario("AC3: A phone with a profile opens on that child's Home", ({ Given, When, Then }) => {
    Given('a phone that holds the profile "Rowan"', async () => {
      await profileRepo.create({
        name: 'Rowan',
        avatar: 'dragon-forge-1',
        themeId: 'dragon-forge',
        createdAt: new Date(),
        settings: { ...DEFAULT_SETTINGS },
        status: 'active',
      });
    });
    When('SpellForge opens', () => {
      render(createElement(App));
    });
    Then('Home greets "Hey, Rowan!"', async () => {
      expect(await screen.findByRole('heading', { name: 'Hey, Rowan!' })).toBeInTheDocument();
    });
  });
});

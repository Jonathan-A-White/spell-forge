// features/steps/look.steps.ts: runs features/look.feature. The front door and the Maths world are rendered in jsdom over fakes (no network);
// the stylesheet and the real pixels are tests/unit/look-worlds.test.tsx's and tests/e2e/look.spec.ts's.
import '@testing-library/react/dont-cleanup-after-each';
import { createElement } from 'react';
import { afterAll, expect, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { memoryStore } from 'learn-kit/graph';
import { FrontDoor } from '../../src/features/front-door/FrontDoor';
import { setLicenceStatus } from '../../src/shell/licence-gate';
import { MathsWorld } from '../../src/worlds/maths/MathsWorld';
import { createMathsFlow, memoryKeep, type MathsFlow, type MathsQuestion } from '../../src/worlds/maths/maths-flow';

const feature = await loadFeature('features/look.feature');

let flow: MathsFlow;
let first: MathsQuestion;

// Each step is a test of its own, so the phone is reset once per scenario (BeforeEachScenario), not before every step.
const freshPhone = (): void => {
  cleanup();
  setLicenceStatus(undefined);
};

afterAll(() => {
  cleanup();
  setLicenceStatus(undefined);
});

describeFeature(feature, ({ BeforeEachScenario, Scenario }) => {
  BeforeEachScenario(freshPhone);

  Scenario('AC1: With no licence the door offers the worlds as big illustrated cards', ({ Given, When, Then }) => {
    Given('the phone has no licence', () => {
      setLicenceStatus({ state: 'none', checkedAt: '2026-10-24T10:00:00Z' });
    });
    When('the front door opens', () => {
      render(createElement(FrontDoor, { flow: { start: vi.fn(async () => 'talk-1'), ask: vi.fn() }, open: () => undefined }));
    });
    Then('{string} and {string} are each a card with a picture, over the scene', (_ctx, one: string, other: string) => {
      for (const name of [one, other]) {
        const card = screen.getByRole('button', { name: new RegExp(name) });
        expect(card).toHaveClass('sf-world-card');
        expect(card.querySelector('svg')).not.toBeNull();
      }
      expect(document.querySelector('.sf-scene')).not.toBeNull();
    });
  });

  Scenario('AC2: A Maths question is a card that enters', ({ Given, Then }) => {
    Given('a Maths world with its first question', async () => {
      flow = createMathsFlow({ store: memoryStore(), keep: memoryKeep(), now: () => 0, seed: 3 });
      first = (await flow.question())!;
      await act(async () => void render(createElement(MathsWorld, { flow, forms: ['type'] })));
      await screen.findByText(first.item.problem);
    });
    Then('the question and its Check button are in one turn card', () => {
      const card = document.querySelector('.sf-turn') as HTMLElement;
      expect(card).not.toBeNull();
      expect(within(card).getByText(first.item.problem)).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: 'Check' })).toBeInTheDocument();
    });
  });
});

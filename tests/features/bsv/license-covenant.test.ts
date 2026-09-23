// tests/features/bsv/license-covenant.test.ts — Runs
// tests/features/bsv/license-covenant.feature under vitest via @amiceli/vitest-cucumber.
// Wiring only: each Given/When/Then delegates to tests/features/steps/license-covenant.steps.ts.
import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import {
  givenScenario,
  whenSpendIsAttempted,
  thenAccepted,
  thenRejected,
  type LicenseSpendContext,
} from '../steps/license-covenant.steps';

const feature = await loadFeature('tests/features/bsv/license-covenant.feature');

describeFeature(feature, ({ Scenario }) => {
  Scenario('AC-4.3.1-1: a valid write is accepted', ({ Given, When, Then }) => {
    const ctx: LicenseSpendContext = {};
    Given('a license write built normally', () => givenScenario(ctx, { method: 'write' }));
    When('the license spend is attempted', () => whenSpendIsAttempted(ctx));
    Then('the write is accepted', () => thenAccepted(ctx));
  });

  Scenario('AC-4.3.2-1: a valid transfer to a new owner is accepted', ({ Given, When, Then }) => {
    const ctx: LicenseSpendContext = {};
    Given('a license transfer built normally', () => givenScenario(ctx, { method: 'transfer' }));
    When('the license spend is attempted', () => whenSpendIsAttempted(ctx));
    Then('the transfer is accepted', () => thenAccepted(ctx));
  });

  Scenario('AC-4.3.15-1: a write with a fourth output is rejected (rule f)', ({ Given, When, Then }) => {
    const ctx: LicenseSpendContext = {};
    Given('a license write with an extra output after the Data output', () =>
      givenScenario(ctx, { method: 'write', extraOutputs: 1 }),
    );
    When('the license spend is attempted', () => whenSpendIsAttempted(ctx));
    Then('the write is rejected', () => thenRejected(ctx));
  });

  Scenario('AC-4.3.2-1: a write that swaps the owner key is rejected (rule c)', ({ Given, When, Then }) => {
    const ctx: LicenseSpendContext = {};
    Given('a license write whose output 0 carries a different owner key', () =>
      givenScenario(ctx, { method: 'write', output0Owner: 'buyer' }),
    );
    When('the license spend is attempted', () => whenSpendIsAttempted(ctx));
    Then('the write is rejected', () => thenRejected(ctx));
  });

  Scenario('AC-4.3.1-1: a write whose output 0 carries 2 satoshis is rejected (rule b)', ({ Given, When, Then }) => {
    const ctx: LicenseSpendContext = {};
    Given('a license write whose output 0 carries 2 satoshis', () =>
      givenScenario(ctx, { method: 'write', output0Satoshis: 2 }),
    );
    When('the license spend is attempted', () => whenSpendIsAttempted(ctx));
    Then('the write is rejected', () => thenRejected(ctx));
  });

  Scenario('AC-4.3.1-1: a write signed by a non-owner key is rejected (rule d)', ({ Given, When, Then }) => {
    const ctx: LicenseSpendContext = {};
    Given("a license write signed by a stranger's key", () =>
      givenScenario(ctx, { method: 'write', signer: 'stranger' }),
    );
    When('the license spend is attempted', () => whenSpendIsAttempted(ctx));
    Then('the write is rejected', () => thenRejected(ctx));
  });
});

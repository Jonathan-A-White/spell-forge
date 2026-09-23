// tests/features/bsv/fuel-covenant.test.ts — Runs tests/features/bsv/fuel-covenant.feature
// under vitest via @amiceli/vitest-cucumber. Wiring only: each Given/When/Then delegates to
// tests/features/steps/fuel-covenant.steps.ts.
import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import {
  givenScenario,
  whenFuelSpendIsAttempted,
  thenAccepted,
  thenMatchesRecordedLayoutAndSizes,
  thenRejected,
  thenLicenseAlsoRefusesRuleF,
  type FuelSpendContext,
} from '../steps/fuel-covenant.steps';

const feature = await loadFeature('tests/features/bsv/fuel-covenant.feature');

describeFeature(feature, ({ Scenario }) => {
  Scenario('AC-4.3.12-1: a Fuel spend that spends the License created beside it is accepted', ({ Given, When, Then, And }) => {
    const ctx: FuelSpendContext = {};
    Given('a Fuel spend built normally', () => givenScenario(ctx, {}));
    When('the Fuel spend is attempted', () => whenFuelSpendIsAttempted(ctx));
    Then('the spend is accepted', () => thenAccepted(ctx));
    And('it has exactly the recorded layout and byte sizes', () => thenMatchesRecordedLayoutAndSizes(ctx));
  });

  Scenario('AC-4.3.12-2: a Fuel spend under-conserving its own value is rejected', ({ Given, When, Then }) => {
    const ctx: FuelSpendContext = {};
    Given('a Fuel spend under-conserving its own value', () =>
      givenScenario(ctx, { fuelOutSatoshis: 100_000 - 2_001 }),
    );
    When('the Fuel spend is attempted', () => whenFuelSpendIsAttempted(ctx));
    Then('the spend is rejected with "output 1 keeps at least own value - FEE_CAP"', () =>
      thenRejected(ctx, 'output 1 keeps at least own value - FEE_CAP'),
    );
  });

  Scenario('AC-4.3.12-1: a Fuel spend without spending the License created beside it is rejected (FB-1)', ({ Given, When, Then }) => {
    const ctx: FuelSpendContext = {};
    Given('a Fuel spend whose input 0 is an ordinary P2PKH, not the License', () =>
      givenScenario(ctx, { input0: 'p2pkh' }),
    );
    When('the Fuel spend is attempted', () => whenFuelSpendIsAttempted(ctx));
    Then('the spend is rejected with "FB-1: input 0 is the License created beside this Fuel"', () =>
      thenRejected(ctx, "FB-1: input 0 is the License created beside this Fuel"),
    );
  });

  Scenario('AC-4.3.15-1: a write whose output 1 is not Fuel(C) is rejected', ({ Given, When, Then, And }) => {
    const ctx: FuelSpendContext = {};
    Given('a Fuel spend whose output 1 carries a P2PKH instead of Fuel(C)', () =>
      givenScenario(ctx, { output1: 'p2pkh' }),
    );
    When('the Fuel spend is attempted', () => whenFuelSpendIsAttempted(ctx));
    Then('the spend is rejected with "output 1 is this Fuel(C), unchanged"', () =>
      thenRejected(ctx, 'output 1 is this Fuel(C), unchanged'),
    );
    And('the License also refuses it under rule (f)', () => thenLicenseAlsoRefusesRuleF(ctx));
  });

  Scenario('AC-4.3.1-1: a write with the Fuel at input 2 is rejected', ({ Given, When, Then }) => {
    const ctx: FuelSpendContext = {};
    Given('a Fuel spend with the Fuel at input 2, behind a funding input', () =>
      givenScenario(ctx, { fuelInputIndex: 2 }),
    );
    When('the Fuel spend is attempted', () => whenFuelSpendIsAttempted(ctx));
    Then('the spend is rejected with "the Fuel is input 1"', () => thenRejected(ctx, 'the Fuel is input 1'));
  });
});

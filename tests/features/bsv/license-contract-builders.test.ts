// tests/features/bsv/license-contract-builders.test.ts — Runs
// tests/features/bsv/license-contract-builders.feature under vitest via
// @amiceli/vitest-cucumber. Wiring only: each Given/When/Then delegates to
// tests/features/steps/license-contract-builders.steps.ts.
import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import {
  givenLicenseMintedWithFuel,
  whenWriteIsBuilt,
  whenTransferIsBuilt,
  whenArtifactMismatchWriteIsAttempted,
  thenOutput0IsTheLicense,
  thenOutput1IsFuelAtMintFuel,
  thenOutput2IsTypeMData,
  thenOutput3IsIssuerChange,
  thenWriteBothVerify,
  thenTransferBothVerify,
  thenEachArtifactMismatchIsRefused,
  type LicenseBuilderContext,
} from '../steps/license-contract-builders.steps';

const feature = await loadFeature('tests/features/bsv/license-contract-builders.feature');

describeFeature(feature, ({ Scenario }) => {
  Scenario(
    'AC-4.1.1-1: mint creates the License Token, Fuel(C) at MINT_FUEL, and a type-M Data output',
    ({ Given, Then, And }) => {
      const ctx: LicenseBuilderContext = {};
      Given('a License minted with its Fuel', () => givenLicenseMintedWithFuel(ctx));
      Then("output 0 is a 1-sat License locked to the owner's key", () => thenOutput0IsTheLicense(ctx));
      And("output 1 is Fuel(C) at exactly MINT_FUEL, matching the License's fuelScriptHash", () =>
        thenOutput1IsFuelAtMintFuel(ctx),
      );
      And('output 2 is a type-M Data output naming the collection and holder', () => thenOutput2IsTypeMData(ctx));
      And("output 3 is the issuer's change", () => thenOutput3IsIssuerChange(ctx));
    },
  );

  Scenario("AC-4.3.1-1: a License + Fuel write passes both covenants' local verify", ({ Given, When, Then }) => {
    const ctx: LicenseBuilderContext = {};
    Given('a License minted with its Fuel', () => givenLicenseMintedWithFuel(ctx));
    When('a write is built spending the License and its Fuel', () => whenWriteIsBuilt(ctx));
    Then("the write's License input and Fuel input both verify against the committed artifacts", () =>
      thenWriteBothVerify(ctx),
    );
  });

  Scenario("AC-4.4.2-1: a License + Fuel transfer passes both covenants' local verify", ({ Given, When, Then }) => {
    const ctx: LicenseBuilderContext = {};
    Given('a License minted with its Fuel', () => givenLicenseMintedWithFuel(ctx));
    When('a transfer is built to a new owner', () => whenTransferIsBuilt(ctx));
    Then("the transfer's License input and Fuel input both verify against the committed artifacts", () =>
      thenTransferBothVerify(ctx),
    );
  });

  Scenario(
    'AC-4.3.1-1: a write on a token minted under another License artifact is refused before touching the chain',
    ({ Given, When, Then }) => {
      const ctx: LicenseBuilderContext = {};
      Given('a License minted with its Fuel', () => givenLicenseMintedWithFuel(ctx));
      When(
        'a write is attempted for a token minted under another License artifact, another Fuel artifact, or the step 2 stand-in under another artifact',
        () => whenArtifactMismatchWriteIsAttempted(ctx),
      );
      Then('each attempt is refused with ContractVersionMismatchError, and the chain is never fetched', () =>
        thenEachArtifactMismatchIsRefused(ctx),
      );
    },
  );
});

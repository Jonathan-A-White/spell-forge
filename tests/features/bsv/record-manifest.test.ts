// tests/features/bsv/record-manifest.test.ts — Runs tests/features/bsv/record-manifest.feature
// under vitest via @amiceli/vitest-cucumber. Wiring only: each Given/When/Then delegates to
// tests/features/steps/record-manifest.steps.ts.
import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import {
  givenShortPayloadRecord,
  givenTypeWRecord,
  whenScriptIsDecoded,
  thenScriptCarriesFieldsInOrder,
  thenRecordHasVersionTypeAndEmptyManifest,
  thenPayloadRoundTrips,
  type RecordManifestContext,
} from '../steps/record-manifest.steps';

const feature = await loadFeature('tests/features/bsv/record-manifest.feature');

describeFeature(feature, ({ Scenario }) => {
  Scenario('AC-4.3.4-1: a Data output is written with the empty manifest field in order', ({ Given, Then }) => {
    const ctx: RecordManifestContext = {};
    Given('a type-W record encoded with a short payload', () => givenShortPayloadRecord(ctx));
    Then('the script carries protocol id, version, type, empty manifest, then the payload, in that order', () =>
      thenScriptCarriesFieldsInOrder(ctx),
    );
  });

  Scenario('AC-4.3.4-1: a Data output decodes with manifest as an empty list', ({ Given, When, Then, And }) => {
    const ctx: RecordManifestContext = {};
    Given('a type-W record encoded with a payload', () => givenTypeWRecord(ctx));
    When('the script is decoded', () => whenScriptIsDecoded(ctx));
    Then('the record has version 2, type W, and manifest []', () => thenRecordHasVersionTypeAndEmptyManifest(ctx));
    And('the payload bytes round-trip unchanged', () => thenPayloadRoundTrips(ctx));
  });
});

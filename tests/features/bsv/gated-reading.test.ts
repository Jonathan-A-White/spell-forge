// tests/features/bsv/gated-reading.test.ts — Runs tests/features/bsv/gated-reading.feature
// under vitest via @amiceli/vitest-cucumber. Wiring only: each Given/When/Then delegates to
// tests/features/steps/gated-reading.steps.ts.
import { loadFeature, describeFeature } from '@amiceli/vitest-cucumber';
import {
  givenGatedMint,
  givenHolderWrites,
  givenSecp256k1Keys,
  whenOutsiderReads,
  whenHolderReads,
  whenHolderReadsWithSecp256k1DeclaredWrap,
  whenIssuerMintsWithEach,
  thenCannotRead,
  thenTextAbsentFromChain,
  thenGetsText,
  thenEachMintRefusedAsMalformed,
  type GatedReadingContext,
} from '../steps/gated-reading.steps';

const feature = await loadFeature('tests/features/bsv/gated-reading.feature');

const MINTED = "a License minted to the holder with a wrap of k(0) to the holder's wrap key";
const WRITES = 'the holder writes "a secret for the holder only" with the token';
const SECRET = 'a secret for the holder only';

describeFeature(feature, ({ Scenario }) => {
  Scenario('AC-4.3.3-1: a party with all on-chain data and no wrap to it cannot read a Write Record', ({ Given, And, When, Then }) => {
    const ctx: GatedReadingContext = {};
    Given(MINTED, () => givenGatedMint(ctx));
    And(WRITES, () => givenHolderWrites(ctx, SECRET));
    When("a party with the wrap key of another seed reads the Write Record with the token's mint record", () => whenOutsiderReads(ctx));
    Then('it gets a result whose message starts "cannot read"', () => thenCannotRead(ctx));
    And("the text appears in neither the mint's nor the write's transaction hex", () => thenTextAbsentFromChain(ctx));
  });

  Scenario("AC-4.3.3-1: the holder's own wrap key reads the Write Record", ({ Given, And, When, Then }) => {
    const ctx: GatedReadingContext = {};
    Given(MINTED, () => givenGatedMint(ctx));
    And(WRITES, () => givenHolderWrites(ctx, SECRET));
    When("the holder reads the Write Record with the token's mint record", () => whenHolderReads(ctx));
    Then(`it gets the text "${SECRET}"`, () => thenGetsText(ctx, SECRET));
  });

  Scenario(
    "AC-4.2.14-1: a mint whose wrap key is the holder's secp256k1 owner key is rejected as malformed",
    ({ Given, When, Then }) => {
      const ctx: GatedReadingContext = {};
      Given("the holder's secp256k1 owner key, compressed and uncompressed, in place of a wrap key", () => givenSecp256k1Keys(ctx));
      When('the issuer builds a mint with each', () => whenIssuerMintsWithEach(ctx));
      Then('each mint is refused as malformed, "not-p256-public-key"', () => thenEachMintRefusedAsMalformed(ctx, 'not-p256-public-key'));
    },
  );

  Scenario('AC-4.2.14-1: a wrap declared to a secp256k1 key is treated as missing by a reader', ({ Given, And, When, Then }) => {
    const ctx: GatedReadingContext = {};
    Given(MINTED, () => givenGatedMint(ctx));
    And(WRITES, () => givenHolderWrites(ctx, SECRET));
    When("the holder reads the Write Record with the mint's wrap declared to the holder's secp256k1 owner key", () =>
      whenHolderReadsWithSecp256k1DeclaredWrap(ctx),
    );
    Then('it gets a result whose message starts "cannot read"', () => thenCannotRead(ctx));
  });
});

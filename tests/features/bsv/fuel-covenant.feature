Feature: Fuel(C) covenant (spec §3.2/§3.7 spend)

  The Fuel(C) contract's `spend` method is enforced on every write or transfer that
  spends it beside the License it rides with. Each scenario checks a spend the same way
  tests/unit/bsv-contracts-fuel.test.ts does: build it against the committed artifact,
  run scrypt-ts's own interpreter over the Fuel's input, and, for a refusal, confirm the
  contract's TypeScript rejects it too.

  @AC-4.3.12-1 @R4.3.12
  Scenario: AC-4.3.12-1: a Fuel spend that spends the License created beside it is accepted
    Given a Fuel spend built normally
    When the Fuel spend is attempted
    Then the spend is accepted
    And it has exactly the recorded layout and byte sizes

  @AC-4.3.12-2 @R4.3.12
  Scenario: AC-4.3.12-2: a Fuel spend under-conserving its own value is rejected
    Given a Fuel spend under-conserving its own value
    When the Fuel spend is attempted
    Then the spend is rejected with "output 1 keeps at least own value - FEE_CAP"

  @AC-4.3.12-1 @R4.3.12
  Scenario: AC-4.3.12-1: a Fuel spend without spending the License created beside it is rejected (FB-1)
    Given a Fuel spend whose input 0 is an ordinary P2PKH, not the License
    When the Fuel spend is attempted
    Then the spend is rejected with "FB-1: input 0 is the License created beside this Fuel"

  @AC-4.3.15-1 @R4.3.15
  Scenario: AC-4.3.15-1: a write whose output 1 is not Fuel(C) is rejected
    Given a Fuel spend whose output 1 carries a P2PKH instead of Fuel(C)
    When the Fuel spend is attempted
    Then the spend is rejected with "output 1 is this Fuel(C), unchanged"
    And the License also refuses it under rule (f)

  @AC-4.3.1-1 @R4.3.1
  Scenario: AC-4.3.1-1: a write with the Fuel at input 2 is rejected
    Given a Fuel spend with the Fuel at input 2, behind a funding input
    When the Fuel spend is attempted
    Then the spend is rejected with "the Fuel is input 1"

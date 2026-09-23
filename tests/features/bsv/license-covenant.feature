Feature: License covenant (spec §3.7)

  The License contract's covenant rules (a)-(f) are enforced on every write or
  transfer that spends and recreates a License Token. Each scenario checks a spend
  the same way tests/unit/bsv-contracts-license.test.ts does: build it against the
  committed artifact, run scrypt-ts's own interpreter over input 0, and, for a
  refusal, confirm the contract's TypeScript rejects it too.

  @AC-4.3.1-1 @R4.3.1
  Scenario: AC-4.3.1-1: a valid write is accepted
    Given a license write built normally
    When the license spend is attempted
    Then the write is accepted

  @AC-4.3.2-1 @R4.3.2
  Scenario: AC-4.3.2-1: a valid transfer to a new owner is accepted
    Given a license transfer built normally
    When the license spend is attempted
    Then the transfer is accepted

  @AC-4.3.15-1 @R4.3.15
  Scenario: AC-4.3.15-1: a write with a fourth output is rejected (rule f)
    Given a license write with an extra output after the Data output
    When the license spend is attempted
    Then the write is rejected

  @AC-4.3.2-1 @R4.3.2
  Scenario: AC-4.3.2-1: a write that swaps the owner key is rejected (rule c)
    Given a license write whose output 0 carries a different owner key
    When the license spend is attempted
    Then the write is rejected

  @AC-4.3.1-1 @R4.3.1
  Scenario: AC-4.3.1-1: a write whose output 0 carries 2 satoshis is rejected (rule b)
    Given a license write whose output 0 carries 2 satoshis
    When the license spend is attempted
    Then the write is rejected

  @AC-4.3.1-1 @R4.3.1
  Scenario: AC-4.3.1-1: a write signed by a non-owner key is rejected (rule d)
    Given a license write signed by a stranger's key
    When the license spend is attempted
    Then the write is rejected

Feature: License + Fuel builders (spec §4.1, §4.3, §4.4)

  buildContractMintTransaction, buildContractTokenRecordTransaction and
  buildContractTransferTransaction (mw-5wuz6.3, mw-yo97u.3) mint and spend a License Token
  beside its Fuel(C). Each scenario checks the built transaction the same way
  tests/unit/bsv-license-contract-{mint,write,transfer}.test.ts does, against the committed
  artifacts and the offline fixture chain (tests/fixtures/bsv/license-contract-chain.ts).

  @AC-4.1.1-1 @R4.1.1
  Scenario: AC-4.1.1-1: mint creates the License Token, Fuel(C) at MINT_FUEL, and a type-M Data output
    Given a License minted with its Fuel
    Then output 0 is a 1-sat License locked to the owner's key
    And output 1 is Fuel(C) at exactly MINT_FUEL, matching the License's fuelScriptHash
    And output 2 is a type-M Data output naming the collection and holder
    And output 3 is the issuer's change

  @AC-4.3.1-1 @R4.3.1
  Scenario: AC-4.3.1-1: a License + Fuel write passes both covenants' local verify
    Given a License minted with its Fuel
    When a write is built spending the License and its Fuel
    Then the write's License input and Fuel input both verify against the committed artifacts

  @AC-4.4.2-1 @R4.4.2
  Scenario: AC-4.4.2-1: a License + Fuel transfer passes both covenants' local verify
    Given a License minted with its Fuel
    When a transfer is built to a new owner
    Then the transfer's License input and Fuel input both verify against the committed artifacts

  @AC-4.3.1-1 @R4.3.1
  Scenario: AC-4.3.1-1: a write on a token minted under another License artifact is refused before touching the chain
    Given a License minted with its Fuel
    When a write is attempted for a token minted under another License artifact, another Fuel artifact, or the step 2 stand-in under another artifact
    Then each attempt is refused with ContractVersionMismatchError, and the chain is never fetched

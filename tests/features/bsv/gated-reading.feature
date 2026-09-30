Feature: Gated reading, offline (spec §3.8, §3.4, §3.6; docs/bsv-wire-formats.md)

  A License mint carries c(0) in §3.8 field 3 and, in its M record, a wrap of the epoch key
  k(0) to the holder's P-256 wrap key. A write carries c(0) too and its payload encrypted under
  k(0). The holder's wrap key reads it back; anyone else, holding every byte on chain, cannot.

  @AC-4.3.3-1 @R4.3.3 @R4.2.8
  Scenario: AC-4.3.3-1: a party with all on-chain data and no wrap to it cannot read a Write Record
    Given a License minted to the holder with a wrap of k(0) to the holder's wrap key
    And the holder writes "a secret for the holder only" with the token
    When a party with the wrap key of another seed reads the Write Record with the token's mint record
    Then it gets a result whose message starts "cannot read"
    And the text appears in neither the mint's nor the write's transaction hex

  @AC-4.3.3-1 @R4.3.3
  Scenario: AC-4.3.3-1: the holder's own wrap key reads the Write Record
    Given a License minted to the holder with a wrap of k(0) to the holder's wrap key
    And the holder writes "a secret for the holder only" with the token
    When the holder reads the Write Record with the token's mint record
    Then it gets the text "a secret for the holder only"

  @AC-4.2.14-1 @R4.2.14 @R4.2.13
  Scenario: AC-4.2.14-1: a mint whose wrap key is the holder's secp256k1 owner key is rejected as malformed
    Given the holder's secp256k1 owner key, compressed and uncompressed, in place of a wrap key
    When the issuer builds a mint with each
    Then each mint is refused as malformed, "not-p256-public-key"

  @AC-4.2.14-1 @R4.2.14 @R4.2.13
  Scenario: AC-4.2.14-1: a wrap declared to a secp256k1 key is treated as missing by a reader
    Given a License minted to the holder with a wrap of k(0) to the holder's wrap key
    And the holder writes "a secret for the holder only" with the token
    When the holder reads the Write Record with the mint's wrap declared to the holder's secp256k1 owner key
    Then it gets a result whose message starts "cannot read"

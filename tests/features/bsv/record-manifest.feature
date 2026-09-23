Feature: Data output value manifest (spec §3.8)

  The format-0x02 Data output carries the §3.8 value-manifest field (field 4), empty,
  between the record type and the payload. Epoch commitment (field 3) does not exist in
  this codebase yet, so the manifest sits directly after the record type for now.

  @AC-4.3.4-1 @R4.3.4
  Scenario: AC-4.3.4-1: a Data output is written with the empty manifest field in order
    Given a type-W record encoded with a short payload
    Then the script carries protocol id, version, type, empty manifest, then the payload, in that order

  @AC-4.3.4-1 @R4.3.4
  Scenario: AC-4.3.4-1: a Data output decodes with manifest as an empty list
    Given a type-W record encoded with a payload
    When the script is decoded
    Then the record has version 2, type W, and manifest []
    And the payload bytes round-trip unchanged

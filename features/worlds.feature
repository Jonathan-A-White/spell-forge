Feature: The four worlds
  SpellForge has four worlds: the Front door, Spelling, Maths and Grown-ups. Every old screen lives in its world and is reached
  from it, or when the tutor says go. Get a licence is the Grown-ups world's way to the store, and shows only where a licence is
  known to be missing. The app is shared from the phone's own sheet, not from a screen of its own.

  Scenario: AC1: Home is the Front door
    Given a phone that holds the profile "Rowan"
    When SpellForge opens
    Then Home greets "Hey, Rowan!"

  Scenario: AC1: Home opens a Spelling screen
    Given a phone that holds the profile "Rowan"
    When SpellForge opens
    And "My Words" is tapped on Home
    Then the screen "Word Lists" is shown

  Scenario: AC1: Home opens the Grown-ups' Settings
    Given a phone that holds the profile "Rowan"
    When SpellForge opens
    And "Settings" is tapped on Home
    Then the screen "Settings" is shown

  Scenario: AC1: The tutor sends a child to an old Spelling screen
    Given a phone that holds the profile "Rowan"
    When SpellForge opens
    And the tutor says go to "progress"
    Then the screen "Progress" is shown

  Scenario: AC1: The tutor sends a grown-up to an old Grown-ups screen
    Given a phone that holds the profile "Rowan"
    When SpellForge opens
    And the tutor says go to "about"
    Then the screen "About & Credits" is shown

  Scenario: AC1: Maths says it is coming
    Given the route "/maths"
    Then the screen "Maths is coming" is shown

  Scenario: AC1: Get a licence opens the store where there is no licence
    Given a phone that holds the profile "Rowan"
    And the phone holds no licence
    When SpellForge opens
    And the tutor says go to "settings"
    Then the screen "Settings" is shown
    And "Get a licence" opens the store

  Scenario: AC1: Get a licence is not shown in Spelling
    Given a phone that holds the profile "Rowan"
    And the phone holds no licence
    When SpellForge opens
    And the tutor says go to "progress"
    Then there is no "Get a licence"

  Scenario: AC1: Get a licence is not shown with a licence
    Given a phone that holds the profile "Rowan"
    And the phone holds a licence
    When SpellForge opens
    And the tutor says go to "settings"
    Then there is no "Get a licence"

  Scenario: AC1: Get a licence is not shown before the licence is known
    Given a phone that holds the profile "Rowan"
    When SpellForge opens
    And the tutor says go to "settings"
    Then there is no "Get a licence"

  Scenario: AC1: The app is shared from the Grown-ups world
    Given a phone that holds the profile "Rowan"
    When SpellForge opens
    And the tutor says go to "share"
    Then the Share screen is shown

  Scenario: AC1: The app shares itself through the phone's share sheet
    Given a phone with a share sheet
    When SpellForge shares itself
    Then the share sheet is given the app's link

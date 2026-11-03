Feature: SpellForge opens
  The app opens on whatever the phone already holds: a phone with no profile is welcomed and asked for a name, a phone
  with a profile opens on the front door, the tutor to talk to (mw-79en7t.82: for everyone, with no Developer switch; a stored 'sf-tutor' of
  '0' keeps nobody out). With the licence known to be missing the tutor cannot talk, so the app opens on Home. Nothing is asked of anyone
  before the first screen shows.

  Scenario: AC3: A phone with no profile opens on the welcome
    Given a phone that has never opened SpellForge
    When SpellForge opens
    Then the welcome "Welcome to Kestrel!" is shown

  Scenario: AC1: A phone with a profile opens on the front door, with no Developer setting touched
    Given a phone that holds the profile "Rowan"
    When SpellForge opens
    Then the tutor greets with "Hello! I am your tutor."

  Scenario: AC2: A phone that stored the old Tutor switch as off still opens on the front door
    Given a phone that holds the profile "Rowan"
    And the phone stored the old Tutor switch "sf-tutor" as "0"
    When SpellForge opens
    Then the tutor greets with "Hello! I am your tutor."

  Scenario: AC3: With the licence known to be missing the app opens on Home
    Given a phone that holds the profile "Rowan"
    And the licence is known to be missing
    When SpellForge opens
    Then Home greets "Hey, Rowan!"

  Scenario: AC4: A phone last left on Home opens on the front door, not on Home (mw-79en7t.84)
    Given a phone that holds the profile "Rowan"
    And the phone last left on Home
    When SpellForge opens
    Then the tutor greets with "Hello! I am your tutor."

  Scenario: AC5: With the licence known to be missing a phone last left on Home opens on Home
    Given a phone that holds the profile "Rowan"
    And the phone last left on Home
    And the licence is known to be missing
    When SpellForge opens
    Then Home greets "Hey, Rowan!"

  Scenario: AC6: A phone last left inside a world opens there
    Given a phone that holds the profile "Rowan"
    And the phone last left on Word Lists, after Home
    When SpellForge opens
    Then the screen "Word Lists" is shown

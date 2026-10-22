Feature: SpellForge opens
  The app opens on whatever the phone already holds: a phone with no profile is welcomed and asked for a name, a phone
  with a profile opens on that child's Home. Nothing is asked of anyone before the first screen shows.

  Scenario: AC3: A phone with no profile opens on the welcome
    Given a phone that has never opened SpellForge
    When SpellForge opens
    Then the welcome "Welcome to SpellForge!" is shown

  Scenario: AC3: A phone with a profile opens on that child's Home
    Given a phone that holds the profile "Rowan"
    When SpellForge opens
    Then Home greets "Hey, Rowan!"

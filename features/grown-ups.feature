Feature: The Grown-ups world
  The grown-up's side of SpellForge sits behind a PIN: Who is learning, How is it going, Licence (Buy and Get a licence) and
  Settings. Only the tutor needs a licence; none of these screens waits on one.

  The sweep (Kestrel 17e, mw-79en7t.53): every grown-up screen of the old app, and its place now.
    - parent-screen: the Grown-ups screen behind the PIN, src/worlds/grown-ups/parent-screen.tsx, opened by the Tutor's Grown-ups
      button through GrownUps and the PIN gate; its sections are This week, Sessions, Ask the tutor, Licence (Buy, Get a licence),
      Tutor settings and Notes for the tutor. The old Settings entry points (Home, the tutor's "go") stay.
    - parent-sessions-view: This week and Sessions, src/worlds/grown-ups/parent-sessions-view.tsx, drawn inside the Grown-ups screen;
      a session line opens that session's page (src/features/tutor/parent-session-page.tsx).
    - settings-panel: Settings, src/features/settings/settings-panel.tsx over src/worlds/grown-ups/Settings.tsx (a first line, a
      search box, then the rows of the one registry), the grown-ups world's 'settings' screen, reached from Home's Settings.
    - about: About & Credits, src/features/about/about-screen.tsx, the grown-ups world's 'about' screen, reached from Settings'
      About & Credits row (and the tutor's "go").
    - the old profile picker became Who is learning (src/worlds/grown-ups/WhoIsLearning.tsx, the front door's 'profile-select').
    - How is it going (src/worlds/grown-ups/HowIsItGoing.tsx) is new (mw-79en7t.68): the Grown-ups home (parent-screen.tsx) draws it,
      from the solid nodes each world keeps for the child (src/worlds/grown-ups/world-progress.ts). The drills of the last week are
      not kept with a date anywhere yet, so the home does not claim a count of them.
    - Sweep (mw-79en7t.68): the components under src/worlds/grown-ups that no screen imports: none, once the home draws How is it
      going (before it, only HowIsItGoing). The e2e test page tests/e2e/harness/grown-ups.tsx still draws it by hand.

  Scenario: AC1: The Grown-ups screen asks for a PIN the first time
    Given a phone that holds the profile "Rowan"
    When the grown-up opens Grown-ups
    Then the PIN pad asks "Choose a 4-digit PIN"

  Scenario: AC1: Choosing a PIN and a question opens Grown-ups
    Given a phone that holds the profile "Rowan"
    When the grown-up opens Grown-ups
    And the grown-up chooses the PIN "2468" and the question "What is your favourite meal?" with the answer "pasta"
    Then the Grown-ups screen opens with the Licence section

  Scenario: AC1: A PIN already chosen is asked for again
    Given a phone that holds the profile "Rowan"
    And the grown-up has chosen the PIN "2468"
    When the grown-up opens Grown-ups
    And the grown-up types the PIN "1111"
    Then the PIN pad says "Try again"
    And the Grown-ups screen has not opened

  Scenario: AC1: The right PIN opens Grown-ups
    Given a phone that holds the profile "Rowan"
    And the grown-up has chosen the PIN "2468"
    When the grown-up opens Grown-ups
    And the grown-up types the PIN "2468"
    Then the Grown-ups screen opens with the Licence section

  Scenario: AC1: Who is learning shows each learner and what the tutor knows of them
    Given a phone that holds the profiles "Rowan" and "Ada"
    When SpellForge opens
    Then the screen "Who is learning?" is shown
    And the learners "Rowan" and "Ada" are listed, the tutor knowing nothing of them yet
    And the first line is "Tap who is learning today, or add someone new."

  Scenario: AC1: Tapping a learner on Who is learning opens Home for them
    Given a phone that holds the profiles "Rowan" and "Ada"
    When SpellForge opens
    And the learner "Ada" is tapped
    Then Home greets "Hey, Ada!"

  Scenario: AC1: How is it going shows each subject in plain words
    Given a learner who is solid on 12 spelling skills and did 5 spelling drills last week
    When the grown-up opens How is it going
    Then the Spelling section shows the skills that are solid and the 5 drills
    And the Maths section says there is nothing to show yet

  Scenario: AC2: The Grown-ups home draws How is it going
    Given a phone that holds the profile "Rowan"
    And the grown-up has chosen the PIN "2468"
    And the learner is solid on 12 spelling skills
    When the grown-up opens Grown-ups
    And the grown-up types the PIN "2468"
    Then the Grown-ups home shows How is it going
    And its Spelling section shows 12 skills solid
    And its Maths section says there is nothing to show yet

  Scenario: AC1: Licence Buy shows licensed when a licence is held
    Given a phone that holds no licence yet
    And the licence check finds a licence
    When the grown-up opens the Licence section
    And "Buy" is tapped
    Then the Licence section shows "licensed"
    And there is no "Get a licence"

  Scenario: AC1: Licence Buy says so when no licence is found, and Get a licence opens the store
    Given a phone that holds no licence yet
    And the licence check finds none
    When the grown-up opens the Licence section
    And "Buy" is tapped
    Then the Licence section says "No licence found for this device yet. Use Get a licence, then tap Buy again."
    And "Get a licence" opens the store

  Scenario: AC1: Settings opens from Home with a first line and a search box
    Given a phone that holds the profile "Rowan"
    When SpellForge opens
    And "Settings" is tapped on Home
    Then the screen "Settings" is shown
    And the first line is "Change how the app looks and works, or search for any setting."
    And Settings has a search box

  Scenario: AC3: About & Credits opens from Settings
    Given a phone that holds the profile "Rowan"
    When SpellForge opens
    And "Settings" is tapped on Home
    And "About & Credits" is tapped in Settings
    Then the screen "About & Credits" is shown

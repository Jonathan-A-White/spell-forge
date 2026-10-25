Feature: The Spelling world
  The Spelling world finds out where a child is on the spelling graph before it teaches anything: the child hears a word and taps
  the way it is spelt, never typing. Once that is over it plays the words of the next pattern as one of the games, with the
  pattern's picture beside the game when one is kept. A game in Practice Games still costs a coin while there are words to learn.

  Scenario: AC1: A child's first time in Spelling starts by finding out what they know
    Given a phone that holds the profile "Rowan"
    When SpellForge opens
    And the tutor says go to "spelling-home"
    Then the screen "Spelling" is shown
    And Spelling says "Let's see what you know"
    And the child can hear the word and choose between two spellings

  Scenario: AC1: A word spelt wrong is met with the word and a way on
    Given a phone that holds the profile "Rowan"
    When SpellForge opens
    And the tutor says go to "spelling-home"
    And the child taps the wrong spelling
    Then Spelling says "It is spelt"
    And there is a "Next" button

  Scenario: AC1: After the placement a drill plays with the pattern's picture beside it
    Given a phone that holds the profile "Rowan"
    And the phone keeps a picture for every pattern
    When SpellForge opens
    And the tutor says go to "spelling-home"
    And the child spells every word right until the placement is over
    Then a game is open with the pattern's picture beside it
    And the placement question is gone

  Scenario: AC1: A drill with no picture kept shows no picture
    Given a phone that holds the profile "Rowan"
    When SpellForge opens
    And the tutor says go to "spelling-home"
    And the child spells every word right until the placement is over
    Then a game is open
    And there is no picture beside it

  Scenario: AC1: A game in Practice Games takes a coin
    Given a phone that holds the profile "Rowan"
    And the child holds 1 coin and words to play
    When SpellForge opens
    And the tutor says go to "practice-games"
    And "Spell Catcher" is chosen in Practice Games
    Then Practice Games asks "Spend 1 Coin to Play?"
    When "Spend 1 Coin & Play" is tapped
    Then the child holds 0 coins

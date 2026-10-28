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

  Scenario: AC4: A round missed and then spelt right again is no proof, the pattern is solid only on words he has not met
    Given a Spelling world on a pattern of 7 words that needs 3 right out of 4, past its placement
    When the child finishes the round with 1 word right
    Then Spelling says "You spelt 1 of 3 right"
    When "Next" is tapped
    Then the next round has 2 words the child has not met and 1 he has
    When the child finishes the round with all 3 words right
    Then Spelling says "You have got this one"

  Scenario: AC4: A pattern whose words are all met is not solid on them
    Given a Spelling world on a pattern of 7 words that needs 3 right out of 4, past its placement
    And the child has met all 7 words
    When the child finishes 4 rounds in a row with every word right
    Then Spelling does not say "You have got this one"

  Scenario: AC3: A pattern whose words are all met gets fresh words written ahead, and a fresh right goes solid
    Given a Spelling world on a pattern of 7 words that needs 3 right out of 4, all met, with a mill that writes nudge, wedge and smudge
    Then Spelling says "New words are on their way"
    And the round has 3 words the child has met
    When the mill's words have arrived
    And the child finishes the round with all 3 words right
    Then Spelling does not say "You have got this one"
    When "Next" is tapped
    Then the next round is nudge, wedge and smudge
    And Spelling does not say "New words are on their way"
    When the child finishes the round with all 3 words right
    Then Spelling says "You have got this one"

  Scenario: AC3: With no connection the words it has serve, nothing waits and nothing is asked
    Given a Spelling world on a pattern of 7 words that needs 3 right out of 4, all met, with no connection to the mill
    Then Spelling says "New words are on their way"
    And the round has 3 words the child has met
    And the mill is not asked
    When the child finishes the round with all 3 words right
    Then Spelling does not say "You have got this one"

Feature: The Maths world
  The Maths world finds out where a child is on the maths graph before it teaches anything, then asks problems in four ways: typed,
  heard, seen and done with number tiles, so a child who reads little is never stuck. Each concept has a small picture that helps it
  stick, drawn once and kept, shown beside the problem when there is one and never needed. The homework picture shows its
  concept's picture too.

  Scenario: AC2: A child's first time in Maths starts by finding out what they know
    Given a phone that holds the profile "Rowan"
    When SpellForge opens
    And the tutor says go to "maths-home"
    Then the screen "Maths" is shown
    And Maths says "Let's see what you know"
    And there is a problem with a box for the answer and a "Not sure" button

  Scenario: AC2: A problem can be heard
    Given a Maths world that puts every problem to be heard
    Then there is a "Hear it again" button
    And there is a box for the answer

  Scenario: AC2: A problem can be seen
    Given a Maths world that puts every problem to be seen
    Then the problem is drawn as a picture
    And there is a box for the answer

  Scenario: AC2: A problem can be done with number tiles
    Given a Maths world that puts every problem to be done
    When the child taps the tiles of the right answer and then "Check"
    Then Maths says "Right"

  Scenario: AC2: After the placement a concept's picture sits beside the problem
    Given a Maths world past its placement
    And the phone keeps a picture for every concept
    Then a problem is shown with the concept's picture beside it

  Scenario: AC2: A concept with no picture kept shows no picture
    Given a Maths world past its placement
    Then a problem is shown with no picture beside it

  Scenario: AC2: A homework picture shows its concept's picture
    Given a homework problem the maths graph knows
    And the phone keeps a picture for every concept
    Then the homework problem is shown with the concept's picture

  Scenario: AC4: A problem missed and then answered right again is no proof, the concept is solid only on new problems
    Given a Maths world on a concept that needs 3 right out of 4, past its placement
    When the child answers the problem wrong
    Then Maths says "Not quite yet"
    When "Next" is tapped
    Then the same problem is asked again
    When the child answers it right
    Then Maths says "Right! Well done."
    When the child goes on with "Next"
    Then a different problem is asked
    When the child answers 2 different problems right, one after another
    Then Maths does not say "You have got this one"
    When the child answers one more different problem right
    Then Maths says "You have got this one"

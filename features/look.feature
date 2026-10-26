Feature: The children's worlds look and move well at phone width
  The front door's worlds are big illustrated cards over its scene, its bubbles and hold bar take the look of the child's age, and
  a turn of Spelling or Maths is a card that enters with the motion tokens (docs/motion.md). The rules of each age are held in
  tests/unit/look-worlds.test.tsx; the pixels, the eight shots (the four worlds for a 7 and a 13 year old) and reduced motion are
  tests/e2e/look.spec.ts.

  Scenario: AC1: With no licence the door offers the worlds as big illustrated cards
    Given the phone has no licence
    When the front door opens
    Then "Spelling" and "Maths" are each a card with a picture, over the scene

  Scenario: AC2: A Maths question is a card that enters
    Given a Maths world with its first question
    Then the question and its Check button are in one turn card

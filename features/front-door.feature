Feature: The front door
  The tutor greets the child by voice and he talks back: there is no keyboard, only the big bar to hold and the camera. A picture
  or words shared from another app (Share > SpellForge: a screenshot, a highlighted passage) land in this talk. The shared
  picture waits with Send this picture and Not this one and is never sent by itself; once sent it is the child's turn, the talk is
  kept, and the share is gone, so opening the door again does not land it twice. With no licence the tutor is asleep: the worlds
  are big pictures and nothing is sent. The module is src/features/front-door/share-landing.ts; the phone-width walk is
  tests/e2e/front-door.spec.ts.

  Scenario: AC2: The tutor greets by voice and there is no keyboard
    Given the phone holds the profile "Rowan"
    When the front door opens
    Then the tutor's greeting is spoken
    And there is a bar to hold to talk and a camera, and no place to type

  Scenario: AC2: A shared picture and words wait in the talk and land once they are sent
    Given the phone holds the profile "Rowan"
    And Photos has shared the picture "homework.png" with the words "Question 4" to SpellForge
    When the front door opens with what was shared
    Then the shared picture waits with "Send this picture" and "Not this one"
    And nothing has been sent to the tutor
    When he taps "Send this picture"
    Then the tutor was sent "Question 4" with the picture "homework.png"
    And the tutor's answer is drawn and spoken
    And the talk is kept with his turn and the tutor's answer

  Scenario: AC2: A shared picture that is not wanted is dropped and nothing is sent
    Given the phone holds the profile "Rowan"
    And Photos has shared the picture "homework.png" with the words "Question 4" to SpellForge
    When the front door opens with what was shared
    And he taps "Not this one"
    Then the shared picture is gone
    And nothing has been sent to the tutor

  Scenario: AC2: A share lands once and opening the front door again does not land it again
    Given the phone holds the profile "Rowan"
    And Photos has shared the picture "homework.png" with the words "Question 4" to SpellForge
    When the front door opens with what was shared
    And he taps "Send this picture"
    And the front door opens again
    Then no shared picture waits
    And the tutor was asked once

  Scenario: AC2: Words shared with no picture wait to be sent too
    Given the phone holds the profile "Rowan"
    And Photos has shared the words "The gardener planted the seeds." to SpellForge
    When the front door opens with what was shared
    Then the shared words wait with "Send these words" and "Not this one"
    When he taps "Send these words"
    Then the tutor was sent "The gardener planted the seeds." with no picture

  Scenario: AC2: If the tutor cannot answer, the shared picture stays to be sent again
    Given the phone holds the profile "Rowan"
    And Photos has shared the picture "homework.png" with the words "Question 4" to SpellForge
    And the tutor cannot answer just now
    When the front door opens with what was shared
    And he taps "Send this picture"
    Then he is told to try again
    And the shared picture waits with "Send this picture" and "Not this one"

  Scenario: AC2: With no licence the tutor is asleep and a share is not sent
    Given the phone holds the profile "Rowan"
    And Photos has shared the picture "homework.png" with the words "Question 4" to SpellForge
    And the phone has no licence
    When the front door opens with what was shared
    Then the worlds are offered as big pictures
    And nothing has been sent to the tutor

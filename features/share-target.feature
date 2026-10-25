Feature: SpellForge is a share target
  Share > SpellForge from another app (the Photos app, a browser) puts SpellForge in the phone's share sheet. The service worker
  takes the shared pictures and words, parks them on the phone and opens the app at the tutor's front door, where the picture waits
  in the talk: it is never sent until a grown-up or the child taps Send this picture, and then it is the learner's turn. A share with nothing in it opens Home. While the Tutor is
  off (Settings > Developer > Tutor (preview)), a share opens Home and is dropped, as if SpellForge were not in the sheet.
  The worker's half is also tests/unit/share-target.test.ts, which holds the manifest's share_target equal to the worker's path.

  Scenario: AC5: A picture and words shared from Photos are parked and the app opens at the tutor
    Given the service worker is running
    When Photos shares the picture "homework.png" with the title "Homework" and the words "Question 4" to SpellForge
    Then the worker answers with a redirect to the tutor
    And one share waits holding the picture "homework.png" and the words "Homework" then "Question 4"

  Scenario: AC5: The app takes the parked share once
    Given the service worker is running
    And Photos has shared the picture "homework.png" to SpellForge
    When the app takes the share
    Then it holds the picture "homework.png"
    And taking the share again finds nothing

  Scenario: AC5: A share with nothing in it opens Home and parks nothing
    Given the service worker is running
    When Photos shares nothing to SpellForge
    Then the worker answers with a redirect to Home
    And no share waits

  Scenario: AC5: Opening the share address is a page load, not a share
    Given the service worker is running
    When the share address is opened with a GET
    Then the worker leaves it to the app
    And no share waits

  Scenario: AC3: With the Tutor on, a shared picture waits in the front door's talk and is not sent
    Given the Tutor is on and the phone holds the profile "Rowan"
    And Photos has shared the picture "homework.png" to SpellForge
    When SpellForge opens at the address the worker redirected to
    Then the front door shows the shared picture with "Send this picture" and "Not this one"
    And nothing has been sent to the factory

  Scenario: AC3: Tapping Send this picture lands the shared picture in the talk as the learner's turn
    Given the Tutor is on and the phone holds the profile "Rowan"
    And Photos has shared the picture "homework.png" with the words "Question 4" to SpellForge
    And the factory answers the talk with "I can see your homework. Which question is the hard one?"
    When SpellForge opens at the address the worker redirected to
    And the learner taps "Send this picture"
    Then the talk shows the learner's turn "Question 4" and the tutor's answer "I can see your homework. Which question is the hard one?"
    And one tutor-talk grist went to the factory carrying the picture "homework.png"

  Scenario: AC3: A share lands on the door even when the app was last left on another screen
    Given the Tutor is on and the phone holds the profile "Rowan"
    And the app was last left on the Spelling world's progress screen
    And Photos has shared the picture "homework.png" to SpellForge
    When SpellForge opens at the address the worker redirected to
    Then the front door shows the shared picture with "Send this picture" and "Not this one"

  Scenario: AC5: With the Tutor off, a shared picture opens Home and is dropped
    Given the phone holds the profile "Rowan"
    And Photos has shared the picture "homework.png" to SpellForge
    When SpellForge opens at the address the worker redirected to
    Then Home greets "Hey, Rowan!"
    And no share waits

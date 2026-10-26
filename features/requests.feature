Feature: Requests to the maker
  What the app cannot do, the child or a grown-up tells the tutor, and the tutor offers to pass it on: nothing is sent until the
  Send this to the maker button is tapped, and the same words from the same person are one request. Grown-ups' Requests lists
  the requests by who asked, each with where it stands, and the things people are expected to ask for as a list to pick from;
  picking one takes them to the tutor to say it. Conversations is every talk kept on the phone, searched by a word and opened
  to read. There is no feedback form and no email. The modules are src/features/requests and src/features/talks; the
  phone-width walk is tests/e2e/requests.spec.ts.

  Scenario: AC1: The tutor offers to pass on what the app cannot do and one tap sends one request
    Given the phone holds the profile "Rowan"
    And the tutor says the app cannot read a book aloud and offers to pass it on
    And Photos has shared the words "Can you read my maths book out loud to me?" to SpellForge
    When the front door opens with what was shared
    And he taps "Send these words"
    Then the tutor offers "Send this to the maker"
    And nothing has been sent to the maker
    When he taps "Send this to the maker"
    Then one request was sent to the maker with his words and his id
    And he is told it was sent

  Scenario: AC1: An answer that offers nothing shows no Send button
    Given the phone holds the profile "Rowan"
    And the tutor answers with no offer
    And Photos has shared the words "Which question is the hard one?" to SpellForge
    When the front door opens with what was shared
    And he taps "Send these words"
    Then the tutor's answer is drawn
    And the tutor offers no "Send this to the maker"

  Scenario: AC1: If the request cannot be sent he is told and may tap again
    Given the phone holds the profile "Rowan"
    And the tutor says the app cannot read a book aloud and offers to pass it on
    And the maker cannot be reached
    And Photos has shared the words "Can you read my maths book out loud to me?" to SpellForge
    When the front door opens with what was shared
    And he taps "Send these words"
    Then the tutor offers "Send this to the maker"
    When he taps "Send this to the maker"
    Then he is told it was not sent
    And the tutor offers "Send this to the maker"

  Scenario: AC4: Requests lists who asked and where each stands
    Given the phone holds the profile "Rowan"
    And Rowan asked the maker for "A darker screen at night"
    And a grown-up asked the maker for "A weekly email about progress"
    When Grown-ups opens Requests
    Then the requests are listed under "Rowan" and "A grown-up"
    And "A darker screen at night" and "A weekly email about progress" both stand at "Sent"

  Scenario: AC4: Requests lists the expected asks and picking one goes to the tutor
    Given the phone holds the profile "Rowan"
    And Rowan asked the maker for "A darker screen at night" as the expected ask "A new look"
    When Grown-ups opens Requests
    Then the expected asks are listed
    And the expected ask "A new look" says it was asked and stands at "Sent"
    When he picks the expected ask "A new word game"
    Then the tutor is opened to talk about "A new word game"

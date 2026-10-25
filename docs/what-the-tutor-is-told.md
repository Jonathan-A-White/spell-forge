# What the tutor is told

The front door's tutor (the tutor-talk grind, `grinds/tutor-talk.*`) is told, on each turn, only what bears on its
answer. This is the list (M39 of plans/spellforge-2-2026-10-22). `src/features/front-door/tutor-talk-request.ts`
builds the request, and `tests/unit/tutor-talk-request.test.ts` reads both tables below: every field the request
carries is a row of the first, every setting of `AccessibilitySettings` and every field of a `Profile` is named in
exactly one of them, and a field added to the request without a row here fails. A field is sent only when it holds
something: an empty one is left out, and the grind reads a missing field as not known.

His words: "you should be just talking to the tutor". The tutor needs what a good tutor in the room would know: what
he said, what was said before, who he is as a learner, what he is aiming at and where he is now. It does not need
how the screen looks or anything that names him.

## What a turn carries

| Field | From | Why it bears on the answer |
| --- | --- | --- |
| `schemaVersion` | the request schema | the grind reads the request by its version |
| `message` | what he said now (cut at 2000 characters) | the turn itself; empty on the first turn, which is the greeting |
| `pictures` | how many pictures go with the message | the tutor looks at a photo or a shared screenshot before it answers |
| `history` | the talk's turns before this one, oldest first | what was said, so the tutor does not ask again; the oldest go first over the budget |
| `memory.facts` | the talk's memory (`@voice-kit/talks`) | what was said many turns ago and still matters; kept when turns are cut |
| `memory.summary` | the talk's memory | the talk so far in a few sentences, for the turns no longer in `history` |
| `strictness` | `settings.tutorStrictness` (absent: `meaning-gated`) | how exactly his reading must match the words |
| `parent_notes` | `settings.tutorNotes` | the parent's standing notes shape the pace and the method |
| `learner.age` | the learner profile (`learn-kit/learner`) | words and steps fit to his age |
| `learner.gender` | the learner profile | told by him; the tutor speaks of him rightly |
| `learner.experience` | the learner profile | where to start: what he already knows |
| `learner.learnerKind` | the learner profile | how he learns best (by doing, by hearing) |
| `learner.speed` | the learner profile | how fast to go and how much at once |
| `goal.id` | the goal he chose with the tutor | the tutor talks about his goal rather than offering another |
| `goal.title` | the goal he chose | the goal in the words he knows |
| `goal.progress` | the goal's progress (0 to 1) | how far along it he is, to encourage him truthfully |
| `goals` | the goals the app can scaffold (`MATHS_GOALS`) | a goal suggestion names one of these and no other |
| `progress.spelling.band` | the spelling graph's grade band he works in | the level of what the tutor offers in spelling |
| `progress.spelling.next` | the next spelling nodes, by child-facing name | what the spelling world would give him next |
| `progress.maths.band` | the maths graph's grade band he works in | the level of what the tutor offers in maths |
| `progress.maths.next` | the next maths nodes, by child-facing name | what the maths world would give him next |
| `screen.name` | the screen he asked from (M37) | the tutor answers about where he is |
| `screen.facts` | what that screen shows, a few short lines | what he is looking at; cut after the turns over the budget |

Over the budget (`TUTOR_TALK_MAX_BYTES`, 9000 bytes of JSON in UTF-8), the request loses its oldest turns first, then
the screen's last facts, and the memory's oldest facts only last of all.

## What is not sent

| Setting or record | Why it is not sent |
| --- | --- |
| `profile.id` | a database key; it means nothing to the tutor |
| `profile.name` | his name never leaves the phone for the mill (VISION.md: children's names never go on chain); the tutor never uses a name |
| `profile.avatar` | a picture choice on the screen; it bears on no answer |
| `profile.themeId` | the look of the app; it bears on no answer |
| `profile.pin` | the parent's PIN hash: a secret |
| `profile.createdAt` | when the profile was made; it bears on no answer |
| `profile.importFilterWords` | words dropped from a photographed list; only the word-list import reads them |
| `profile.status` | active or archived; the front door only talks to an active profile |
| `profile.gradeGoal` | the spelling test's readiness target; the spelling world decides readiness, not the talk |
| `profile.learner` | what the tutor knows of the child is sent as the request's own `learner` part, built from it by the caller; the profile object itself is not sent |
| `settings.fontSize` | how the words are drawn; the tutor's words are the same at any size |
| `settings.fontWeight` | how the words are drawn |
| `settings.fontFamily` | how the words are drawn |
| `settings.letterSpacing` | how the words are drawn |
| `settings.lineHeight` | how the words are drawn |
| `settings.contrastMode` | the colours of the screen |
| `settings.backgroundColor` | the colours of the screen |
| `settings.reducedMotion` | how the screen moves |
| `settings.tapTargetSize` | the size of the buttons |
| `settings.sessionMaxMinutes` | the app ends a session itself; the tutor is not the clock |
| `settings.sessionAdaptive` | how the app shortens a session; the app's own |
| `settings.dailyGoalMinutes` | the app's daily minutes; the tutor's goal is the learning goal above |
| `settings.learningStrategy` | the order the spelling world shows new words in; the world's own |
| `settings.tutorVoice` | the phone speaks the tutor's words; the voice is chosen on the phone, not by the mill |

## What a form turn carries

The form door ("Let the tutor do it", `src/features/tutor/form-door.tsx`) is a talk of its own over the same tutor-talk grind. It
builds its own small request, not the front door's: `schemaVersion`, `message`, `history`, `memory` when the talk has one,
`strictness`, and `form`. It sends no `learner`, `goal`, `progress`, `parent_notes` or `screen`, and no setting or profile field: the
tutor is helping with a form, not teaching. `form` is the form as the tutor sees it (`@voice-kit/forms`): its `name`, the `command` its
Send runs, and for each field its `name`, `label`, `hint`, `required`, `kind`, what it holds now (`value`, cut at 600) and, for a
choice, its `options`. The answer's `form_values` fill fields and `form_ask` names the one asked about; the tutor never sends. With no
licence no request is made (`src/shell/licence-gate.ts`).

Four forms have the door: Pick a question, New Word List / Edit List, Record Test Results (the teacher's grade only) and Print Practice
Sheet. The Welcome wizard has a spec and a command and no door: its name field is the child's name, which never leaves the phone for the mill
(the table above). Pick a question sends what is typed to the tutor, the recovery answer too; the answer is kept on the phone only as a hash,
so the Governor decides whether the door stays on that form once an app-level tutor is handed to it.

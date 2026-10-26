# Where the old app took typed text from a child (the sweep, mw-79en7t.41)

VISION.md: the child reads little and is not expected to type. The front door (`src/features/front-door/FrontDoor.tsx`) has no keyboard at all: hold to talk, or the camera. This is every place in `src/` where a field takes typed text (`<input>`, `<textarea>`, a Composer with `type: true`, the on-screen keyboard), swept on 2026-10-25 at 0.1.175, with what becomes of it. **Fate** is one of: **spoken** (he says it: hold to talk), **a picture** (he takes or shares one), **game input** (a game's own answer field, kept: spelling the word is the test), **grown-up** (a parent types it, behind the PIN or on a grown-up screen; kept), or **kept for now** (typed today, on a screen the front door replaces; named so it is not forgotten).

Nothing in this list was changed by the sweep: the old screens behave as they did (CLAUDE.md). The fates say where each is going.

| Where | What is typed | Who | Fate |
|---|---|---|---|
| `features/front-door/FrontDoor.tsx` (Composer `type: false`) | nothing: hold to talk, the camera, a shared picture or words with one tap | the child | **spoken** and **a picture**: the new door; it has no field |
| `features/talks/Conversations.tsx` (voice-kit's TalkList search) | a word to find in the talks kept on the phone; the list itself is tapped, never typed | a grown-up (the child taps a talk) | **grown-up** (mw-79en7t.20; the feedback form's Composer is gone, a request is made by talking to the tutor) |
| `features/practice/spelling-input.tsx`, `features/learning/keyboard-input.tsx` (SpellingField, over `custom-keyboard.tsx`) | the word being spelled, on the app's own on-screen keyboard | the child | **game input**: the child spelling the word is the test; nothing to speak instead |
| `features/practice/spelling-quiz.tsx`, `word-relay-race.tsx` (the keyboard) | the correct spelling in the quiz and the relay race | the child | **game input** |
| `features/practice/letter-bank.tsx`, `unscramble-drag-drop.tsx`, `spell-catcher.tsx`, `letter-invasion.tsx`, `word-volcano.tsx`, `word-search.tsx` | taps and drags on letters, no text field | the child | **game input** (taps, not typing) |
| `worlds/maths/MathsWorld.tsx` (the answer field) | the answer to a maths question | the child | **game input**: the answer is the test |
| `features/tutor/math-loop.tsx` (`tutor-math-answer`) | an answer in the old tutor's maths loop | the child | **game input** |
| `features/tutor/tutor-screen.tsx` (`tutor-problem-text`, two boxes: Type the problem, and the retype after a misread) | the homework problem as words | the child or a parent | **kept for now**: the old tutor's start screen; the front door's talk and its camera replace it (**spoken** or **a picture**) once the door is drawn in the app |
| `features/tutor/ask-the-tutor.tsx` (Composer, `type: true`, attach, camera) | a grown-up's question to the tutor, up to 3 pictures | a parent (behind the PIN) | **grown-up**: kept; it is the parent's ask, not the child's |
| `features/tutor/tutor-notes.tsx` (New note) | a note to the tutor from a parent | a parent | **grown-up** |
| `features/tutor/parent-gate.tsx`, `pin-pad.tsx` (PIN, recovery question and answer) | the PIN and a recovery answer | a parent | **grown-up** |
| `features/tutor/tutor-settings.tsx` (Search voices) | a search of the phone's voices | a parent | **grown-up** |
| `features/feedback/feedback-form.tsx` (Composer, `type: true`) | a message to the maker | a parent | **grown-up** |
| `features/onboarding/first-run.tsx` (Enter your name) | the child's first name | a parent setting up | **grown-up**: the front door's getting-to-know asks by voice (a profile update), but the first name is typed once, by the grown-up who installs the app |
| `features/word-lists/list-editor.tsx` (name, test date, the words, a photo) | a spelling list: its name, date and words | a parent | **grown-up**; the photo path is **a picture** already (camera import) |
| `features/word-lists/word-list-detail.tsx` (Add a word, edit a word) | one word | a parent | **grown-up** |
| `features/word-lists/record-test-results.tsx` (the percentage) | a teacher's grade | a parent | **grown-up** |
| `features/word-lists/camera-import.tsx`, `qr-import.tsx`, the Tutor's `tutor-photo-input` | no text: a photo or a file | either | **a picture** |
| `features/settings/import-filter-settings.tsx` (phrases to skip, edit a phrase) | a phrase the photo import ignores | a parent | **grown-up** |
| `features/settings/settings-panel.tsx` (backup file) | no text: a file | a parent | **grown-up** |
| `features/tutor/session-record.tsx` (Session as JSON, read only) | none: the field is read-only | a parent | **grown-up** (nothing typed) |
| `shell/HearAnyWord.tsx` | none: a long press says a word aloud; fields are left alone | the child | **spoken** (the other way round: the app speaks) |

Not typed text, so not in the table: `useDraft` (`features/tutor/use-draft.ts`) only keeps what a field above holds.

What is left for a later story, said plainly: the old Tutor screen's two problem boxes are the only child-facing typed text outside a game, and they go when the front door is drawn in the app and the old tutor entry retires. Neither the door's route nor the real tutor-talk send to the factory exists yet (see the closing comment of mw-79en7t.41).

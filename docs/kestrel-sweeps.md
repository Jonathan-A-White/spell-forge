# Kestrel 15d: the SM-2 sweep and the speech sweep (2026-10-25, 0.1.176)

Two sweeps the Spelling world (mw-79en7t.15) owed. Each is a list of every caller found by `git grep` on the date above, with its fate: **moved** (to learn-kit or voice-kit), or **kept** and why. The learn-kit side of the SM-2 sweep, `docs/replaces.md` of mw-79en7t.2d, is not in the pinned learn-kit (`node_modules/learn-kit` ships only its READMEs), so the list below is the app's own.

## The SM-2 sweep: `src/core/spaced-rep/scheduler.ts` and `src/core/adaptive`

The Spelling world (`src/worlds/spelling/spelling-flow.ts`) already schedules with learn-kit: a node's review is `review()` of `learn-kit/graph` over its own store (`spelling-store.ts`), and the frontier is learn-kit's `frontier()`. It never calls the old path. What still calls it is the old per-word path over `wordStats`, for the child's own word lists.

| Caller | What it calls | Fate |
|---|---|---|
| `src/features/practice/session-controller.ts:137` | `updateWordStats` (`scheduler.ts`; `calculateNextReview` is called only inside it) | **kept**: the Practice screen's word-by-word session on a child's own list, whose stats the Progress, Home and word-detail screens read. Moving it changes an existing screen's behaviour (CLAUDE.md); the story that places a list's words on the graph and sends its drill to those nodes is mw-79en7t.16, and the old path leaves with it. |
| `src/features/practice/session-controller.ts:169,174` | `analyzeEngagement`, `determineAction` (`core/adaptive/engine.ts`; the only caller outside tests) | **kept**: the Practice session's wrap-up and scaffolding signal, with no equivalent in learn-kit; the Spelling world's rounds are three words and do not wrap up. |
| `src/core/spaced-rep/coin-service.ts:66-82` (`getWordsDueCount`, `getWordsDueIds`), read by `features/dashboard/home-screen.tsx`, `progress-view.tsx` | reads `nextReviewDate`, which only `updateWordStats` writes | **kept**: the "due" counts of the old screens. Follows the first row. |
| `src/features/dashboard/word-detail-view.tsx:154` | reads `nextReviewDate` | **kept**: shows when a list word is next due. Follows the first row. |
| `src/features/word-lists/add-words.ts:53`, `src/shell/use-learner.ts:234`, `src/shell/use-lists.ts:32` | write a new `wordStats` row with `nextReviewDate: new Date()` | **kept**: a new word is due at once; data, not the scheduler. |
| `src/core/spaced-rep/test-demotion.ts` (via `use-lists.ts`) | `demoteOneLevel`, `bucketMinCorrect` (`buckets.ts`) | **kept**: a failed test drops a list word a bucket; the buckets are the coin economy's ladder too (`earnCoinForMastery`). |
| `src/core/phonics/engine.ts`, `.../languages/spanish/engine.ts` | their own private `computeDifficulty` | not the spaced-rep one: nothing to move. |

Tests that name the old path stay: `tests/unit/spaced-rep.test.ts`, `adaptive-engine.test.ts`, `mastery-levels.test.ts`, `difficulty-score.test.ts`, `coin-service.test.ts`, `test-results.test.ts`. Nothing moved to learn-kit in this story: the Spelling world was built on it from the start (15c).

## The speech sweep (M2): every game and drill, voice-kit only, the language named at each call

Speech is `voice-kit/speech`'s `speak()` and is called from exactly two modules, `src/audio/speech.ts` (the words) and `src/audio/tutor-speech.ts` (the tutor); `tests/unit/audio.test.ts` holds both claims (no `synth.speak`, no `new SpeechSynthesisUtterance`, only those two import `speak`). A game or drill never speaks: it is handed `onSpeak(word)` by its screen, and the screen names the language. `sayWord`, `sayWordSlowly`, `spellWord`, `sayThenSpell` (and `AudioManager`'s, and `learning/audio-helpers.ts`'s) take the language with no default, so a call that does not name it does not compile.

| Caller | Language named | |
|---|---|---|
| `src/shell/screens/spelling.tsx` `onSpeak` (the Practice, Practice Games and Quiz screens, and their games) | the active list's `language` (`'en'` with no list) | changed here: was `'en'` by default whatever the list |
| the same file's `spelling-home` (the Spelling world's placement word and games) | `'en'`: the spelling graph's words are English | named here |
| the same file's word detail `onPlayAudio` | the language of the word's list | changed here |
| `src/features/learning/learning-screen.tsx` (auto-play, Hear it, a chunk of Sound It Out) | `languageOfList(word.listId)`, given by the shell; `'en'` when it is not given | changed here |
| `src/shell/HearAnyWord.tsx` | the word's own (`hit.language`) | already named |
| `src/worlds/maths/ask-forms.tsx` | the world's `language` | already named |
| `src/features/word-lists/tts-setup-help.tsx` | `getTtsStatus(languageCode)`, a status, not speech | already named |
| `src/features/tutor/session-record.tsx:76` | `new Audio(url).play()` replays the child's own recording; no speech engine | not speech: kept |

`src/audio/speech.ts` is **kept, not deleted**: it is not an engine any more but the one place the word helpers live over the kit (the picked voice only when it speaks the word's language, the `rankVoice` rank, the stuck-engine timeout the kit lacks, the warm-up, the voice list for the Voice picker). Deleting it would put that into every game's call. Its remaining callers: `src/audio/manager.ts` (`AudioManagerImpl`: the busy flag over the four helpers; used by every screen above through `services.ts`), `src/audio/index.ts` (the barrel), `src/shell/HearAnyWord.tsx` (`isTtsAvailable`, `sayWord`) and `src/shell/app-state.ts` (`warmUp`), `src/features/tutor/tutor-settings.tsx` (`listTutorVoices`, `onVoicesChanged`), `src/features/word-lists/tts-setup-help.tsx` (`getTtsStatus`), `src/features/tutor/speech-bar.tsx` (`WORD_SPEECH_KEY`) and `src/worlds/maths/ask-forms.tsx` (`sayWord`, `stopSpeaking`).

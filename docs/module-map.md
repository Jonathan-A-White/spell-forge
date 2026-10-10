# SpellForge module map

Written 2026-10-10 at base commit 56ca5d4 (mw-vtjxh4.21), package version 0.1.162. Docs only: no behaviour changed and no source file moved.

Why it exists. The Governor's rule (the vault's PWA best practices, "Modular Boundaries"): draw the boundaries so two stories can change two modules at once without touching each other, and keep refactoring toward that; common code lives once in a shared library (library best practices, "When Code Becomes a Library"). The factory runs two stories of one rig in parallel only when they touch different files, so this map names the modules, the files stories fight over, and the cuts that would end the fights.

How to read it. Section 1 is the modules as they are, section 2 the files most stories collide on, section 3 the proposed refactors (ranked by how much parallel work each frees), section 4 where the code breaks a rule of the vault's 27-modular-boundaries.md, section 5 the code another app could use (or already copies). A path in backticks exists in the repo at the base commit; a path that does not exist yet is written in bold, and an import specifier of another package (the bsv-kit entry points) or a path in another repo is written without backticks. To check the backticked paths:

```sh
awk '/^```/{f=!f; next} !f' docs/module-map.md | grep -o '`[^` ]*`' | tr -d '`' \
  | grep -E '/|\.(tsx?|md|json|css|ya?ml)$' | sort -u | while read -r p; do test -e "$p" || echo "missing: $p"; done
```

## 1. Modules

SpellForge has no workspaces. A module is a folder under `src/` with a barrel file (the rule in `CLAUDE.md`), plus the files directly under `src/`. Sizes are lines of TypeScript at the base commit. "Imports" lists the other app modules and the vendors the module reaches; the full graph was read from the `import` statements.

### 1a. Foundations and engines (no screens)

| Module | One responsibility | Entry file and exported API | Imports |
|---|---|---|---|
| `src/contracts/` (749 lines) | The one place the app's entity types and the in-app event bus are defined | `src/contracts/index.ts` re-exports everything in `src/contracts/types.ts` (707 lines: `Profile`, `WordList`, `Word`, `WordStats`, `Theme`, `AppEvent`, `EventBus`, tutor and parent-ask types, 84 exports) and `createEventBus()` from `src/contracts/events.ts` | `src/bsv/types.ts` (type only) |
| `src/data/` (1713) | Persist everything in IndexedDB behind repositories | `src/data/db.ts` (`db`, `openDatabase`, fifteen schema versions), `src/data/repositories/index.ts` (sixteen repo objects: `profileRepo`, `wordListRepo`, `wordRepo`, `statsRepo`, `sessionRepo`, `streakRepo`, `activityProgressRepo`, `learningProgressRepo`, `coinRepo`, `themeProgressRepo`, `testResultRepo`, `bsvWalletRepo`, `bsvPendingSpendRepo`, `bsvTokenRepo`, `tutorRepo`, `parentAskRepo`), `src/data/import-export.ts` (`exportProfile`, `importProfile`, `parseExportJson`) | `src/contracts/`, `src/bsv/license-token.ts` (type only); Dexie, uuid |
| `src/core/phonics/` (1505) | Break a word into syllables, phonemes and spelling patterns, and write a hint | `src/core/phonics/index.ts`: `analyzeWord`, `splitSyllables`, `generateHint`, `patterns`, `analyzeWordMultilingual` (languages under `src/core/phonics/languages/`) | `src/contracts/`, `src/i18n/` |
| `src/core/spaced-rep/` (564) | When a word is next due, which bucket it sits in, how hard it is, and the coin economy that rides on mastery | `src/core/spaced-rep/index.ts`: `updateWordStats`, `calculateNextReview`, `transitionBucket`, `computeDifficulty`, `computeTestDemotion`, `earnCoinForMastery`, `spendCoinForGame`, `awardPendingMilestones` | `src/contracts/`, `src/data/` (the coin service reads repositories) |
| `src/core/word-selection/` (376) | Choose the words of one practice session (the 60/30/10 mix, test-day boost) | `src/core/word-selection/index.ts`: `selectSessionWords`, `interleaveByPattern` | `src/contracts/`, `src/core/` |
| `src/core/adaptive/` (128) | Read fatigue, frustration and boredom out of a session's attempts | `src/core/adaptive/index.ts`: `analyzeEngagement`, `determineAction` | `src/contracts/` |
| `src/core/learning/` (337) | The four-stage letter-hiding progression of Learning mode | `src/core/learning/index.ts`: `processAttempt`, `getInputMode`, `generateWordDisplay`, `findNextWord` | `src/contracts/` |
| `src/core/memory-aids/` (718) | Phonetic, pattern and mnemonic memory aids for a tricky word | `src/core/memory-aids/index.ts`: `generateMemoryAids`, `findTrickyPart` | `src/contracts/`, `src/core/phonics/` |
| `src/core/mastery.ts`, `src/core/haptics.ts`, `src/core/shuffle.ts` (142) | Three loose helpers: count mastered words, vibrate, shuffle | no barrel: `src/core/mastery.ts` (`countMasteredWords`, `getWordCategory`, `computeProgressPercent`), `src/core/haptics.ts` (`hapticTap`, `hapticError`, `hapticSuccess`), `src/core/shuffle.ts` (`shuffle`) | `src/contracts/` |
| `src/accessibility/` (231) | Validate the child's display settings and write them as `--sf-*` CSS variables | `src/accessibility/index.ts`: `DEFAULT_SETTINGS`, `validateSettings`, `applySettings`, `mergeSetting`, `PRESETS`, `presetToSettings` | `src/contracts/` |
| `src/i18n/` (195) | The language registry: alphabets, voice preferences, TTS help text per language | `src/i18n/index.ts`: `getLanguageConfig`, `getAllLanguages`, `DEFAULT_LANGUAGE`, `getTtsInstructions` | none |
| `src/audio/` (806) | Speak words and the tutor, and record the child reading | `src/audio/index.ts`: `AudioManagerImpl` (exclusive speaking), `sayWord`, `spellWord`, `sayThenSpell`, `warmUp`, `getTtsStatus`, `sayAsTutor`, `pauseTutorSpeech`, `listTutorVoices`, `ReadingRecorder`, `useAudioBusy`; the retry/backoff TTS is `src/audio/speech.ts` (449 lines) and the tutor's speech is `src/audio/tutor-speech.ts` over bsv-kit/speech | `src/i18n/`; bsv-kit/speech, React |
| `src/ocr/` (1824) | Read a word list off a photo on the device (Tesseract), with a remote fallback | `src/ocr/index.ts`: `createOcrManager`, `OcrManager`, `LocalOcrProvider`, `RemoteOcrProvider`, `filterImportWords`, `correctOcrWords`, `createTesseractRecognizer`; the biggest file is `src/ocr/preprocess.ts` (806 lines: orientation detection, flattening) | `src/contracts/`; tesseract.js |
| `src/themes/` (512) | The three reward themes (Dragon Forge, Monster Lab, Star Trail) and their milestone logic | `src/themes/index.ts`: `themeEngine`, the three theme objects, `ThemeEffects` | `src/contracts/` |
| `src/grist/` (649) | The app's calls to the factory: send a request, read the answer, and the poll loops for the tutor and the parent ask | `src/grist/index.ts`: `sendGrist`, `readAnswer`, `warmLicence`, `gristFileFromBlob`, `shrinkPhoto`, `GristInFlight`, `ParentAskInFlight`, `TUTOR_TURN_GRIND`, `PARENT_ASK_GRIND`, `WORD_LIST_GRIND`, answer guards; `src/grist/factory.ts` is a thin caller of bsv-kit/bsv and bsv-kit/grist | `src/contracts/`, `src/data/` (the poll loops read the tutor and parent-ask repositories); bsv-kit/bsv, bsv-kit/grist, @bsv/sdk |
| `src/bsv/` (6501, 39 files) | The BSV chain layer: keys, the WhatsOnChain provider, OP_RETURN record encoding, send, write, read and scan, pending-spend bookkeeping, License and Fuel token builders over sCrypt contracts, epoch encryption and gated records | `src/bsv/index.ts` (182 lines, 177 exported names); the heavy files are `src/bsv/license-contract.ts` (1255), `src/bsv/license-token.ts` (524), `src/bsv/epoch-crypto.ts` (487), `src/bsv/record.ts` (452); contracts and their toolchain live under `src/bsv/contracts/` and Node-only helpers under `src/bsv/node/`. Already shipped as the package in `packages/bsv/package.json` (spell-forge-bsv 0.1.0) | nothing of the app: only @bsv/sdk and scrypt-ts (its `src/bsv/types.ts` keeps its own `Utxo`, `BsvEvent` and `EventBus`) |
| `src/debug/` (231), `src/hooks/` (74) | Debug switches and the overlay (`src/debug/index.ts`: `useDebugMode`, `useTutorFlag`, `DebugOverlay`); the Android back-button hook (`src/hooks/use-back-button.ts`: `useBackButton`) | the barrel, and the one file | React |

### 1b. Feature modules (screens)

Every feature is a folder under `src/features/`; the screens are reached only from `src/App.tsx`, which renders them in a `switch (view)`.

| Feature | One responsibility | Entry and API | Imports (besides contracts, React) |
|---|---|---|---|
| `src/features/practice/` (7941, 26 files) | The practice session and every mini-game: letter bank, Letter Invasion, Word Volcano, Spell Catcher, Relay Race, Word Search, quiz | no barrel. `src/features/practice/practice-screen.tsx` (`PracticeScreen`), `src/features/practice/practice-games.tsx` (`PracticeGames`, 995 lines), `src/features/practice/quiz-screen.tsx` (`QuizScreen`), `src/features/practice/session-controller.ts`; each game is a screen file beside a logic file of its own | `src/core/`, `src/data/`, `src/i18n/` |
| `src/features/learning/` (924) | Learning mode: spell a word with fewer and fewer letters shown | `src/features/learning/index.ts`: `LearningScreen`, `KeyboardInput`, `sayAndSpell` | `src/audio/`, `src/core/`, `src/data/`, `src/features/practice/` (the custom keyboard) |
| `src/features/dashboard/` (2540) | Home, progress, the calendar, a day's and a word's detail, coin history | `src/features/dashboard/index.ts`: `HomeScreen`, `ProgressView`, `WordDetailView`, `CoinHistory`, `PracticeCalendar`, `DayDetailView` | `src/core/`, `src/data/` (and `db` directly), `src/debug/`, `src/features/rewards/` |
| `src/features/rewards/` (1385) | Reward tracking, the monster collection, pack opening, creature art | `src/features/rewards/index.ts`: `rewardTracker`, `monsterCollection`, `MonsterStable`, `PackOpening`, `CreatureArt` | `src/data/`, `src/themes/` |
| `src/features/word-lists/` (3472, 17 files) | Word lists: edit, add by camera, photo, QR or PDF, record test results, test history, trouble words | no barrel. `src/features/word-lists/word-lists-view.tsx`, `src/features/word-lists/word-list-detail.tsx`, `src/features/word-lists/list-editor.tsx`, the photo-import queue `src/features/word-lists/photo-import.ts` (`startPhotoImportQueue`, `startPhotoImport`, `usePhotoImportStatus`), `src/features/word-lists/add-words.ts` (`addWordsToList`) | `src/audio/`, `src/core/`, `src/data/` and `db`, `src/grist/`, `src/i18n/`, `src/ocr/`; @bsv/sdk, dexie, jspdf, qrcode, html5-qrcode |
| `src/features/tutor/` (3163, 23 files) | The Tutor (a child brings a problem, reads aloud, does the maths) and the Grown-ups screen (PIN, sessions, notes, settings, ask the tutor). Two jobs in one folder: the child's half is 1517 lines, the grown-ups' half 1625 | `src/features/tutor/index.ts` (21 lines, 45 names): `TutorScreen`, `ParentScreen`, `ParentGate`, `AskTheTutor`, `TutorSettings`, `sendProblem`, `sendReading`, `sendMath`, `deviceKey`, the PIN functions | `src/audio/`, `src/core/`, `src/data/`, `src/grist/`, `src/accessibility/`; bsv-kit/bsv, bsv-kit/grist, bsv-kit/speech/react, dexie, @bsv/sdk |
| `src/features/settings/` (1427) | The Settings screen, share panel, import filter | no barrel. `src/features/settings/settings-panel.tsx` (720 lines), `src/features/settings/share-panel.tsx`, `src/features/settings/qr-code.ts` | `src/accessibility/`, `src/debug/`, `src/version.ts`, `src/features/device-key/`, `src/features/bsv-debug/` |
| `src/features/device-key/` (154) | Make and show this device's key | `src/features/device-key/index.ts`: `DeviceKeySection`, `DevicePublicKey`, `createDeviceKey` | `src/bsv/`, `src/data/`, `src/grist/`; @bsv/sdk |
| `src/features/bsv-debug/` (1273) | The hidden BSV Debug screen: wallet, fuel, send, write a record, the token panel | `src/features/bsv-debug/index.ts`: `BsvDebugScreen`, `TokenPanel`, `useBsvDebugMode` | `src/bsv/`, `src/data/`, `src/features/settings/qr-code.ts`, `src/features/device-key/`; @bsv/sdk |
| `src/features/about/` (338), `src/features/feedback/` (209), `src/features/onboarding/` (87), `src/features/profiles/` (187) | About and credits; the feedback form and its offline sync; first run; the profile picker | `src/features/about/index.ts` (`AboutScreen`, `CREDITS`), `src/features/feedback/feedback-form.tsx`, `src/features/onboarding/first-run.tsx`, `src/features/profiles/profile-selector.tsx` | `src/data/` (the feedback sync reads `db`), `src/themes/`, `src/accessibility/`, `src/version.ts` |

### 1c. The app shell

| Module | One responsibility | Entry and API | Imports |
|---|---|---|---|
| `src/App.tsx` (1324 lines), `src/main.tsx`, `src/error-boundary.tsx`, `src/version.ts` | Mount the app: load the database and the profile, hold the state of every screen, pick the screen by `view`, and carry out every action a screen asks for | `src/App.tsx` exports `App`; `type AppView` names 28 screens; 18 lines use `useState` and 30 use `useCallback`; the handlers (`selectProfile`, `handleSessionEnd`, `handleSaveList`, `handleQrImport`, `handleSaveTestResults`, `handleExportProfile`, the profile archive/restore/delete set) are all defined in it | every module above; it imports into features by file in 23 places (`src/features/word-lists/list-editor.tsx`, `src/features/practice/practice-screen.tsx`) as well as by barrel |

Observed dependency facts (from the import statements at the base commit):

- Engines (`src/core/`, `src/accessibility/`, `src/themes/`, `src/ocr/`, `src/i18n/`) import only `src/contracts/`, `src/i18n/` or each other; none imports a feature. That is a healthy layering, and it is why a core change rarely collides with a screen change.
- `src/bsv/` imports nothing of the app, but two app modules import it back: `src/contracts/types.ts` (a type, so the event union can carry `BsvEvent`) and `src/data/db.ts` with `src/data/repositories/bsv-token-repository.ts` (the `LicenseToken` type). That seam shows in the collisions below: `src/bsv/index.ts` and `src/contracts/types.ts` changed together in 8 commits.
- Features import each other eight times. Five go through a barrel (`src/features/settings/` and `src/features/bsv-debug/` import `src/features/device-key/`; `src/features/dashboard/` imports `src/features/rewards/` three times). Three go past it to a file: `src/features/learning/keyboard-input.tsx` imports `src/features/practice/custom-keyboard.tsx`; `src/features/bsv-debug/bsv-debug-screen.tsx` imports `src/features/settings/qr-code.ts`; `src/features/settings/settings-panel.tsx` imports `src/features/bsv-debug/bsv-debug-flag.ts`.
- `src/grist/` and `src/features/tutor/` and `src/features/word-lists/photo-import.ts` each read the device key from `bsvWalletRepo`, turn it into a `PrivateKey` and call the factory: three copies of "wallet, key, send, poll, apply" (see R4).

## 2. Collisions

The 15 source files changed by the most commits in the 30 days to 2026-10-09 (174 commits touched `src/`, from 2026-09-21), from this command run at the base commit 56ca5d4:

```sh
git log --since=30.days --name-only --format= -- src | sort | uniq -c | sort -rn | head -15
```

| File | Commits | Lines | Why it collides |
|---|---|---|---|
| `src/bsv/index.ts` | 29 | 182 | Every new chain function or type is one more name in a 140-name re-export list; the BSV work of a month passes through it |
| `src/features/bsv-debug/bsv-debug-screen.tsx` | 19 | 586 | Every chain feature (the public key, a Send sats panel, write a record, typed reads, the Scan list of anchor payments) added a section to this one screen |
| `src/contracts/types.ts` | 18 | 707 | Every entity, tutor and parent-ask story adds its types to the one file that all code imports |
| `src/features/tutor/reading-loop.tsx` | 14 | 537 | The read-aloud turn: the hold-to-talk bar, push-to-talk, the waiting states, rereading focus words, the speaking bar |
| `src/features/tutor/tutor-screen.tsx` | 12 | 397 | The Tutor's composition and the Grown-ups button: the start screen, the waiting states, the speaking bar, the Grown-ups screen all hang off it |
| `src/features/tutor/index.ts` | 10 | 21 | One new export line for every new Grown-ups screen part (notes, settings, ask, sessions) |
| `src/features/bsv-debug/token-panel.tsx` | 10 | 438 | The License token's mint, transfer, write, fuel value and lineage history in one panel |
| `src/features/tutor/tutor-flow.ts` | 9 | 273 | Bringing a problem in; also holds `deviceKey()`, which the Grown-ups side imports |
| `src/bsv/whatsonchain-provider.ts` | 9 | 225 | Rate limits, retries and CORS workarounds found against the live API |
| `src/bsv/record.ts` | 9 | 452 | Each record format (plain, typed, gated) edits the one codec |
| `src/grist/index.ts` | 8 | 24 | A new grind or poll loop is one more export |
| `src/bsv/license-contract.ts` | 8 | 1255 | Every contract variant and verifier in one file |
| `src/data/db.ts` | 7 | 360 | Every new table is a new `version()` block repeating the whole stores map |
| `src/bsv/license-token.ts` | 7 | 524 | Mint, transfer and write builders |
| `src/App.tsx` | 7 | 1324 | A view name, a state variable, a handler and a `case` for every new screen |

Of the 176 file-touches in this list, 91 are the BSV chain layer and its debug screens, 45 are the tutor, 18 are `src/contracts/types.ts`, and 22 are the other three shared files (`src/grist/index.ts`, `src/data/db.ts`, `src/App.tsx`).

Files changed together (commits in the window that touched both): `src/features/tutor/index.ts` with `src/features/tutor/tutor-screen.tsx` in 8; `src/bsv/index.ts` with `src/contracts/types.ts` in 8; `src/bsv/index.ts` with `src/bsv/license-contract.ts` in 6; `src/features/tutor/reading-loop.tsx` with `src/features/tutor/tutor-flow.ts` in 4 and with `src/features/tutor/tutor-screen.tsx` in 4; `src/contracts/types.ts` with `src/data/db.ts` in 4; `src/bsv/index.ts` with `src/features/bsv-debug/bsv-debug-screen.tsx` in 4.

Files at or past the rule's ~500-line trigger: `src/App.tsx` (1324), `src/bsv/license-contract.ts` (1255), `src/features/practice/practice-games.tsx` (995), `src/features/practice/letter-invasion.tsx` (830), `src/features/practice/word-relay-race.tsx` (807), `src/ocr/preprocess.ts` (806), `src/features/settings/settings-panel.tsx` (720), `src/features/rewards/creature-art.tsx` (708), `src/contracts/types.ts` (707), `src/features/learning/learning-screen.tsx` (697), `src/features/bsv-debug/bsv-debug-screen.tsx` (586), `src/features/practice/spell-catcher.tsx` (565), `src/features/word-lists/word-lists-view.tsx` (563), `src/features/tutor/reading-loop.tsx` (537), `src/bsv/license-token.ts` (524), `src/features/practice/practice-screen.tsx` (507), `src/features/practice/word-volcano.tsx` (503). Of these, the BSV files, the tutor files, `src/contracts/types.ts` and `src/App.tsx` are also hot; the practice games are large, but each is its own file and few stories touch them.

## 3. Proposed refactors

Ranked by how much parallel work each frees, measured by the file-touches in section 2. All are "no behaviour change": the existing unit, feature and e2e tests are the specification and must pass unchanged. Size says whether a refactor fits one Builder story, and if not, how to cut it so each cut lands green.

### R1. Lift the BSV chain layer out of the app

Frees: 91 of the 176 hot-file touches (every BSV story: provider fixes, record formats, contracts, the debug screens), and the three files that two apps now copy (section 5).

Responsibility to carve out: `src/bsv/` is a 6.5k-line library that lives in an app. It already imports nothing of the app and already has its own package (`packages/bsv/package.json`). Two copies exist elsewhere (section 5), so the second-copy rule applies already. Step one, inside the app, is cheap and frees the barrel at once: split `src/bsv/index.ts` into four sub-barrels so a record story and a contract story no longer edit one file.

New module and API:

```ts
// Step R1a: src/bsv/ gets four sub-folders, each with its own index; src/bsv/index.ts becomes re-exports only.
// chain/    src/bsv/chain-provider.ts, whatsonchain-provider.ts, chain-error.ts, config.ts, pending-spends.ts, broadcast.ts
// records/  src/bsv/record.ts, write-record.ts, read-record.ts, scan-records.ts, send-sats.ts, fuel-status.ts
// tokens/   src/bsv/license-token.ts, license-contract.ts, license-owner.ts, token-lineage.ts
// gating/   src/bsv/epoch-crypto.ts, gated-records.ts
export * from './chain/index';
export * from './records/index';
export * from './tokens/index';
export * from './gating/index';

// Steps R1b..R1d: the folders leave for bsv-kit (section 5, L1 to L3). The app keeps one thin file per library:
// src/bsv-app/chain.ts — the only place the app names the network, the provider URL, the anchor address and the collection id
import { createChainProvider } from 'bsv-kit/chain';
export const chain: ChainProvider = createChainProvider({ network: 'testnet', baseUrl: 'https://api.whatsonchain.com/v1/bsv/test', fetchImpl: globalThis.fetch.bind(globalThis) });
```

Files it touches: `src/bsv/index.ts` and every file that imports from the bsv barrel (R1a changes none of the callers: the barrel still exports every name). R1b to R1d change `src/data/db.ts`, `src/data/repositories/bsv-token-repository.ts`, `src/features/bsv-debug/`, `src/features/device-key/`, `src/grist/`, `src/features/tutor/tutor-flow.ts` and `package.json`.

Risk: R1a low (pure re-export cut). R1b to R1d medium: the wire formats (record version bytes, wrap and payload versions) are law, so each lifted file keeps its test vectors (`src/bsv/node/wire-vectors.ts`) and gains a consumer smoke test; the sCrypt toolchain pins TypeScript 5.3 and must not enter bsv-kit's install.

**Size:** four stories, in this order, each landing green: R1a the sub-barrels (one story, fits); R1b move chain, records and pending-spends to the library and delete the app's copy (one story); R1c move the epoch crypto and gated records (one story); R1d move the License and Fuel builders with the contracts and toolchain into their own library (one story, the largest). R1a can run beside any story that does not edit `src/bsv/`.

### R2. Split the tutor into the child's Tutor and the Grown-ups screen

Frees: 45 touches (the tutor files) and the eight commits that edit `src/features/tutor/index.ts` together with `src/features/tutor/tutor-screen.tsx`.

Responsibility to carve out: `src/features/tutor/` holds two products behind two doors. The child's Tutor (bring a problem, read aloud, maths) is `src/features/tutor/tutor-screen.tsx`, `src/features/tutor/reading-loop.tsx`, `src/features/tutor/math-loop.tsx`, `src/features/tutor/tutor-flow.ts`, `src/features/tutor/pictures.tsx`, `src/features/tutor/speech-bar.tsx`, `src/features/tutor/tutor-voice.ts` and `src/features/tutor/use-pause-tutor-on-leave.ts`. The grown-ups' half is `src/features/tutor/parent-screen.tsx`, `src/features/tutor/parent-gate.tsx`, `src/features/tutor/parent-pin.ts`, `src/features/tutor/pin-pad.tsx`, `src/features/tutor/parent-sessions.ts`, `src/features/tutor/parent-sessions-view.tsx`, `src/features/tutor/parent-session-page.tsx`, `src/features/tutor/session-record.tsx`, `src/features/tutor/session-json.ts`, `src/features/tutor/tutor-notes.tsx`, `src/features/tutor/tutor-settings.tsx`, `src/features/tutor/ask-the-tutor.tsx`, `src/features/tutor/parent-ask-flow.ts` and `src/features/tutor/parent-ask-request.ts`. The bridge today is `deviceKey()`, `HALF_SENT_MS`, `TutorUserError`, `NO_KEY` and `sayWhy()` in `src/features/tutor/tutor-flow.ts`, which `src/features/tutor/parent-ask-flow.ts` and `src/features/tutor/ask-the-tutor.tsx` import; they would otherwise make the two folders import each other (R4 gives them a home). No file outside the folder imports the grown-ups names; `src/features/tutor/tutor-screen.tsx` is the one door.

New module and API:

```ts
// src/features/tutor/index.ts — the child's Tutor only (keeps the name, so src/App.tsx does not change)
export function TutorScreen(props: TutorScreenProps): ReactElement;
export type TutorScreenProps = { profile: Profile; onBack(): void; onProfileChange(profile: Profile): void };

// src/features/grown-ups/index.ts — NEW folder: the Grown-ups screen and everything behind the PIN
export function ParentScreen(props: ParentScreenProps): ReactElement;
export function ParentGate(props: { children: ReactNode; onBack(): void }): ReactElement;
export function AskTheTutor(props: AskTheTutorProps): ReactElement;
export function TutorSettings(props: TutorSettingsProps): ReactElement;
export function TutorNotes(props: TutorNotesProps): ReactElement;
export { checkParentPin, setParentPin, hasParentPin, resetParentPin } from './parent-pin';
// Shared by both, owned by R4a: deviceKey (as getDeviceKey), TutorUserError, sayWhy, NO_KEY, HALF_SENT_MS
```

Files it touches: the 14 grown-ups files above (moved with `git mv`, imports rewritten), `src/features/tutor/index.ts` (loses the grown-ups names), `src/features/tutor/tutor-screen.tsx` (the one caller: it renders `ParentGate` at line 376 and would import it from the new folder), and the tests under `tests/unit/` and `tests/features/` that import from `src/features/tutor/`.

Risk: low to medium. The risk is the shared names above: do R4a first, or first move just those five names to a file both folders may import.

**Size:** two stories: R2a move the grown-ups files and fix imports (mechanical, one story, fits); R2b split `src/features/tutor/reading-loop.tsx` (537) and `src/features/tutor/tutor-screen.tsx` (397) so that the recording, the sending and the result card are three files behind one props type. R2a first.

### R3. Split `src/contracts/types.ts` by domain, and turn the bsv import around

Frees: 18 touches of `src/contracts/types.ts`, four of which also touched `src/data/db.ts`, and eight that also touched `src/bsv/index.ts`.

Responsibility to carve out: the file has 19 banner sections (Core Entities, Phonics, Spaced Repetition, OCR, Theme & Rewards, Coin Economy, Memory Aids, Test Results, Import/Export, Event Bus, BSV Wallet, BSV Chain Provider, Tutor, Parent ask, Sync Queue, and so on). The tutor and parent-ask sections (`src/contracts/types.ts` lines 533 to 699) are the ones stories edit. Moving them behind the same barrel means a tutor story and a core-entity story touch different files. The `BsvEvent` import from `src/bsv/types.ts` goes with the BSV sections into a file that the library lift (R1) can delete.

New module and API:

```ts
// src/contracts/types.ts stays the single import path: it becomes `export * from './domains/...'` lines only.
// src/contracts/domains/core.ts      Profile, WordList, Word, WordStats, SessionLog, StreakData, AccessibilitySettings
// src/contracts/domains/learning.ts  Phonics, spaced repetition, adaptive, memory aids, word learning, test results
// src/contracts/domains/rewards.ts   Theme, RewardEvent, coin economy
// src/contracts/domains/events.ts    AppEvent, EventBus (src/contracts/events.ts keeps createEventBus)
// src/contracts/domains/bsv.ts       BsvWalletKey, pending spends, chain provider types; imports BsvEvent from src/bsv/types.ts
// src/contracts/domains/tutor.ts     TutorSession, TutorTurn, TutorAnswer, TutorRequest, ParentAsk, ParentAskAnswer
export * from './domains/core';
export * from './domains/learning';
export * from './domains/rewards';
export * from './domains/events';
export * from './domains/bsv';
export * from './domains/tutor';
```

Files it touches: `src/contracts/types.ts` (becomes a barrel), new files under **src/contracts/domains/**, `src/contracts/index.ts` (unchanged). No importer changes: every importer goes through the contracts barrel or the types file, and both still resolve.

Risk: low. Pure type moves; `npm run typecheck` proves it, and `npm run test:contracts` runs the contract tests. The CI path filter in `.github/workflows/test.yml` already treats `src/contracts/` as "everything depends on it", so the story's CI run is the full suite.

**Size:** fits one story.

### R4. One grist job runner, one device key

Frees: `src/grist/index.ts` (8 touches), `src/features/tutor/tutor-flow.ts` (9), and the photo-import queue; lets R2 land cleanly.

Responsibility to carve out: three modules each re-implement "read the device key from the wallet row, send a request to the factory, store its txid, poll for the answer on a timer, mark the row answered or failed after a deadline": `GristInFlight` for tutor turns (`src/grist/in-flight.ts`), `ParentAskInFlight` for parent asks (`src/grist/parent-ask-in-flight.ts`, which already borrows `startPolling` from the first) and the photo-import pass in `src/features/word-lists/photo-import.ts`. Two of them hold a copy of the wallet lookup (`bsvWalletRepo.getCurrent()` then `PrivateKey.fromWif`, in `deviceKey()` in `src/features/tutor/tutor-flow.ts` at line 57 and again in `src/features/word-lists/photo-import.ts` at line 119).

New module and API:

```ts
// src/grist/job-queue.ts — NEW: the poll pass, once. Storage is the app's (a repository), the factory is bsv-kit's.
export interface GristJobStore<Row> {
  listWaiting(): Promise<Row[]>;
  applyAnswer(row: Row, answer: unknown): Promise<void>;
  markFailed(row: Row, reason: string): Promise<void>;
}
export interface GristJobKind<Row, Answer> {
  store: GristJobStore<Row>;
  txidOf(row: Row): string | undefined;
  sentAt(row: Row): Date;
  deadlineMs: number;
  isAnswer(value: unknown): value is Answer;
  toVerdict(row: Row, answer: Answer): unknown;
}
export interface GristJobQueue { start(intervalMs?: number): () => void; pass(): Promise<void> }
export function createGristJobQueue<Row, Answer>(kind: GristJobKind<Row, Answer>, deps: { getKey: () => Promise<PrivateKey | undefined>; read?: typeof readAnswer; now?: () => Date }): GristJobQueue;

// src/grist/device-key.ts — NEW: the one place a PrivateKey is read from the wallet row
export function getDeviceKey(): Promise<PrivateKey | undefined>;
```

`GristInFlight`, `ParentAskInFlight` and the photo-import pass become three small `GristJobKind` values; their exports stay (as thin factories) so no screen changes.

Files it touches: `src/grist/in-flight.ts`, `src/grist/parent-ask-in-flight.ts`, `src/grist/index.ts`, `src/features/tutor/tutor-flow.ts`, `src/features/tutor/parent-ask-flow.ts`, `src/features/word-lists/photo-import.ts`, and the tests under `tests/unit/` that fake `readAnswer`.

Risk: medium. The three loops have deliberately different deadlines (180 s, 180 s, 120 s) and the tutor's pass applies a `readingResult`; the story keeps each loop's tests unchanged and adds one for the shared pass. The sendDelayMs race in the rig memory (mw-kuy7rx.21) is the trap to keep covered.

**Size:** two stories: R4a `getDeviceKey` and the tutor/parent-ask loops onto `createGristJobQueue`; R4b the photo-import pass onto it. Then the queue itself is a library candidate (section 5, L5).

### R5. Break `src/App.tsx` into a screen registry and per-domain controllers

Frees: the 7 touches of `src/App.tsx` today, and every future screen story: a new screen is a new line in a registry instead of an edit to four places in a 1324-line file.

Responsibility to carve out: `src/App.tsx` does five jobs: mounting and the database-blocked screen; the event bus wiring (module-level mutable `activeProfileForBus`); profile state (`selectProfile`, archive, restore, delete); list and word actions (save list, QR import, test results, add and delete words); and the `switch (view)` that renders 28 screens with props pulled from all of it.

New module and API:

```ts
// src/app/screen-registry.ts — NEW: a screen declares itself; App looks it up
export interface ScreenContext { profile: Profile; go(view: AppView): void; back(): void; services: AppServices }
export interface ScreenDef<V extends AppView = AppView> { view: V; render(ctx: ScreenContext): ReactElement }
export function registerScreen<V extends AppView>(def: ScreenDef<V>): void;
export function renderScreen(view: AppView, ctx: ScreenContext): ReactElement | null;

// src/app/use-profiles.ts, src/app/use-word-lists.ts, src/app/use-session-actions.ts — one hook per domain
export function useProfiles(): { profiles: Profile[]; archived: Profile[]; active: Profile | null; select(p: Profile): Promise<void>; archive(id: string): Promise<void>; restore(id: string): Promise<void>; remove(id: string): Promise<void> };
export function useWordLists(profile: Profile | null): { lists: WordList[]; words: Word[]; stats: WordStats[]; save(input: SaveListInput): Promise<void>; refresh(): Promise<void> /* … */ };

// src/app/event-wiring.ts — the bus and the reward tracker, with the active profile passed in
export function wireRewards(bus: EventBus, activeProfile: () => Profile | null): () => void;
```

Files it touches: `src/App.tsx` (shrinks to under 300 lines: mount, providers, `renderScreen`), new files under **src/app/**; each feature adds a `register` file the day it moves (no feature has to move at once).

Risk: medium to high. `src/App.tsx` is the hot file: any other story that edits it during the refactor conflicts, so each cut is short and lands alone; the unit tests that render `App` are the specification.

**Size:** four stories, each landing green: R5a the event wiring (small, removes the module-level mutable); R5b `useProfiles`; R5c `useWordLists` and its handlers; R5d the registry and the `switch`, moving one feature at a time. Not one story.

### R6. Screens stop touching Dexie

Frees: the data layer. Today nine feature files and `src/App.tsx` read or write tables directly, so a table change (and `src/data/db.ts` changes 7 times a month) can break a screen that no story named.

Responsibility to carve out: reading and subscribing to rows. Six files call `liveQuery` from dexie (`src/features/tutor/tutor-screen.tsx`, `src/features/tutor/ask-the-tutor.tsx`, `src/features/tutor/session-record.tsx`, `src/features/tutor/parent-sessions-view.tsx`, `src/features/tutor/parent-session-page.tsx`, `src/features/word-lists/photo-import.ts`); four import `db` (`src/features/dashboard/word-detail-view.tsx`, `src/features/dashboard/day-detail-view.tsx`, `src/features/feedback/use-offline-feedback-sync.ts`, and `src/features/word-lists/photo-import.ts`, which also calls `liveQuery`), and `src/App.tsx` calls `db.syncQueue.add`.

New module and API:

```ts
// each repository gains the watcher its screen needs, so a screen imports the repository and never Dexie
// src/data/repositories/tutor-repo.ts
export interface Watch<T> { subscribe(next: (value: T) => void, error?: (e: unknown) => void): () => void }
tutorRepo.watchSessions(profileId: string): Watch<TutorSession[]>;
tutorRepo.watchTurns(sessionId: string): Watch<TutorTurn[]>;
// src/data/repositories/photo-import-repo.ts — NEW
export const photoImportRepo: { add(row: PhotoImport): Promise<void>; watchStatus(listId: string): Watch<PhotoImportStatus | null>; listWaiting(): Promise<PhotoImport[]>; settle(id: string, change: Partial<PhotoImport>): Promise<void> };
// src/data/repositories/sync-queue-repo.ts — NEW
export const syncQueueRepo: { enqueue(item: SyncQueueItem): Promise<void>; pending(): Promise<SyncQueueItem[]> };
// src/data/repositories/session-repo.ts, stats-repo.ts gain the day and word queries the two dashboard views run on db
```

Files it touches: the ten files named above, `src/data/repositories/index.ts` (one line per new repo), three new repositories.

Risk: low per file; the `liveQuery` subscriptions must keep their timing, because several tests wait on them (the rig's note on the sendDelayMs race).

**Size:** three stories, one per area: R6a tutor and Grown-ups (six files, after R2a), R6b dashboard and feedback (three files), R6c photo import and `src/App.tsx`'s sync queue.

### R7. One file per schema version in `src/data/db.ts`

Frees: the 7 touches of `src/data/db.ts`: every new table adds a `version()` block that repeats the whole stores map.

Responsibility to carve out: the schema history. Dexie needs the full stores map for each version, but the map can be computed from the previous one.

New module and API:

```ts
// src/data/schema/types.ts — NEW
export interface SchemaVersion {
  version: number;
  stores: Record<string, string | null>;   // only what changed; null deletes a table
  upgrade?: (tx: Transaction) => Promise<void>;
}
// src/data/schema/v13.ts, v14.ts, v15.ts … one file per version, each `export const v15: SchemaVersion = { … }`
// src/data/db.ts: applies SCHEMA_VERSIONS in order, folding each version's changes into the stores map
export const SCHEMA_VERSIONS: readonly SchemaVersion[];
```

Files it touches: `src/data/db.ts` (360 lines, 15 version blocks), new files under **src/data/schema/**. The next table story then adds one file and one line.

Risk: medium. A wrong fold silently drops an index in the user's real database; the story first adds a test that opens a database at each historic version from a fixture and compares `db.tables` and indexes before and after.

**Size:** fits one story (the fold and its test), then the old versions move file by file as later stories pass by.

### R8. Registries for the practice games and the settings sections

Frees: nothing today: `src/features/practice/` (7941 lines) and `src/features/settings/settings-panel.tsx` (720) are not in the hot list, since a game is already a file of its own. Ranked last because the cost shows when the next game or setting lands: `src/features/practice/practice-games.tsx` (995 lines) lists every game and `src/features/settings/settings-panel.tsx` draws every section.

Responsibility to carve out: the list of games (title, cost, component) and the list of Settings sections, each as data a new file adds itself to.

New module and API:

```ts
// src/features/practice/game-registry.ts — NEW
export interface GameDef { id: string; title: string; blurb: string; cost: number; free: boolean; Component: ComponentType<GameProps> }
export const GAMES: readonly GameDef[];
// src/features/settings/sections.ts — NEW
export interface SettingsSection { id: string; title: string; order: number; Component: ComponentType<SettingsSectionProps> }
export const SECTIONS: readonly SettingsSection[];
```

Files it touches: `src/features/practice/practice-games.tsx`, `src/features/settings/settings-panel.tsx`, two new files.

Risk: low.

**Size:** two stories, one for each registry. Do them when a game or a setting story is next in the queue.

## 4. Rule breaks

Each item names the rule of the vault's 27-modular-boundaries.md and the code that breaks it at the base commit.

- Screens talk to interfaces, never to a vendor (Persistence). Six feature files call `liveQuery` from dexie and four import `db` directly (nine files in all, one in both); `src/App.tsx` calls `db.syncQueue.add`. The files are listed in R6. This also breaks the repository rule in `CLAUDE.md`: "Never access Dexie tables directly from UI code".
- Screens talk to interfaces, never to a vendor (Licence and keys). `src/features/tutor/tutor-flow.ts`, `src/features/word-lists/photo-import.ts` and `src/features/device-key/create-device-key.ts` import `PrivateKey` from @bsv/sdk and build the device key themselves; `src/features/bsv-debug/gated-read.ts` imports `Transaction`. There is no one call that answers "this device's key" (R4).
- A feature crosses two modules through the bus or an interface, not a direct import of internals (New feature plugs in at a seam). Three imports go from one feature into another's internal file: `src/features/learning/keyboard-input.tsx` imports `src/features/practice/custom-keyboard.tsx`, `src/features/bsv-debug/bsv-debug-screen.tsx` imports `src/features/settings/qr-code.ts`, and `src/features/settings/settings-panel.tsx` imports `src/features/bsv-debug/bsv-debug-flag.ts`. Shared pieces (the custom keyboard, the QR drawer) belong in a module both can import.
- The same, for the audio module: `src/features/word-lists/tts-setup-help.tsx` imports `src/audio/speech.ts`, and `src/features/learning/learning-screen.tsx` imports `src/audio/manager.ts` and `src/audio/use-audio-busy.ts`, past the barrel `src/audio/index.ts`. `src/App.tsx` does the same with `src/audio/tts-debug-overlay.tsx` and `src/audio/tts-debug-state.ts`, and imports into `src/features/` by file path in 23 places.
- Events: modules tell each other things on an in-app bus, not by importing each other's state. The bus exists (`src/contracts/events.ts`) but only the BSV code, the BSV debug screens and `src/App.tsx` use it. The reward tracker is wired in `src/App.tsx` through a module-level mutable (`activeProfileForBus`), while the dashboard calls `rewardTracker` and `monsterCollection` directly (three imports of the rewards barrel). R5a fixes the wiring.
- Language, book, voice and model are data or settings, never constants in code. `src/audio/speech.ts` defaults `language = 'en'` in `sayWord`, `sayWordSlowly`, `spellWord`, `sayThenSpell`, `buildStrategies` and the speak function, though `src/i18n/language-registry.ts` exports `DEFAULT_LANGUAGE`; `src/App.tsx` falls back to `'en'` twice; `src/features/practice/custom-keyboard.tsx` defaults `language = 'en'`; `src/features/word-lists/list-editor.tsx` tests `lang.code !== 'en'`; `src/features/dashboard/day-detail-view.tsx` and `src/features/dashboard/word-detail-view.tsx` format dates with the locale `'en-US'` fixed. (The `'en'` in `src/data/db.ts` v8 is a migration backfill and stays.) A story to swap each for `DEFAULT_LANGUAGE` or the profile's language fits one story.
- Common functionality lives once, in a shared library. `src/audio/speech.ts` (449 lines of retry, backoff and voice ranking) is a second speech path beside bsv-kit/speech, which the tutor already uses; Lampas speaks everything through the package. `src/bsv/whatsonchain-provider.ts`, `src/bsv/chain-error.ts` and the typed-record decoder in `src/bsv/record.ts` are the originals of code that bsv-kit's licence reader says it "lifted from spell-forge-bsv" (section 5, L1): two copies already exist, and a third (A.R.G.U.S.).
- Keep the owner's own data out of the code. `src/grist/config.ts` writes the Postern backend URL, and `src/bsv/config.ts` writes the collection id `spellforge-leaderboard-testnet`, the provider URL and the fee rate as module constants; they are public defaults, so this is allowed in an app, but they cannot go into a library as they are (the library takes them as arguments; section 5).
- Render the same text in two places through one component: not audited screen by screen in this pass, so no finding either way.
- A file past ~500 lines, or a third story in a row editing it, gets a split proposed. Seventeen files are past 500 lines (section 2); the proposals are R1 to R8.

## 5. Library candidates

Each entry says what another app could use, where it lives now, which shared library it belongs in, the public API proposed, and the versioning it needs under the vault's library best practices (semver from 0.1.0, a CHANGELOG with "breaking" first, a tag for every release and the app pinned by tag, wire-format changes handled by "Changing a Wire Format"). Every library is a public repo with nothing of his in it: the owner's collection id, anchor address and Postern host are arguments.

**L1. The chain layer (provider, record codec, write, read, scan, send, pending spends).** Where: `src/bsv/chain-provider.ts`, `src/bsv/whatsonchain-provider.ts`, `src/bsv/chain-error.ts`, `src/bsv/record.ts`, `src/bsv/write-record.ts`, `src/bsv/read-record.ts`, `src/bsv/scan-records.ts`, `src/bsv/send-sats.ts`, `src/bsv/pending-spends.ts`, `src/bsv/broadcast.ts`. Copies today: bsv-kit packages/bsv/src/licence/whatsonchain.ts says "Lifted from spell-forge-bsv's WhatsOnChainProvider" and packages/bsv/src/licence/record.ts "Lifted from spell-forge-bsv's record.ts"; A.R.G.U.S. src/chain/woc.ts, src/chain/codec.ts and src/chain/wallet.ts say "Adapted from spell-forge src/bsv (MIT)", and its docs say that codec is maintained there, not taken from the `spell-forge-bsv` package. Belongs in: bsv-kit, as a new package bsv-kit/chain that the licence reader then imports instead of carrying its own copy (the dependency rule "bsv imports nothing from grist" stays; chain becomes a base the others may import). Proposed public API:

```ts
import type { PrivateKey } from '@bsv/sdk';
export interface ChainProvider { getUtxos(address: string): Promise<Utxo[]>; getTransactionHex(txid: string): Promise<string>; broadcast(txHex: string): Promise<string>; getAddressHistory(address: string): Promise<AddressHistoryEntry[]> }
export function createChainProvider(options: { baseUrl: string; fetchImpl?: typeof fetch; minRequestSpacingMs?: number }): ChainProvider;
export function encodeRecordScript(protocolId: string, payload: Uint8Array): LockingScript;
export function writeRecord(params: { provider: ChainProvider; key: PrivateKey; payload: Uint8Array; protocolId: string; feeRateSatPerKb: number }): Promise<{ txid: string }>;
export function scanRecords(params: { provider: ChainProvider; address: string; protocolId: string }): Promise<ScanRecordEntry[]>;
export function sendSats(params: SendSatsParams): Promise<SendSatsResult>;
```

Versioning: starts 0.1.0 as a tagged release; the record version bytes (`RECORD_VERSION_PLAINTEXT`, `RECORD_VERSION_TYPED`) are wire formats, so a change to them is "breaking", logged with its migration, and bsv-kit's existing consumers (Lampas, trade-tracker, A.R.G.U.S.) get a consumer contract test each. Moving the three apps onto it follows "Moving an App": one story per app, deleting the app's copy in the same story. Size: R1b.

**L2. License and Fuel token contracts and builders.** Where: `src/bsv/license-contract.ts`, `src/bsv/license-token.ts`, `src/bsv/license-owner.ts`, `src/bsv/token-lineage.ts`, `src/bsv/fuel-status.ts`, and `src/bsv/contracts/` with its toolchain (`src/bsv/contracts/toolchain/`, the compiled artifacts in `src/bsv/contracts/artifacts/`). Belongs in: a NEW public repo (proposed name `bsv-license-token`), not bsv-kit, because scrypt-ts needs TypeScript 5.3 and a compile toolchain that would be installed by every bsv-kit consumer that only wants the key vault ("an app that needs the key vault must not pull in the grist client", same reasoning). Proposed public API:

```ts
export const CONTRACT_VERSION: string;
export function mintContractLicenseToken(params: MintContractLicenseTokenParams): Promise<BuiltContractTransaction>;
export function transferContractToken(params: TransferContractTokenParams): Promise<TransferContractTokenResult>;
export function writeWithContractToken(params: WriteWithContractTokenParams): Promise<WriteWithContractTokenResult>;
export function readLicenseState(lockingScript: LockingScript): LicenseState;
export function verifyLicenseInput(params: VerifyLicenseInputParams): LicenseVerifyResult;
export class ContractVersionMismatchError extends Error {}
```

Versioning: a changed contract artifact cannot spend tokens minted under the old one (the code raises `ContractVersionMismatchError`), so a new artifact is always a major version, with the old artifact kept in the package and a documented migration; the package ships the artifacts it was built from with their hashes in the CHANGELOG. Size: R1d.

**L3. Epoch encryption and gated records.** Where: `src/bsv/epoch-crypto.ts` (487 lines, WebCrypto P-256 wrap and AES payloads) and `src/bsv/gated-records.ts`. Belongs in: bsv-kit as bsv-kit/epoch (no DOM besides WebCrypto, which Node 20 also has). Proposed public API:

```ts
export function generateEpochKey(): Uint8Array;
export function wrapEpochKey(epochKey: Uint8Array, readerPublicKey: Uint8Array, options?: WrapEpochKeyOptions): Promise<Uint8Array>;
export function unwrapEpochKey(wrap: Uint8Array, readerKeyPair: P256KeyPair): Promise<Uint8Array>;
export function encryptPayload(params: EncryptPayloadParams): Promise<Uint8Array>;
export function decryptPayload(params: DecryptPayloadParams): Promise<Uint8Array | EpochCryptoRefusal>;
```

Versioning: `WRAP_VERSION` and `PAYLOAD_VERSION` are wire formats; the library keeps its test vectors (`src/bsv/node/wire-vectors.ts`) as fixtures, and any change to a byte layout is "breaking" with both versions accepted for a stated window, per "Changing a Wire Format". Size: R1c.

**L4. TTS with retry (the spelling words' speech).** Where: `src/audio/speech.ts`, `src/audio/manager.ts` (exclusive runner), `src/audio/use-audio-busy.ts`. Belongs in: bsv-kit/speech, which already holds the sentence queue and Pause/Resume that the tutor uses; this adds the exponential-backoff retry, cooldown recovery and the per-language voice ranking. Lampas already speaks through the package and adds its own speed and voice choice in src/speech/greek.ts; whether it wants the retry is for that app's story to say. Proposed public API:

```ts
export function speakWithRetry(text: string, options: { language: string; rate?: number; voiceURI?: string; maxAttempts?: number; timeoutMs?: number }): Promise<void>;
export function createExclusiveRunner(): { run(action: () => Promise<void>): Promise<boolean>; isBusy(): boolean; onBusyChange(cb: (busy: boolean) => void): () => void };
```

Versioning: a minor release of the package for the new entry points; no existing export changes, so it is not breaking. The language is a parameter with no default (a break of the language rule today, section 4). Size: one story in bsv-kit, one in SpellForge deleting `src/audio/speech.ts`.

**L5. Grist job queue and photo shrinking.** Where: `src/grist/in-flight.ts`, `src/grist/parent-ask-in-flight.ts` (after R4) and `src/grist/shrink-photo.ts`. Belongs in: bsv-kit/grist for the queue (storage injected, so no Dexie in the library); the photo shrinker uses a canvas, and bsv-kit says no DOM in bsv, grist or tips, so it goes behind a separate entry point (bsv-kit/grist/browser). trade-tracker already shrinks captured stills to a size cap in trade-tracker src/scanner/capture-still.ts. Proposed public API:

```ts
export function createGristJobQueue<Row, Answer>(kind: GristJobKind<Row, Answer>, deps: GristJobQueueDeps): GristJobQueue;
export function shrinkPhoto(blob: Blob, options?: { maxBytes?: number; mimes?: readonly string[]; encoder?: PhotoEncoder }): Promise<GristPhoto>;
```

Versioning: adds entry points (minor); `GRIST_MAX_PHOTO_BYTES` stays the app's value passed in, because bsv-kit's own cap is looser. Size: after R4a, one story in bsv-kit and one per app.

**L6. OCR for a photo of a list.** Where: `src/ocr/` (1824 lines). Belongs in: a NEW public repo (proposed name `photo-text`), not bsv-kit: it is not about BSV, and it pulls in tesseract.js. No second app has a copy today (checked: no Tesseract in Lampas, trade-tracker or Postern), so this one is a candidate, not an obligation: lift it when a second app wants it, and let its first release come from `src/ocr/` with its fixture-image test. Proposed public API:

```ts
export interface OcrManager { recognize(image: Blob, options?: { language?: string; minConfidence?: number }): Promise<{ words: string[]; confidence: number }> }
export function createOcrManager(options?: { remote?: RemoteOcrProvider; recognizer?: RecognizerFn }): OcrManager;
export function filterImportWords(words: string[], options?: FilterOptions): string[];
```

Versioning: 0.1.0; the Tesseract data files it fetches are credited in its README, and a change to the recognizer's output shape is breaking.

**L7. The typed in-app event bus.** Where: `src/contracts/events.ts` (40 lines). Lampas has src/events/bus.ts (180 lines, the same publish/subscribe with `latest` and React hooks): two buses with the same idea. Belongs in: a small NEW package, or bsv-kit/tips-sized bsv-kit/events, only if the two apps agree on one shape; the bus carries each app's own event union, so the library is generic over it. Proposed public API:

```ts
export interface Bus<E extends { type: string }> { emit(event: E): void; on<T extends E['type']>(type: T, handler: (event: Extract<E, { type: T }>) => void): () => void }
export function createBus<E extends { type: string }>(): Bus<E>;
```

Versioning: 0.1.0; the smallest candidate, and the most worth a design look before lifting, because Lampas's bus keeps the last event of each kind and SpellForge's does not. Size: not worth a story until a second app moves onto it.

**L8. The spaced-repetition scheduler (SM-2 adapted for children, buckets, difficulty).** Where: `src/core/spaced-rep/scheduler.ts`, `src/core/spaced-rep/buckets.ts`, `src/core/spaced-rep/difficulty.ts` (the coin service in the same folder stays in the app). Lampas already has a second scheduler, src/data/schedule.ts, a back-off ladder of days with a different rule (right twice in a row moves a step up) and marked provisional. Belongs in: a NEW public repo (proposed name `spaced-rep`) with the policy (SM-2 or a step ladder) as an argument, so the two apps stop growing two schedulers. Proposed public API:

```ts
export function calculateNextReview(stats: ReviewStats): Date;
export function updateWordStats(stats: ReviewStats, result: AttemptResult): ReviewStats;
export function transitionBucket(stats: ReviewStats): Bucket;
export function computeDifficulty(stats: ReviewStats): number; // 0.0 to 1.0
```

Versioning: 0.1.0; the library takes plain stats objects (not the app's `WordStats`), so the first step is a type-only story in SpellForge that makes the functions accept the narrower shape.

Order of lifting, by the "sooner the better" rule and by the copies already out there: L1 first (three copies exist), then L3 and L2 (they sit on L1), then L4 (a second consumer exists), L5, and L6 to L8 when a second app asks.

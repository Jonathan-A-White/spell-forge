# CLAUDE.md

Development guide for AI assistants (Builders) working on SpellForge: an offline-first PWA that tutors a child (spelling first, then reading and maths), React 18 / TypeScript / Vite / Dexie. It is being rebuilt as 2.0 under the Land Rush (epic mw-79en7t); this file is the law for that work. Every push to `main` still deploys to production GitHub Pages (`.github/workflows/deploy.yml`) and real children use the app: never change an existing screen's behaviour unless the story says so, and keep new things behind their flag. Do not edit `.github/workflows/` unless a story says so (this host's token cannot push workflow changes). Never bump `package.json`'s version (the landing does).

VISION.md is the Governor's vision for this app: a change that would cross one of its lines stops and says so.

## Gate command

```bash
npm ci --no-audit --no-fund && TZ=UTC npm test && npm run typecheck && npm run lint && npm run build
```

All must pass clean before a story is done. A fresh worktree has no `node_modules`: `npm ci` first (Node 20+; it takes minutes, run it with nohup). `node scripts/check-claude-md.mjs` holds this file under 16,000 bytes (it runs inside `npm test`).

## Read first, by sheet topic

The owner's standing rules for his phone apps are the vault's `seats/builder/pwa-best-practices/` (its README is the index) and `library-best-practices/`. Read the README, then only the topics your story touches. A screen or module that breaks a rule there is not done.

- Any screen or layout: 05 safe areas, 06 viewport, 07 scroll/zoom/keyboard, 08 native-feel CSS and touch, 21 testing at phone width.
- Worker, install, updates, share: 01 manifest, 09 service worker caching, 10 updates, 34 share in and out.
- Speech and audio: 12; camera and photos: 13; timers and battery: 11; storage, sync, drafts: 15, 16.
- Any test: 20 testing offline-first logic, 21 phone width, 35 the Land Rush and test practices.
- Modules and libraries: 27 modular boundaries, library 01 when code becomes a library.
- The tutor: 30 the tutor over grinds, 31 conversations, 32 searchable settings, 33 request to the maker.
- Licence and chain: 24; version and credits: 25, 29; pitfalls: 26.

## Rules for 2.0

- **A kit before building.** A proven open-source component or one of the kits (pwa-kit, voice-kit, bsv-kit) first; build only a real gap, then as a library others can use. Integrate with what the phone does well (share sheet, `sms:`, `mailto:`).
- **One module per concern.** A folder under `src/` with a barrel `index.ts` and one reason to change; two stories must be able to change two modules at once. `src/App.tsx` is only the providers and the Shell (under 150 lines, a test holds it): the state is `src/shell/app-state.ts` and its `use-*` hooks, a screen is drawn by its world in `src/shell/screens/`. `docs/module-map.md` says where each concern lives.
- **Never the answer.** The tutor works with the child and diagnoses the gap; it never gives the homework answer (VISION.md). A change to a grind that could hand an answer over stops and says so; story 25 adds the red-team test.
- **Licence-free use.** The AI is the licensed part; everything else works with no licence (his word: "incredibly useful even if you don't have a license"). Today SpellForge has no client-side licence check, only the mill's `LICENCE_REQUIRED` refusal; a story that gates the tutor's entry points decides the gate first (story 19).
- **The share practice.** SpellForge is in the phone's share sheet and shares itself out (topic 34). The manifest's `share_target` (POST multipart, `image/*` files, title, text, url) names a path relative to the scope, held equal to the worker's `SHARE_TARGET_PATH` by a test; `src/sw.ts` parks the share and redirects; `src/share/share-target.ts` hands it over once; the picture waits for a tap, never sent by itself. Out: `src/share/share-out.ts` (`navigator.share`, else copy the link; closing the sheet is not a failure). The parked share lives in its own small Dexie database (`src/share/share-store.ts`) so the worker imports no app code.
- **Stories name files.** Every story's `files` key lists the files it touches (the Land Rush overlap guard holds back a story that names a file a running story names). Split a file every story edits; append-mostly docs (`CLAUDE.md`, `docs/`) union-merge at landing. Commit small, plainly; no AI attribution lines.
- **Lines from VISION.md.** Never end a session in frustration; the child reads little and is not expected to type; children's names never go on chain.

## Quick reference

```bash
npm run dev          # dev server
npm run build        # tsc -b + vite build -> dist/ (including dist/sw.js)
npm run typecheck    # tsc strict checking
npm run lint         # eslint
npm test             # vitest run: unit tests and feature specs (features/steps)
npm run test:bdd     # the Gherkin features alone
npm run test:phone   # Playwright at 390x844 against the built app (builds it first)
npm run test:nightly # everything: the whole vitest run, then every Playwright spec, timing tests included
npm run test:watch   # watch mode
npm run check:claude-md  # this file's size and index
```

Subsystem tests (run the relevant one after a change): `test:phonics` (src/core/phonics), `test:spaced-rep`, `test:data`, `test:audio`, `test:ocr`, `test:ocr-integration` (real Tesseract.js), `test:themes`, `test:a11y`, `test:adaptive`, `test:contracts`, `test:bsv` (src/bsv, bsv-wallet-repo).

## Tests

- **Test first.** Write the failing test or Gherkin scenario before the code. Every behaviour is a scenario in `features/*.feature` with steps in `features/steps/*.steps.ts(x)` (`@amiceli/vitest-cucumber`), run inside `npm test`. Put the acceptance id in the Scenario title. Each step is a test of its own: reset state in `BeforeEachScenario`, not `beforeEach`. `tests/setup.ts` imports `@testing-library/dom`, not `/react`, so a step file's `@testing-library/react/dont-cleanup-after-each` can switch the auto-unmount off. The older `tests/features/bsv/*.feature` are the BSV rules and stay.
- Unit tests in `tests/unit/` (`*.test.ts(x)`), fixtures in `tests/fixtures/`, shared fakes in `tests/support/`. jsdom plus `fake-indexeddb` (global; `db.delete(); db.open()` in `beforeEach` isolates rows), `TZ=UTC`. Tests never touch the network: stub `fetch` or pass a fake provider.
- **Phone width.** jsdom has no layout: a layout claim is a Playwright spec in `tests/e2e/` at 390x844 ending in `shot(page, name)` (`tests/e2e/phone-width.spec.ts` is the model; project `phone`, its own port per worktree, service workers blocked). Details and traps: `docs/testing.md`.
- **Timing tests** (a real clock is the point) are listed in `docs/testing.md`, carry a `covers:` line, and leave every gate under `MW_TIMING=skip`; the nightly run keeps them.
- Waits come from `pwa-kit/test-preset` (`ASYNC_WAIT_MS` in `tests/setup.ts`, timeouts in the configs): never pass a shorter one. Speech and the microphone are voice-kit's honest fakes (`voice-kit/testing/speech`), never a hand fake.
- Playwright is pinned to 1.63.0 to match the Chromium build on the Laptop.

## Architecture

### Tech Stack
- React 18 + TypeScript 5.9 + Vite 7 (`vite-plugin-pwa`, injectManifest: the worker is `src/sw.ts`)
- Tailwind CSS 4 (via `@tailwindcss/vite` plugin)
- Dexie.js 4 for IndexedDB (offline-first data layer)
- Screens: `src/shell/WorldSwitch.tsx` picks the world of a route and `src/shell/screens/<world>.tsx` the screen (ids and routes are `src/shell/worlds.ts`); a reopen lands where he left off (`src/shell/last-route.ts`); `react-router-dom` is installed and unused
- Vitest 4 + React Testing Library + fake-indexeddb for testing; Playwright for e2e

### Source Layout

```
src/
├── contracts/          # Central type definitions (types.ts) and event bus (events.ts)
├── core/               # phonics/, spaced-rep/ (SM-2), word-selection/, adaptive/, learning/, memory-aids/
├── data/
│   ├── db.ts           # Dexie schema (v16; each bump repeats the full stores map with a // vN: comment)
│   ├── import-export.ts # JSON backup/restore with merge strategies
│   └── repositories/   # plain exported objects; UI imports the repository, never `db`
├── audio/              # word helpers over voice-kit/speech, the tutor's voice, recorder
├── grist/              # the factory door: sealed asks to the mill, limits by size
├── share/              # Share > SpellForge in (share-target.ts, share-store.ts) and out (share-out.ts)
├── sw.ts               # the service worker (precache, update, share target)
├── ocr/                # Tesseract.js local + remote fallback
├── themes/             # dragon-forge/, monster-lab/, star-trail/ + engine
├── accessibility/      # Settings validation, CSS variable mapping, presets, React hooks
├── learn/              # spelling/, maths/: the subject graphs over learn-kit (nodes, items, grade bands); data and pure code; mnemonic-pictures.ts (a node's grind-drawn picture, asked once) over svg-rules.ts (Lampas's picture rules)
├── shell/              # worlds.ts (the four worlds, every screen's route, openView), Shell, WorldSwitch, screens/, app-state, last-route
├── bsv/                # licence token and chain code
└── features/           # UI: practice, dashboard, profiles, onboarding, word-lists, tutor, settings, about, update, ...
```

Dexie tables: profiles, wordLists, words, wordStats, sessionLogs, streaks, syncQueue, activityProgress, learningProgress, coinBalances, coinTransactions, themeProgress, completedCreatures, testResults, bsvWallet, bsvPendingSpends, bsvTokens, photoImports, tutorSessions, tutorTurns, tutorBlobs, parentAsks, mnemonicPictures.

### Key Design Patterns

- **Repository pattern**: all data access goes through `src/data/repositories/`. Never touch Dexie tables from UI code.
- **Event bus**: cross-module communication via `src/contracts/events.ts` (`word:attempted`, `session:started`, `session:ended`, `reward:earned`, `streak:updated`, `profile:switched`, `settings:changed`, ...).
- **One speech engine**: all speech goes through `voice-kit/speech`'s `speak()`; no `synth.speak` or `new SpeechSynthesisUtterance` in `src/` (a test greps for it). The Tutor voice setting drives both the tutor and the spelling words.
- **Central contracts**: all entity types in `src/contracts/types.ts`; import from `src/contracts/`.

### Accessibility CSS Variables

`--sf-font-size`, `--sf-font-weight`, `--sf-font-family`, `--sf-letter-spacing`, `--sf-line-height`, `--sf-background-color`, `--sf-tap-target-size`, `--sf-reduced-motion`

## Grind examples

Every grind in `grinds/` keeps one or more example scenarios, `grinds/examples/<kind>/<name>.json`, which `mw grist smoke spell-forge` sends to the mill and checks. A scenario holds `about`, `request` (what the app sends, with `schemaVersion`), optional `photos` (file names beside it, public-safe, under 200 KB) and `expect`.

`expect` is the shape mw reads: an OBJECT, one key for each answer path, never a list. A path is dotted (`math_diagnosis.gap`, `focus_words.0.word`). Its value is a bare value (the field equals it) or a check object of any of `equals`, `is_null`, `one_of`, `contains`, `matches`, `present` (true or false) and `all`; everything set must hold. Several checks on one path go under `all`, a list of check objects: `"answer": { "all": [{ "matches": "(?i)gardener" }, { "matches": "(?i)library" }] }`. `contains` and `matches` are case-sensitive (start a pattern with `(?i)` for any case); patterns are Go RE2, with no look-ahead. There is no "does not contain" check: say it with `matches` and the pattern `avoidsPattern("text")` makes (`tests/fixtures/grist/grind-examples.ts`). The format is documented there and read by the same code the test uses; mw's own reader is `GristExample` in millwright's `application/gristsmokecheck.go`.

`tests/unit/grist-grind-examples.test.ts` validates each request against the grind's input schema (`grinds/<kind>.request.schema.json` or `<kind>-request-<v>.schema.json`), refuses a list-form `expect` or a check mw would not read, validates each `expect` path against its answer schema, and fails when a grind has no example.

**A story that changes a grind's behaviour (its instructions, its request, its answer schema) updates or adds that grind's examples in the same story.** A new grind brings its input schema and at least one example.

## Code Conventions

- TypeScript strict mode, no `any` without justification; functional React components with hooks
- Barrel exports via `index.ts` in each module directory
- Credits: a package added or removed, or a new file under `public/` (font or data), changes `src/features/about/credits.ts` and the README's Credits in the same commit (`tests/unit/credits.test.tsx`)
- The update bar shows only on the grown-up views in `src/features/update/update-views.ts`; a new screen is added there on purpose

## CI/CD

- **test.yml** uses `dorny/paths-filter` to run only affected subsystem tests. **deploy.yml** deploys to GitHub Pages on push to `main`: typecheck, test, build, deploy. **ci-pass** aggregates for branch protection. Story 24 moves the app to its own domain and retires these.

## Read by need

One line per file under `docs/`: open the ones your story touches. `tests/unit/claude-md.test.ts` fails when a docs/ file is missing here.

```
docs/testing.md # the test seams: Playwright projects and ports, timing tests (the real-clock list), the nightly run, features/ and steps
docs/lampas-sweep.md # every rule of Lampas's CLAUDE.md: taken, not for this app, or later (story number)
docs/module-map.md # the module map (2026-10-10): modules, collisions, proposed refactors, rule breaks, library candidates
docs/spelling-graph.md # the spelling graph (src/learn/spelling): grade bands, the node shape, how to add a node
docs/maths-graph.md # the maths graph (src/learn/maths): grade bands, the node shape and item checker, the number nodes, how to add a node
docs/typed-text-sweep.md # every place the old app took typed text from a child, with its fate: spoken, a picture, a game's own input, or a grown-up's (2026-10-25)
docs/kestrel-sweeps.md # the Spelling world's two sweeps (2026-10-25): every caller of the old SM-2 scheduler and adaptive engine (kept, and why), and every game and drill's speech (voice-kit only, language named)
docs/never-the-answer.md # the never-the-answer rule, the teaching turn that replaces a leak, the red-team list, the parent-ask decision, and the sweep of every grind
docs/what-the-tutor-is-told.md # the table of what a tutor-talk turn carries (settings, learner, goal, progress, screen) and why the rest is not sent
docs/best-practices-audit.md # the 2026-10-10 audit of SpellForge against the PWA best practices (31 checklist lines)
docs/bsv-nft-gated-app-spec.md # the spec: NFT-gated, self-funded on-chain application data (BSV)
docs/bsv-testnet.md # the two testnet scripts behind the BSV Debug screen: keys kept outside the repo
docs/bsv-wire-formats.md # the nftgate wire formats pinned byte for byte (spec section 8 Q14)
```

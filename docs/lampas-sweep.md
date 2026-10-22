# Lampas's CLAUDE.md against SpellForge

The sweep of mw-79en7t.1 (2026-10-22): every rule of Lampas's `CLAUDE.md` (the trial rig for the 2.0 practices) with what became of it here. **Taken**: SpellForge has it now. **Not for this app**: it belongs to Lampas's subject. **Later**: a story in the 2.0 tree (plans/spellforge-2-2026-10-22/tree.md) does it; the number is the tree's story number (tree N is bead mw-79en7t.(N-2)).

| Lampas rule | Here |
|---|---|
| Served from the VPS, Vite `base` `/`, no GitHub Pages workflow | Later, story 24 (the name and the VPS). Until then `deploy.yml` deploys to Pages and `base` is `/spell-forge/` |
| Do not change `.github/workflows/` unless a story says so | Taken (CLAUDE.md) |
| Never bump `package.json`'s version | Taken (CLAUDE.md); the landing raises it once the Mayor sets `version_files` |
| VISION.md is the Governor's vision | Taken (already there) |
| Gate command with `npm ci` and `npm run build` | Taken (CLAUDE.md, Gate command) |
| Read `docs/overview.md` first | Later: no 2.0 story writes an overview; `docs/module-map.md` is the map, and story 14 (the shell) should leave a short one |
| `docs/pwa-best-practices.md`, a copy of the vault's rules | Not copied (190 KB); CLAUDE.md's "Read first, by sheet topic" names the vault's topics |
| "Easy to use correctly and hard to use incorrectly" | Not for this app as worded (a reader's principle); SpellForge's is VISION.md: never the answer, never frustration |
| Quick reference: dev, build, typecheck, test | Taken (already there) |
| `test:bdd`, `shots` (Playwright at 390x844), `npx playwright test` | Taken as `test:bdd`, `test:phone`, `test:nightly` |
| `icons` (re-render PNG icons from the SVG) | Later, story 24 (installable icons) |
| `seed:build`, `ladder:docs`, `data:build` (Greek data) | Not for this app; the equivalents are the graphs of stories 16 and 20 |
| `check:licence` (live testnet check) | Later, story 19 (the licence in Grown-ups) |
| `e2e:live` (tests against the deployed app, opt-in, skipped without a key) | Later, story 24 (once there is a deployed app at its own domain) |
| `grind:build` (after adding a setting to the registry) | Later, story 19 (settings move to the pwa-kit registry of story 8) |
| Adding a grammar idea (one source, `ladder.ts`) | Not for this app; its analogue is the learn-kit nodes of stories 16 and 20 |
| Grinds: examples, input schema, instructions one part per section (`docs/grinds.md`) | Examples and schemas: taken (already there). Parts per section and `docs/grinds.md`: later, story 25 (`grinds/tutor-turn.instructions.md` is split as it is hardened) and story 15 (the new tutor-talk grind born split) |
| Test first | Taken (CLAUDE.md, Tests) |
| Every behaviour a Gherkin scenario in `features/` with steps in `features/steps/` | Taken (`features/app-opens.feature`, `features/share-target.feature`; every app story after brings its own) |
| Speech and the microphone only through voice-kit's honest fakes | Taken in unit tests (`voice-kit/testing/speech`); the Playwright helpers (`honestSpeech`, `honestMic`, a fake capture device) are later, story 15 (the front door listens and speaks) |
| Every jsdom wait is `ASYNC_WAIT_MS`, never shorter | Taken (`tests/setup.ts` from `pwa-kit/test-preset`; already there) |
| A step that checks the bus waits for it (`expectPublished`) | Later, story 14, when steps first assert on the event bus |
| Shared fakes in `tests/support/` (a fake registration, a fake Postern) | Taken in part: `tests/support/share-worker.ts`, `bsv-kit/testing`'s `fakePostern`, `tests/fixtures/grist/`; a fake registration is later, story 24 |
| A layout claim is a Playwright spec at 390x844 ending in `shot()`; service workers blocked except the share spec | Taken (`tests/e2e/phone-width.spec.ts`, `tests/e2e/shot.ts`, `serviceWorkers: 'block'`); the built-worker share spec is later, story 24 (the install and share checks on the deployed build) |
| A test that needs a real build runs vite in a child process | Taken (docs/testing.md) |
| Playwright pinned to 1.63.0 | Taken (already pinned) |
| Layout notes in `docs/layout/<area>.md`, CLAUDE.md under 16,000 bytes, held by a test | The size and the index: taken (`scripts/check-claude-md.mjs`, `tests/unit/claude-md.test.ts`). `docs/layout/` per area: later, story 14 (the shell and worlds give the areas) |
| What the tutor is told (`knows.ts`, `BEARS_ON`) | Later, story 15 (the front door's request builder) |
| TypeScript strict, no `any`, Tailwind tokens | Taken (already there) |
| Dexie: never edit an old `version()`; repeat the whole stores map; UI through repositories | Taken (already there) |
| The page never scrolls: `overflow: clip` at `100dvh`, `.screen` boxes, `focusQuietly`, no `autoFocus` | Later, story 14 (the shell owns the root) |
| Bottom insets through `--lp-bar-inset` and `--lp-end-inset`, never `env(safe-area-inset-bottom)` in a component | Later, story 14 |
| Raw text downloads stay out of git | Not for this app |
| Credit everything: `ATTRIBUTION.md`, a test that fails on a dependency with no entry | Taken in its SpellForge form (`src/features/about/credits.ts`, the README's Credits, `tests/unit/credits.test.tsx`) |
| The tutor on About is told each credit | Later, story 15 (every screen reports itself to the tutor) |
| Read by need: one line per `docs/` file | Taken (CLAUDE.md) |

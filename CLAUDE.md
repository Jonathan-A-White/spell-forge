# CLAUDE.md

Development guide for AI assistants working on SpellForge.

## Quick Reference

```bash
npm run dev          # start dev server
npm run build        # typecheck + build
npm run typecheck    # tsc strict checking
npm run lint         # eslint
npm test             # all tests
npm run test:watch   # watch mode
```

### Subsystem Tests

```bash
npm run test:phonics     # src/core/phonics/
npm run test:spaced-rep  # src/core/spaced-rep/ + difficulty scoring
npm run test:data        # src/data/
npm run test:audio       # src/audio/
npm run test:ocr         # src/ocr/ (unit tests)
npm run test:ocr-integration  # src/ocr/ (real Tesseract.js + fixture image)
npm run test:themes      # src/themes/
npm run test:a11y        # src/accessibility/
npm run test:adaptive    # src/core/adaptive/
npm run test:contracts   # src/contracts/
npm run test:bsv         # src/bsv/, src/features/bsv-debug/, bsv-wallet-repo
```

Always run the relevant subsystem test after making changes. Run `npm run typecheck` and `npm run lint` before committing.

## Architecture

### Tech Stack
- React 18 + TypeScript 5.9 + Vite 7
- Tailwind CSS 4 (via `@tailwindcss/vite` plugin)
- Dexie.js 4 for IndexedDB (offline-first data layer)
- React Router DOM 7 for routing
- Vitest 4 + React Testing Library + fake-indexeddb for testing

### Source Layout

```
src/
├── contracts/          # Central type definitions (types.ts) and event bus (events.ts)
├── core/
│   ├── phonics/        # Phoneme-grapheme engine, syllabifier, pattern DB, hints
│   ├── spaced-rep/     # SM-2 scheduler, bucket transitions, difficulty scoring
│   ├── word-selection/  # Session word mix algorithm
│   └── adaptive/       # Engagement detection (fatigue, frustration, boredom)
├── data/
│   ├── db.ts           # Dexie database schema (v1)
│   ├── import-export.ts # JSON backup/restore with merge strategies
│   └── repositories/   # Repository pattern: profile, word-list, word, stats, session, streak
├── audio/              # Web Speech API TTS with robust retry logic
├── ocr/                # Tesseract.js local + remote fallback
├── themes/             # dragon-forge/, monster-lab/, star-trail/ + engine
├── accessibility/      # Settings validation, CSS variable mapping, presets, React hooks
└── features/           # UI components: practice, dashboard, profiles, onboarding, word-lists, feedback, rewards
```

### Key Design Patterns

- **Repository pattern** — all data access goes through `src/data/repositories/`. Never access Dexie tables directly from UI code.
- **Event bus** — cross-module communication via `src/contracts/events.ts`. Events include `word:attempted`, `session:started`, `session:ended`, `reward:earned`, `streak:updated`, `profile:switched`, `settings:changed`.
- **TTS retry pattern** — audio uses Web Speech API with exponential backoff, voice fallback, and cooldown recovery.
- **Central contracts** — all entity types defined in `src/contracts/types.ts`. Import types from `src/contracts/`, not from individual modules.

### Database Schema (Dexie v1)

Tables: `profiles`, `wordLists`, `words`, `wordStats`, `sessionLogs`, `streaks`, `syncQueue`

### Accessibility CSS Variables

All accessibility settings map to CSS custom properties:
`--sf-font-size`, `--sf-font-weight`, `--sf-font-family`, `--sf-letter-spacing`, `--sf-line-height`, `--sf-background-color`, `--sf-tap-target-size`, `--sf-reduced-motion`

## Grind examples

Every grind in `grinds/` keeps one or more example scenarios, `grinds/examples/<kind>/<name>.json`, which `mw grist smoke spell-forge` sends to the mill and checks. A scenario holds `about`, `request` (what the app sends, with `schemaVersion`), optional `photos` (file names beside it, public-safe, under 200 KB) and `expect`.

`expect` is the shape mw reads: an OBJECT, one key for each answer path, never a list. A path is dotted (`math_diagnosis.gap`, `focus_words.0.word`). Its value is a bare value (the field equals it) or a check object of any of `equals`, `is_null`, `one_of`, `contains`, `matches`, `present` (true or false) and `all`; everything set must hold. Several checks on one path go under `all`, a list of check objects: `"answer": { "all": [{ "matches": "(?i)gardener" }, { "matches": "(?i)library" }] }`. `contains` and `matches` are case-sensitive (start a pattern with `(?i)` for any case); patterns are Go RE2, with no look-ahead. There is no "does not contain" check: say it with `matches` and the pattern `avoidsPattern("text")` makes (`tests/fixtures/grist/grind-examples.ts`). The format is documented there and read by the same code the test uses; mw's own reader is `GristExample` in millwright's `application/gristsmokecheck.go`.

`tests/unit/grist-grind-examples.test.ts` validates each request against the grind's input schema (`grinds/<kind>.request.schema.json` or `<kind>-request-<v>.schema.json`), refuses a list-form `expect` or a check mw would not read, validates each `expect` path against its answer schema, and fails when a grind has no example.

**A story that changes a grind's behaviour (its instructions, its request, its answer schema) updates or adds that grind's examples in the same story.** A new grind brings its input schema and at least one example.

## Code Conventions

- TypeScript strict mode — no `any` types without justification
- Functional React components with hooks
- Barrel exports via `index.ts` in each module directory
- Test files live in `tests/unit/` with `.test.ts` suffix
- Test fixtures in `tests/fixtures/`

## CI/CD

- **test.yml** uses `dorny/paths-filter` to run only affected subsystem tests. Changing `src/contracts/` triggers all dependent tests.
- **deploy.yml** deploys to GitHub Pages on push to `main`: typecheck → test → build → deploy.
- **ci-pass** gate job aggregates results for branch protection.

## Testing Notes

- Tests use `fake-indexeddb` for IndexedDB simulation (auto-polyfilled in `tests/setup.ts`)
- Tests use `jsdom` environment
- When adding tests, follow existing patterns in `tests/unit/`
- Test fixtures in `tests/fixtures/` provide reusable profiles, word lists, and session histories

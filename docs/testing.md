# Testing SpellForge

How the rig's tests are shaped (the vault's pwa-best-practices topics 20, 21 and 35 are the reasons; this is the where and the how). The gate is in `CLAUDE.md`.

## What runs where

| Command | What it runs |
|---|---|
| `npm test` | vitest: `tests/unit/**`, `tests/features/**` (the BSV rules) and `features/steps/**` (the Gherkin features of the app). jsdom, `fake-indexeddb`, `TZ=UTC`. |
| `npm run test:bdd` | the Gherkin features alone (`features/steps`) |
| `npx playwright test --project=phone` (`npm run test:phone`) | the phone-width specs (`tests/e2e/phone-width.spec.ts`) at 390x844 against the BUILT app: it runs `npm run build`, then `vite preview` on a port of its own, and blocks service workers |
| `npx playwright test --project=chromium` | the older specs in `tests/e2e/`, against the same built app. `playwright.config.ts` builds and serves it once (one worker) for every spec, and each spec calls `noTapGuard(page)` from `tests/e2e/tap-guard.ts` (the tap guard's `sf-tap-guard-ms` seam set to 0). `worlds.spec.ts` serves the app with `vite` (dev) on its own port, one above. `spelling-world.spec.ts` serves the app with `vite` (dev) on its own port, three above (the Spelling world has no card on Home yet, so the tutor's `go` opens it; pictures, words and a coin are put in Dexie through the dev server's own modules). `front-door.spec.ts` walks the built app with the Tutor on (the door is the landing view): `page.route` plays the Postern backend and the mill (it opens each delivered tutor-talk grist and answers it), a share is parked in the `spell-forge-share` database as the worker parks it, and voice-kit's `speechInitScript` and `micInitScript` stand in for the voice and the ear. `grown-ups.spec.ts` walks the real app with `vite` (dev) four ports above, and serves `tests/e2e/harness/grown-ups.html` (How is it going, which no screen draws yet) from the same server. The testnet spec went with the BSV Debug screen |
| `npm run test:nightly` | everything: `TZ=UTC vitest run`, then every Playwright spec, timing tests included |

The phone project's port is derived from the worktree's path (4400 to 5399, `tests/support/preview-port.ts`), so landings on one host run side by side; `PREVIEW_PORT=<n>` overrides it (for every project) and `PW_REUSE=1` reuses a preview you already started. A spec that asserts a phone's bounds sets its own viewport (`test.use({ viewport })`) and ends with `shot(page, name)` (`tests/e2e/shot.ts`, written to `shots/`, ignored by git).

## Features (BDD)

A behaviour is a scenario in `features/<name>.feature`, run by `features/steps/<name>.steps.ts(x)` through `@amiceli/vitest-cucumber`; `vitest.config.ts` includes `features/steps/**`. The acceptance id goes in the Scenario title (tags do not reach vitest's names). Things that bite:

- Each step is a test of its own. Reset state once per scenario in `BeforeEachScenario`, never in `beforeEach` (it would unmount the screen between When and Then).
- Import `@testing-library/react/dont-cleanup-after-each` first in a step file that renders. `tests/setup.ts` imports `@testing-library/dom`, not `/react`, so that import can still switch RTL's auto-unmount off.
- `features/app-opens.feature` renders the whole `App` in jsdom (it needs `HTMLCanvasElement.prototype.getContext` stubbed: the themes draw on a canvas). `features/share-target.feature` runs `src/sw.ts` as the worker (`tests/support/share-worker.ts`) and then the app at the address the worker redirected to.
- The service worker is tested with a fake POST (Node's `Request` cannot parse a jsdom `File`): `tests/unit/share-target.test.ts` also holds `public/manifest.json`'s `share_target` equal to the worker's path.
- esbuild refuses to run inside jsdom: a test that needs a real build runs `node node_modules/vite/bin/vite.js build --outDir <tmp>` in a child process.

## Timing tests

A timing test needs a real clock to mean anything (it waits for time itself). Try fake timers first. The rig's `timing_tests` key (vault `rigs/spell-forge.toml`, set by the Mayor) leaves them out of every gate (`MW_TIMING=skip`, `MW_TIMING_TESTS=<globs>`, read by `timingFilter` in `vitest.config.ts` and `playwrightTimingFilter` in `playwright.config.ts`) and runs them in the nightly timing job (`MW_TIMING=only`). Each carries a `covers:` line in its first ten lines and says why it needs the real clock.

The timing tests, and the value of `MW_TIMING_TESTS`:

```
tests/unit/device-key-warm-licence.test.tsx,tests/e2e/tutor-speech-bar.spec.ts
```

| File | Runner | Why it needs the real clock |
|---|---|---|
| `tests/unit/device-key-warm-licence.test.tsx` | vitest | both tests wait a real 50 ms for a stray second licence call or a late alert to show itself: a fake clock cannot say that something does not happen later |
| `tests/e2e/tutor-speech-bar.spec.ts` | Playwright (project `chromium`) | the browser's own speech clock runs the slowed honest voice for the length of the spec while the bar's Pause, Resume and Restart are proved |

To check it: `MW_TIMING=skip MW_TIMING_TESTS=tests/unit/device-key-warm-licence.test.tsx,tests/e2e/tutor-speech-bar.spec.ts npm test` passes and skips the first; `MW_TIMING=only` with the same list runs it alone.

Real waits that are NOT timing tests, and why they stay in the gate (a pass can only be too early, never a flake, or the file is mostly fake timers; each could move to fake timers in a story that touches it):

- `tests/unit/tutor-reading.test.tsx` (4 places), `tests/unit/tutor-math.test.tsx`, `tests/unit/photo-import.test.ts` (2): a 50 to 100 ms pause for a negative check ("nothing more happens"), inside files that are otherwise `waitFor` and fake timers.
- `tests/unit/audio.test.ts` (60 ms for the fake phone to list its voices; the long-speech tests use fake timers), `tests/unit/themes.test.ts` (5 waits of 50 ms for a fire-and-forget Dexie write: a `waitFor` would do).
- `tests/unit/list-editor-photo-import.test.tsx`, `tests/unit/ask-the-tutor.test.tsx`: a 150 ms simulated slow call; the assertions are about state, not duration.
- `tests/unit/bsv-scan-records.test.ts`: 5 ms inside a fake provider that counts concurrent calls.

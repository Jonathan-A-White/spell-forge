import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { playwrightTimeouts, playwrightTimingFilter } from 'pwa-kit/test-preset';
import { previewPort, reuseExistingPreview } from './tests/support/preview-port';

// One preview server per worktree (tests/support/preview-port.ts): landings on one host run side by side.
const PREVIEW_PORT = previewPort(process.cwd());
const PREVIEW_BASE_URL = `http://localhost:${PREVIEW_PORT}`;

// This host's Chromium build needs libnspr4/libnss3/libasound2, which aren't
// installed system-wide here (no sudo). If a local copy has been unpacked to
// this well-known cache dir (see tests/e2e/two-install-validation.spec.ts
// header, "Host setup"), point the dynamic linker at it; on a host that
// already has these libs, the directory is absent and this is a no-op.
const extraLibDir = join(homedir(), '.cache', 'ms-playwright-system-libs', 'usr', 'lib', 'x86_64-linux-gnu');
const browserEnv = existsSync(extraLibDir)
  ? { ...process.env, LD_LIBRARY_PATH: [extraLibDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') }
  : undefined;

const PHONE_SPEC = '**/phone-width.spec.ts';
const NOT_PHONE_SPEC = '**/!(phone-width).spec.ts';
const DEFAULT_TEST_MATCH = '**/*.@(spec|test).?(c|m)[jt]s?(x)';

export default defineConfig({
  testDir: './tests/e2e',
  // timeouts sized for a loaded host (expect.timeout 20 s); a test here builds and serves the app, so its own is longer
  ...playwrightTimeouts,
  timeout: 2 * playwrightTimeouts.timeout,
  fullyParallel: false,
  // One worker: the specs share the one built dist/ and preview server below, and worlds.spec.ts starts a vite of its own.
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: PREVIEW_BASE_URL,
    trace: 'retain-on-failure',
    // A cached worker would serve a stale build to the next spec; the specs that test the worker turn it on themselves.
    serviceWorkers: 'block',
  },
  // channel: 'chromium' uses the full Chromium browser build rather than Playwright's
  // default headless-shell binary, which this host does not have installed at all.
  //
  // MW_TIMING (docs/testing.md): the specs in the rig's timing_tests leave the gate under MW_TIMING=skip and are the only ones under =only.
  // A project's own testMatch/testIgnore wins over the config's, so each project is filtered here. Playwright's own default testMatch is given.
  projects: [
    {
      name: 'chromium',
      ...playwrightTimingFilter({ testMatch: [DEFAULT_TEST_MATCH], testIgnore: [PHONE_SPEC] }),
      use: { ...devices['Desktop Chrome'], channel: 'chromium', launchOptions: { env: browserEnv } },
    },
    // `npx playwright test --project=phone`: the specs that prove a layout claim, at a phone's 390x844, against the built app.
    {
      name: 'phone',
      // every spec but the phone one is ignored, so MW_TIMING=only (whose testMatch is the timing globs alone) does not run a timing spec here too
      ...playwrightTimingFilter({ testMatch: [PHONE_SPEC], testIgnore: [NOT_PHONE_SPEC] }),
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        viewport: { width: 390, height: 844 },
        launchOptions: { env: browserEnv },
      },
    },
  ],
  // The app is built and served once, here, for every spec (the phone project and the older chromium specs reach it by baseURL).
  webServer: {
    command: `npm run build && npm run preview -- --port ${PREVIEW_PORT} --strictPort`,
    url: `${PREVIEW_BASE_URL}/spell-forge/`,
    reuseExistingServer: reuseExistingPreview(),
    timeout: 180_000,
  },
});

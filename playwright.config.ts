import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PREVIEW_PORT = 4173;
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

const hasTestnetCredentials =
  !!process.env.SF_E2E_FUNDED_WIF && !!process.env.SF_E2E_ANCHOR_ADDRESS;

if (!hasTestnetCredentials) {
  // Print at config-load time (not just inside the test) so the reason is visible
  // even though we skip starting a production build + preview server below.
  console.log(
    'SF_E2E_FUNDED_WIF and/or SF_E2E_ANCHOR_ADDRESS are not set — the two-install ' +
      'testnet validation will skip. See tests/e2e/two-install-validation.spec.ts for details.',
  );
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: PREVIEW_BASE_URL,
    trace: 'retain-on-failure',
  },
  // channel: 'chromium' uses the full Chromium browser build rather than Playwright's
  // default headless-shell binary, which this host does not have installed at all.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium', launchOptions: { env: browserEnv } },
    },
  ],
  // Skip building/serving a production bundle entirely when we already know every
  // test will skip for lack of credentials — npm run test:e2e should stay fast and
  // exit 0 without a network-dependent build in that case.
  webServer: hasTestnetCredentials
    ? {
        command: `npm run build && npm run preview -- --port ${PREVIEW_PORT} --strictPort`,
        url: `${PREVIEW_BASE_URL}/spell-forge/`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      }
    : undefined,
});

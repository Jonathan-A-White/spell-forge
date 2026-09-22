// tests/e2e/two-install-validation.spec.ts
//
// Plays the epic's two-install validation (mw-0ym9.9) against the real BSV
// testnet, end to end, through two isolated browser profiles (Playwright
// browser contexts, each with its own storage):
//
//   Profile A: opens the app, enables the hidden BSV Debug dev toggle, has a
//   pre-funded testnet key seeded into its wallet store, sets the shared
//   anchor address, and writes an nftgate record.
//
//   Profile B: a separate browser context sharing nothing with A except the
//   protocol id and the anchor address; it reads A's record back by txid and
//   by scanning the anchor address, and sees the same text in both.
//
// This is NOT part of `npm test` (it hits the real network) and is not run
// by the rig's landing check. Run it by hand or from a story with:
//
//   npm run test:e2e
//
// Required environment variables (never commit real values):
//
//   SF_E2E_FUNDED_WIF      A testnet WIF private key already funded with
//                          tBSV (see mw-0ym9.8). Profile A imports this key
//                          directly into its wallet store rather than
//                          generating a fresh (unfunded) one, since a write
//                          needs a positive balance.
//   SF_E2E_ANCHOR_ADDRESS  The shared anchor address both installs write to
//                          and scan (see mw-0ym9.8).
//
// When either variable is unset, every test in this file skips and prints
// why, and the run still exits 0.
//
// Host setup (laptop, no sudo available): this host's Chromium build needs
// libnspr4, libnss3 and libasound2t64, which are not installed system-wide.
// Fetched and unpacked once with (no root needed):
//   cd /tmp && apt-get download libnspr4 libnss3 libasound2t64
//   mkdir -p ~/.cache/ms-playwright-system-libs
//   for f in *.deb; do dpkg-deb -x "$f" ~/.cache/ms-playwright-system-libs; done
// playwright.config.ts points the dynamic linker at that directory when it
// exists; it is a no-op on a host that already has these libraries.

import { test, expect, type Page } from '@playwright/test';
import { PrivateKey } from '@bsv/sdk';

const TESTNET_ADDRESS_PREFIX = [0x6f];

const FUNDED_WIF = process.env.SF_E2E_FUNDED_WIF;
const ANCHOR_ADDRESS = process.env.SF_E2E_ANCHOR_ADDRESS;

const skipReason =
  !FUNDED_WIF || !ANCHOR_ADDRESS
    ? 'SF_E2E_FUNDED_WIF and/or SF_E2E_ANCHOR_ADDRESS are not set — skipping the ' +
      'two-install testnet validation. Set both to run it for real (see this file\'s header).'
    : null;

if (skipReason) {
  // Printed at file-load time so it shows up even under reporters that don't
  // echo a skipped test's annotation.
  console.log(skipReason);
}

const APP_PATH = '/spell-forge/';

async function completeOnboarding(page: Page, name: string): Promise<void> {
  await page.goto(APP_PATH);
  await expect(page.getByText('Welcome to SpellForge!')).toBeVisible();
  await page.getByPlaceholder('Enter your name').fill(name);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start Forging!' }).click();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
}

async function seedFundedWallet(page: Page, wif: string, address: string): Promise<void> {
  await page.evaluate(
    ({ wif, address }) =>
      new Promise<void>((resolve, reject) => {
        const openReq = indexedDB.open('SpellForgeDB');
        openReq.onerror = () => reject(openReq.error);
        openReq.onsuccess = () => {
          const db = openReq.result;
          const tx = db.transaction('bsvWallet', 'readwrite');
          tx.objectStore('bsvWallet').put({
            id: 'e2e-funded-key',
            kind: 'wif',
            network: 'testnet',
            material: wif,
            address,
            createdAt: new Date(),
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { wif, address },
  );
}

async function openBsvDebugScreen(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings' }).click();
  const versionButton = page.getByRole('button', { name: /^SpellForge v/ });
  await expect(versionButton).toBeVisible();
  for (let tap = 0; tap < 7; tap++) {
    await versionButton.click();
  }
  await page.getByRole('button', { name: 'BSV Debug' }).click();
  await expect(page.getByRole('heading', { name: 'BSV Debug' })).toBeVisible();
}

test.describe('two-install validation (testnet)', () => {
  test.skip(!!skipReason, skipReason ?? '');

  test('profile A writes a record on testnet; profile B reads it by txid and by anchor scan', async ({
    browser,
  }) => {
    test.setTimeout(180_000);

    const wif = FUNDED_WIF!;
    const anchorAddress = ANCHOR_ADDRESS!;
    const fundedAddress = PrivateKey.fromWif(wif).toAddress(TESTNET_ADDRESS_PREFIX);
    const recordText = `spell-forge e2e two-install validation ${Date.now()}`;

    // --- Profile A: its own browser context (storage, IndexedDB, localStorage) ---
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    try {
      await completeOnboarding(pageA, 'Install A');
      await seedFundedWallet(pageA, wif, fundedAddress);
      await openBsvDebugScreen(pageA);

      await expect(pageA.locator('#bsv-anchor-address')).toBeVisible();
      await pageA.locator('#bsv-anchor-address').fill(anchorAddress);

      const balanceText = pageA.getByText(/^Balance: \d+ sat/);
      await expect(balanceText).toBeVisible({ timeout: 30_000 });
      const balanceMatch = (await balanceText.textContent())?.match(/^Balance: (\d+) sat/);
      const satoshis = balanceMatch ? Number(balanceMatch[1]) : 0;
      expect(satoshis, `funded key ${fundedAddress} has no testnet balance to write with`).toBeGreaterThan(0);

      await pageA.locator('#bsv-record-text').fill(recordText);
      await pageA.getByRole('button', { name: 'Write', exact: true }).click();

      const txidEl = pageA.getByTestId('bsv-write-txid');
      await expect(txidEl).toBeVisible({ timeout: 60_000 });
      const txid = (await txidEl.textContent())?.trim() ?? '';
      expect(txid).toMatch(/^[0-9a-f]{64}$/);

      // Acceptance criterion 2: the run's output names the txid.
      console.log(`profile A wrote record ${txid}`);

      // --- Profile B: a separate browser context sharing nothing but the protocol id and anchor ---
      const contextB = await browser.newContext();
      const pageB = await contextB.newPage();
      try {
        await completeOnboarding(pageB, 'Install B');
        await openBsvDebugScreen(pageB);

        // Read by txid.
        await pageB.locator('#bsv-read-txid').fill(txid);
        await pageB.getByRole('button', { name: 'Read', exact: true }).click();
        const readText = pageB.getByTestId('bsv-read-text');
        await expect(readText).toBeVisible({ timeout: 30_000 });
        await expect(readText).toHaveText(recordText);

        // Scan by anchor.
        await pageB.locator('#bsv-anchor-address').fill(anchorAddress);
        await pageB.getByRole('button', { name: 'Scan', exact: true }).click();
        const scanEntry = pageB.locator(`[data-testid="bsv-scan-entry"][data-full-txid="${txid}"]`);
        await expect(scanEntry).toBeVisible({ timeout: 60_000 });
        await expect(scanEntry).toContainText(recordText);

        console.log(`profile B confirmed record ${txid} by txid and by anchor scan`);
      } finally {
        await contextB.close();
      }
    } finally {
      await contextA.close();
    }
  });
});

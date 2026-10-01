// tests/e2e/bsv-debug-gated-read.spec.ts
//
// Proves mw-jeswf.5 against a real production build in a real browser: a License token
// minted on the BSV Debug screen carries the wrap to the device's own wrap key, 'Write with
// token' writes an encrypted W, and 'Read by txid' reads it back 'as This device' (the text)
// and 'as A different key' (a line starting 'cannot read'), with the WebCrypto work running in
// Chromium and none of the "X is not defined" faults of mw-yo97u.11-.13.
//
// Same setup as browser-events-proof.spec.ts: builds dist/ itself (npx vite build), serves it
// with `vite preview` on port 4173, and answers every WhatsOnChain call with page.route from
// tests/fixtures/bsv/license-contract-wallet.json and this run's own broadcasts: no real
// network, no real sats. Not part of `npm test`; run by hand or from a story with:
//
//   npx playwright test tests/e2e/bsv-debug-gated-read.spec.ts
//
// Both specs use port 4173: run them one at a time (--workers=1), not side by side.

import { test, expect, type Page } from '@playwright/test';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Transaction } from '@bsv/sdk';
import wallet from '../fixtures/bsv/license-contract-wallet.json' with { type: 'json' };

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREVIEW_PORT = 4173;
const PREVIEW_ORIGIN = `http://localhost:${PREVIEW_PORT}`;
const APP_PATH = '/spell-forge/';
const WOC_BASE = 'https://api.whatsonchain.com/v1/bsv/test';

const NODE_BUILTIN_FAULT_PATTERNS = [
  /process is not defined/i,
  /Class extends value/i,
  /is not a function/i,
  /is not defined/i,
  /is not a constructor/i,
];

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`${url} never came up: ${String(lastError)}`);
}

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
            id: 'e2e-proof-key',
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

/**
 * Stubs every WhatsOnChain call this run needs: the owner's one funding UTXO, the hex of any
 * txid this run itself broadcasts (seeded with the fixture funding transaction, and growing
 * as each mint/write/transfer is fulfilled), and broadcast itself, which never leaves the
 * page — it computes the real txid of the posted hex and remembers it, exactly as the real
 * WhatsOnChain would confirm it, without ever touching the network.
 */
async function stubWhatsOnChain(page: Page): Promise<void> {
  const knownHex = new Map<string, string>([[wallet.mintFundingTx.txid, wallet.mintFundingTx.hex]]);

  await page.route(`${WOC_BASE}/address/${wallet.owner.address}/unspent`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify([
        { tx_hash: wallet.mintFundingTx.txid, tx_pos: wallet.mintFundingTx.vout, value: wallet.mintFundingTx.satoshis },
      ]),
    }),
  );

  await page.route(`${WOC_BASE}/tx/*/hex`, (route) => {
    const txid = new URL(route.request().url()).pathname.split('/').at(-2)!;
    const hex = knownHex.get(txid);
    if (!hex) {
      return route.fulfill({ status: 404, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: 'not found' });
    }
    return route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: hex });
  });

  await page.route(`${WOC_BASE}/tx/raw`, (route) => {
    const { txhex } = JSON.parse(route.request().postData() ?? '{}') as { txhex: string };
    const txid = Transaction.fromHex(txhex).id('hex');
    knownHex.set(txid, txhex);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(txid),
    });
  });

  // Anything else WhatsOnChain (address history, unconfirmed history): none of this run's
  // steps need them, but answer with an empty result rather than let a stray call hang.
  await page.route(`${WOC_BASE}/**`, (route) => {
    if (route.request().url().includes('/unspent') || route.request().url().includes('/hex') || route.request().url().includes('/tx/raw')) {
      return route.fallback();
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify([]),
    });
  });
}

test.describe('gated reading in real Chromium (mw-jeswf.5)', () => {
  test('a License write reads as This device (the text) and as A different key (cannot read)', async ({ page }) => {
    test.setTimeout(180_000);

    execFileSync('npx', ['vite', 'build'], { cwd: repoRoot, stdio: 'inherit' });

    let previewProcess: ChildProcess | undefined;
    try {
      previewProcess = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
        cwd: repoRoot,
        stdio: 'pipe',
      });
      await waitForServer(`${PREVIEW_ORIGIN}${APP_PATH}`, 20_000);

      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') pageErrors.push(message.text());
      });

      await stubWhatsOnChain(page);
      await completeOnboarding(page, 'Gated Read');
      await seedFundedWallet(page, wallet.owner.wif, wallet.owner.address);
      await openBsvDebugScreen(page);
      await expect(page.getByText(/^Balance: \d+ sat/)).toBeVisible({ timeout: 15_000 });

      // --- Mint a License token, write 'hello gated' with it ---
      await page.locator('#bsv-mint-lock-license').check();
      await page.getByRole('button', { name: 'Mint token', exact: true }).click();
      const tokenEntry = page.getByTestId('bsv-token-entry').first();
      await expect(tokenEntry).toBeVisible({ timeout: 15_000 });

      await tokenEntry.locator('textarea').fill('hello gated');
      await tokenEntry.getByRole('button', { name: 'Write with token', exact: true }).click();
      const writeTxidEl = tokenEntry.getByTestId('bsv-token-write-txid');
      await expect(writeTxidEl).toBeVisible({ timeout: 15_000 });
      const writeTxid = (await writeTxidEl.textContent())?.trim() ?? '';
      expect(writeTxid).toMatch(/^[0-9a-f]{64}$/);

      // --- Read it as This device ---
      await page.getByLabel('Read by txid').fill(writeTxid);
      await expect(page.getByRole('radio', { name: 'This device' })).toBeChecked();
      await page.getByRole('button', { name: 'Read', exact: true }).click();
      await expect(page.getByTestId('bsv-read-text')).toHaveText('hello gated', { timeout: 15_000 });

      // --- Read it as A different key ---
      await page.getByRole('radio', { name: 'A different key' }).check();
      await page.getByRole('button', { name: 'Read', exact: true }).click();
      await expect(page.getByText(/^cannot read/)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('bsv-read-text')).toHaveCount(0);

      const faults = pageErrors.filter((message) => NODE_BUILTIN_FAULT_PATTERNS.some((pattern) => pattern.test(message)));
      expect(faults, `page-level errors matching a Node-builtin fault: ${JSON.stringify(faults)}`).toEqual([]);
    } finally {
      previewProcess?.kill();
    }
  });
});

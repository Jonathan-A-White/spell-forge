// tests/e2e/browser-events-proof.spec.ts
//
// Proves mw-yo97u.11, .12 and .13's fixes against a real production build in a real browser:
// minting, writing and transferring a License + Fuel token through the app's own BSV Debug
// screen all complete, throwing none of "process is not defined" (mw-yo97u.11), "Class
// extends value #<Object> is not a constructor or null" (scrypt-ts's Provider extends Node's
// `events`, which Vite externalizes to an empty module for the browser — mw-yo97u.12), or
// "Buffer is not defined" / a crash reading past a Buffer-shaped stand-in scryptlib's own
// vendored 'buffer' copy didn't recognize (mw-yo97u.13).
//
// Builds dist/ itself (npx vite build) and serves it with `vite preview` on the same port
// playwright.config.ts's baseURL points at, independent of that config's own (testnet-gated)
// webServer. Every WhatsOnChain call is intercepted with page.route and answered from the
// fixture wallet (tests/fixtures/bsv/license-contract-wallet.json) and from the hex of
// whatever this run itself broadcasts — no real network, no real broadcast, no real sats.
//
// Not part of `npm test` (real Chromium + a production build) and not run by the rig's
// landing check; run by hand or from a story with:
//
//   npx playwright test tests/e2e/browser-events-proof.spec.ts

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

test.describe('browser build proof: minting a License + Fuel token in real Chromium (mw-yo97u.12)', () => {
  test('mint, write and transfer build and broadcast (stubbed) with no Node-builtin fault', async ({ page }) => {
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
      await completeOnboarding(page, 'Browser Proof');
      await seedFundedWallet(page, wallet.owner.wif, wallet.owner.address);
      await openBsvDebugScreen(page);

      await expect(page.getByText(/^Balance: \d+ sat/)).toBeVisible({ timeout: 15_000 });

      // --- Mint ---
      await page.locator('#bsv-mint-lock-license').check();
      await page.getByRole('button', { name: 'Mint token', exact: true }).click();
      const mintTxidEl = page.getByTestId('bsv-mint-txid');
      await expect(mintTxidEl).toBeVisible({ timeout: 15_000 });
      const mintTxid = (await mintTxidEl.textContent())?.trim() ?? '';
      expect(mintTxid).toMatch(/^[0-9a-f]{64}$/);
      console.log(`browser proof: minted License + Fuel token ${mintTxid}`);

      const tokenEntry = page.getByTestId('bsv-token-entry').first();
      await expect(tokenEntry).toBeVisible();

      // A write or transfer additionally deserializes the License's locking script
      // (spendableLicense -> readLockingScript), which is where mw-yo97u.13's fix (a
      // globalThis.Buffer stand-in, src/bsv/buffer-stub.ts) applies; with all three of this
      // epic's Node-builtin fixes in place, both must actually succeed, not merely avoid the
      // fault patterns.
      async function attemptTokenAction(action: string, run: () => Promise<void>, txidLocator: ReturnType<Page['getByTestId']>) {
        const errorLocator = tokenEntry.locator('p.text-red-600');
        await run();
        await expect(txidLocator.or(errorLocator)).toBeVisible({ timeout: 15_000 });
        if (await errorLocator.isVisible()) {
          const message = (await errorLocator.textContent())?.trim() ?? '';
          expect(message, `${action} must succeed, not fail with: ${message}`).toBe('');
          return;
        }
        const txid = (await txidLocator.textContent())?.trim() ?? '';
        expect(txid, `${action} must produce a txid`).toMatch(/^[0-9a-f]{64}$/);
        console.log(`browser proof: ${action} succeeded, txid ${txid}`);
      }

      // --- Write with token ---
      await tokenEntry.locator('textarea').fill('mw-yo97u.12 browser proof write');
      await attemptTokenAction(
        'write with token',
        () => tokenEntry.getByRole('button', { name: 'Write with token', exact: true }).click(),
        tokenEntry.getByTestId('bsv-token-write-txid'),
      );

      // --- Transfer ---
      await tokenEntry.locator('input[type="text"]').fill(wallet.buyer.pubKey);
      await attemptTokenAction(
        'transfer',
        () => tokenEntry.getByRole('button', { name: 'Transfer', exact: true }).click(),
        tokenEntry.getByTestId('bsv-transfer-txid'),
      );

      const faults = pageErrors.filter((message) => NODE_BUILTIN_FAULT_PATTERNS.some((pattern) => pattern.test(message)));
      expect(faults, `page-level errors matching a Node-builtin fault: ${JSON.stringify(faults)}`).toEqual([]);
    } finally {
      previewProcess?.kill();
    }
  });
});

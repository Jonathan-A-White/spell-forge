// tests/e2e/word-list-photo-import.spec.ts
//
// Proves mw-z361n.5 against a real production build in real Chromium: a parent picks a photo of a
// printed word list in the list editor; the editor says 'Reading your photo...'; the parent leaves
// with Cancel and the Word Lists row of the list the editor saved says 'Reading your photo...' too.
//
// The Postern backend (https://postern.allmymind.org) is answered by page.route: a challenge, /api/me
// with a mill key, blobs, a delivered grist, and messages pages that never carry the answer, so the
// import stays 'reading' for the whole run. The device has a wallet key, put in the bsvWallet table
// the way the Settings screen's "Create this device's key" does (a testnet WIF), so the photo goes to the factory
// instead of being read on the device at once. Screenshots land in test-results/.
//
// The app is built and served once by playwright.config.ts (the specs reach it by baseURL). Not part of `npm test`; run by hand or from a story with:
//
//   npm run test:e2e -- word-list-photo-import

import { test, expect, type Page } from '@playwright/test';
import { noTapGuard } from './tap-guard';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrivateKey } from '@bsv/sdk';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP_PATH = '/spell-forge/';
const POSTERN = 'https://postern.allmymind.org';
const PHOTO = join(repoRoot, 'tests', 'fixtures', 'grist', 'word-list.jpg');
const SHOTS = join(repoRoot, 'test-results');

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

async function completeOnboarding(page: Page, name: string): Promise<void> {
  await page.goto(APP_PATH);
  await expect(page.getByText('Welcome to SpellForge!')).toBeVisible();
  await page.getByPlaceholder('Enter your name').fill(name);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start Forging!' }).click();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
}

/** A device wallet key, in the row shape Settings' "Create this device's key" saves. */
async function giveDeviceKey(page: Page): Promise<void> {
  const key = PrivateKey.fromRandom();
  const row = {
    id: 'e2e-device-key',
    kind: 'wif',
    network: 'testnet',
    material: key.toWif([0xef]),
    address: key.toAddress('testnet'),
    createdAt: new Date(),
  };
  await page.evaluate(
    (wallet) =>
      new Promise<void>((resolve, reject) => {
        const openReq = indexedDB.open('SpellForgeDB');
        openReq.onerror = () => reject(openReq.error);
        openReq.onsuccess = () => {
          const db = openReq.result;
          const tx = db.transaction('bsvWallet', 'readwrite');
          tx.objectStore('bsvWallet').put(wallet);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    row,
  );
}

interface PosternCalls {
  challenges: number;
  blobs: number;
  delivered: number;
  messagePages: number;
}

/** Answers the Postern backend: it takes the photo and the grist and never sends the mill's answer. */
async function stubPostern(page: Page): Promise<PosternCalls> {
  const mill = PrivateKey.fromRandom().toPublicKey().toString();
  const calls: PosternCalls = { challenges: 0, blobs: 0, delivered: 0, messagePages: 0 };
  const json = (body: unknown, status = 200) => ({
    status,
    contentType: 'application/json',
    headers: CORS,
    body: JSON.stringify(body),
  });

  await page.route(`${POSTERN}/**`, (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });

    if (pathname === '/api/challenge') {
      calls.challenges += 1;
      return route.fulfill(json({ nonce: `${calls.challenges}`.padStart(2, '0').repeat(56) }));
    }
    if (pathname === '/api/me') {
      const pubkey = /^Postern2 ([0-9a-f]{66}):/.exec(request.headers()['authorization'] ?? '')?.[1] ?? '';
      return route.fulfill(json({ pubkey, mill, network: 'testnet', features: ['grist'], apps: ['spellforge'] }));
    }
    if (pathname === '/api/blobs') {
      calls.blobs += 1;
      return route.fulfill(json({ hash: 'ab'.repeat(32), size: request.postDataBuffer()?.length ?? 0 }, 201));
    }
    if (pathname === '/api/messages' && request.method() === 'POST') {
      calls.delivered += 1;
      return route.fulfill(json({ txid: `direct:${'cd'.repeat(32)}`, seq: 1 }, 201));
    }
    if (pathname === '/api/messages') {
      calls.messagePages += 1;
      return route.fulfill(json({ records: [], next: 1 }));
    }
    return route.fulfill(json({ error: 'not stubbed' }, 404));
  });
  return calls;
}

test.describe('photo import status in the list editor and Word Lists (mw-z361n.5)', () => {
  test("a picked photo reads as 'Reading your photo...' in the editor and in the Word Lists row", async ({ page }) => {
    test.setTimeout(180_000);
    mkdirSync(SHOTS, { recursive: true });

    await noTapGuard(page);

    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const postern = await stubPostern(page);
    await completeOnboarding(page, 'Photo Import');
    await giveDeviceKey(page);

    // --- A new list, a photo, and no name typed ---
    await page.getByRole('button', { name: /My Words/ }).click();
    await expect(page.getByRole('heading', { name: 'Word Lists' })).toBeVisible();
    await page.getByRole('button', { name: '+ New' }).click();
    await expect(page.getByRole('heading', { name: 'New Word List' })).toBeVisible();

    await page.getByTestId('camera-file-input').setInputFiles(PHOTO);

    // --- The editor says the photo is being read, and will not take a second one ---
    const editorNote = page.getByRole('status').filter({ hasText: 'Reading your photo...' });
    await expect(editorNote).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('camera-import-btn')).toBeDisabled();
    await page.screenshot({ path: join(SHOTS, 'word-list-reading.png'), fullPage: true });
    // the note shows while the photo is still on its way, so wait for the stub to have counted it
    await expect.poll(() => postern.delivered, { message: 'the photo went to the factory, not to the device' }).toBe(1);
    await expect.poll(() => postern.blobs).toBe(1);

    // --- The parent leaves; the list the editor saved shows the same note in its row ---
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Word Lists' })).toBeVisible();
    const row = page.getByRole('button').filter({ hasText: /^Photo list \d{1,2} [A-Z][a-z]{2}/ });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole('status')).toHaveText('Reading your photo...');
    await page.screenshot({ path: join(SHOTS, 'word-list-reading-row.png'), fullPage: true });

    expect(postern.delivered, 'leaving did not send the photo again').toBe(1);
    expect(pageErrors, `page-level errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
  });
});

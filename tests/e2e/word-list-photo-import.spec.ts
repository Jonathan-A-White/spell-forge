// tests/e2e/word-list-photo-import.spec.ts
//
// Proves mw-z361n.5 against a real production build in real Chromium: a parent picks a photo of a
// printed word list in the list editor; the editor says 'Reading your photo...'; the parent leaves
// with Cancel and the Word Lists row of the list the editor saved says 'Reading your photo...' too.
//
// The Postern backend (https://postern.allmymind.org) is answered by page.route through bsv-kit's fake Postern: a
// challenge, /api/me with a mill key, blobs, a delivered grist, and messages pages that carry no answer, so the
// import stays 'reading' until the test, as the mill, answers (mw-79en7t.16: the words land on the spelling graph). The device has a wallet key, put in the bsvWallet table
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
import { PrivateKey, Utils } from '@bsv/sdk';
import { grist } from 'bsv-kit/grist';
import { MILL_KEY, fakePostern, type FakePostern } from 'bsv-kit/testing';

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
async function giveDeviceKey(page: Page, key: PrivateKey): Promise<void> {
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

/** Answers the Postern backend with bsv-kit's fake: it takes the photo and the grist, and sends the mill's answer only when the test replies. */
async function stubPostern(page: Page, deviceKey: PrivateKey): Promise<FakePostern> {
  const fake = fakePostern({ base: POSTERN, appKey: Uint8Array.from(deviceKey.toArray('be', 32)) });

  await page.route(`${POSTERN}/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = request.postDataBuffer();
    const response = await fake.fetch(request.url(), {
      method: request.method(),
      headers: request.headers(),
      ...(body ? { body: new Uint8Array(body) } : {}),
    });
    return route.fulfill({
      status: response.status,
      contentType: response.headers.get('content-type') ?? 'application/json',
      headers: CORS,
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
  return fake;
}

const count = (fake: FakePostern, method: string, path: string): number => fake.seen.filter((call) => call.method === method && call.path === path).length;

/** The grists the app posted, opened with the mill's key. */
function delivered(fake: FakePostern): { grist: { app: string; kind: string; v: string }; input: { schemaVersion: string; nodes: { id: string }[] } }[] {
  return fake.seen
    .filter((call) => call.method === 'POST' && call.path === '/messages')
    .map((call) => {
      const { scriptHex } = JSON.parse(Utils.toUTF8(Array.from(call.body as Uint8Array))) as { scriptHex: string };
      return JSON.parse(grist.openCt(grist.readRecordScript(scriptHex).envelope.ct, MILL_KEY));
    });
}

interface StoredWord {
  text: string;
  nodeId?: string;
  nodeReason?: string;
}

/** The words in the app's database, as the list editor and the Spelling world's drill read them. */
async function storedWords(page: Page): Promise<StoredWord[]> {
  return page.evaluate(
    () =>
      new Promise<StoredWord[]>((resolve, reject) => {
        const openReq = indexedDB.open('SpellForgeDB');
        openReq.onerror = () => reject(openReq.error);
        openReq.onsuccess = () => {
          const db = openReq.result;
          const all = db.transaction('words', 'readonly').objectStore('words').getAll();
          all.onsuccess = () => {
            db.close();
            resolve(all.result as StoredWord[]);
          };
          all.onerror = () => reject(all.error);
        };
      }),
  );
}

test.describe('photo import status in the list editor and Word Lists (mw-z361n.5)', () => {
  test("a picked photo reads as 'Reading your photo...' in the editor and in the Word Lists row", async ({ page }) => {
    test.setTimeout(180_000);
    mkdirSync(SHOTS, { recursive: true });

    await noTapGuard(page);

    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const deviceKey = PrivateKey.fromRandom();
    const postern = await stubPostern(page, deviceKey);
    await completeOnboarding(page, 'Photo Import');
    await giveDeviceKey(page, deviceKey);

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
    await expect.poll(() => count(postern, 'POST', '/messages'), { message: 'the photo went to the factory, not to the device' }).toBe(1);
    await expect.poll(() => count(postern, 'POST', '/blobs')).toBe(1);

    // --- The request carries the nodes of the spelling graph, for the factory to place the words on ---
    const [sent] = delivered(postern);
    expect(sent.grist).toEqual({ app: 'spellforge', kind: 'word-list', v: '2' });
    expect(sent.input.schemaVersion).toBe('2');
    expect(sent.input.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(['short-vowel-dge', 'vowel-team-igh', 'digraph-sh']));

    // --- The parent leaves; the list the editor saved shows the same note in its row ---
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Word Lists' })).toBeVisible();
    const row = page.getByRole('button').filter({ hasText: /^Photo list \d{1,2} [A-Z][a-z]{2}/ });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole('status')).toHaveText('Reading your photo...');
    await page.screenshot({ path: join(SHOTS, 'word-list-reading-row.png'), fullPage: true });

    expect(count(postern, 'POST', '/messages'), 'leaving did not send the photo again').toBe(1);

    // --- The mill answers with each word's node (one of them a node the graph does not have); the words land placed ---
    const answer = {
      words: ['badge', 'light', 'shop', 'knee'],
      placed: [
        { word: 'badge', node: 'short-vowel-dge' },
        { word: 'light', node: 'vowel-team-igh' },
        { word: 'shop', node: 'no-such-node' },
        { word: 'knee' },
      ],
    };
    const record = postern.reply({ re: `direct:${'a'.repeat(64)}`, status: 'answered', answer, grind: { app: 'spellforge', kind: 'word-list', v: '2' } });
    record.seq = 2; // after the grist it answers (seq 1)
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(row.getByRole('status')).toHaveCount(0, { timeout: 60_000 });
    const words = new Map((await storedWords(page)).map((word) => [word.text, word]));
    expect([...words.keys()].sort()).toEqual(['badge', 'knee', 'light', 'shop']);
    expect(words.get('badge')?.nodeId).toBe('short-vowel-dge');
    expect(words.get('light')?.nodeId).toBe('vowel-team-igh');
    // a node the graph does not have falls back to the pattern match, and the reason is kept
    expect(words.get('shop')).toMatchObject({ nodeId: 'digraph-sh' });
    expect(words.get('shop')?.nodeReason).toContain('no-such-node');
    expect(words.get('knee')?.nodeId).toBe('silent-letter-kn-wr');
    await page.screenshot({ path: join(SHOTS, 'word-list-placed.png'), fullPage: true });

    expect(pageErrors, `page-level errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
  });
});

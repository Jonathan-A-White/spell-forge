// tests/e2e/tutor.spec.ts
//
// Proves mw-bhvxcn.8 against a real production build in real Chromium: with the sf-tutor flag off Home has no
// Tutor tile; with it on the tile opens the Tutor screen; a typed problem goes to the factory as a problem-in
// grist, the screen shows a spinner and the seconds, and the answer's target_text shows large in the child's own
// font and size; a reload brings the problem back from Dexie.
//
// The Postern backend (https://postern.allmymind.org) is answered by page.route, and the stub plays the mill: it
// opens the delivered grist with the mill's key (so the test sees exactly what the app sent) and answers it once,
// sealed to the device's key, after the screen has been seen waiting. The device has a wallet key, put in the
// bsvWallet table the way the BSV Debug screen's Generate does. Screenshots land in test-results/.
//
// Same setup as word-list-photo-import.spec.ts: builds dist/ itself (npx vite build), serves it with
// `vite preview` on port 4173. Not part of `npm test`; run by hand or from a story with:
//
//   npm run test:e2e -- tutor
//
// Every e2e spec uses port 4173: run them one at a time (--workers=1), not side by side.

import { test, expect, type Page } from '@playwright/test';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { EncryptedMessage, PrivateKey, PublicKey, Utils } from '@bsv/sdk';
import { decodeRecordScript } from '../../src/bsv/record';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREVIEW_PORT = 4173;
const PREVIEW_ORIGIN = `http://localhost:${PREVIEW_PORT}`;
const APP_PATH = '/spell-forge/';
const POSTERN = 'https://postern.allmymind.org';
const SHOTS = join(repoRoot, 'test-results');

const TYPED = 'anna has 3 aples and buys 4 more how many aples now';
const READ_BACK = 'Anna has 3 apples and buys 4 more. How many apples does she have now?';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

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

/** A device wallet key, in the row shape the BSV Debug screen's Generate saves. */
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

interface Factory {
  /** What the app sent in each delivered grist, opened with the mill's key. */
  delivered: { grist: { app: string; kind: string }; input: Record<string, unknown>; attachments: unknown[] }[];
  /** Let the mill answer: until this is called the app only ever sees 'pending'. */
  answerNow(): void;
}

/** Plays the Postern backend and the mill behind it. */
async function stubFactory(page: Page, device: PrivateKey, mill: PrivateKey): Promise<Factory> {
  const millPub = mill.toPublicKey().toString();
  const devicePub = device.toPublicKey().toString();
  const factory: Factory = { delivered: [], answerNow: () => { answering = true; } };
  let answering = false;
  let challenges = 0;
  const records: Record<string, unknown>[] = [];
  const json = (body: unknown, status = 200) => ({
    status,
    contentType: 'application/json',
    headers: CORS,
    body: JSON.stringify(body),
  });

  await page.route(`${POSTERN}/**`, (route) => {
    const request = route.request();
    const { pathname, searchParams } = new URL(request.url());
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });

    if (pathname === '/api/challenge') {
      challenges += 1;
      return route.fulfill(json({ nonce: `${challenges}`.padStart(2, '0').repeat(56) }));
    }
    if (pathname === '/api/me') {
      return route.fulfill(json({ pubkey: devicePub, mill: millPub, network: 'testnet', features: ['grist'], apps: ['spellforge'] }));
    }
    if (pathname === '/api/blobs') {
      return route.fulfill(json({ hash: 'ab'.repeat(32), size: request.postDataBuffer()?.length ?? 0 }, 201));
    }
    if (pathname === '/api/messages' && request.method() === 'POST') {
      const { scriptHex } = JSON.parse(request.postData() ?? '{}') as { scriptHex: string };
      const decoded = decodeRecordScript(scriptHex);
      const envelope = JSON.parse(Utils.toUTF8(decoded?.payloadBytes ?? [])) as { ct: string };
      const opened = Utils.toUTF8(EncryptedMessage.decrypt(Utils.toArray(envelope.ct, 'base64'), mill));
      factory.delivered.push(JSON.parse(opened));
      return route.fulfill(json({ txid: `direct:${'cd'.repeat(32)}`, seq: 1 }, 201));
    }
    if (pathname === '/api/messages') {
      const since = Number(searchParams.get('since') ?? '0');
      if (answering && factory.delivered.length > 0 && records.length === 0) {
        const plaintext = {
          re: `direct:${'cd'.repeat(32)}`,
          status: 'answered',
          answer: {
            action: 'continue',
            focus_words: [],
            prompt_to_child: 'Here is your problem.',
            layer_diagnosis: 'none',
            target_text: READ_BACK,
            problem_kind: 'word',
          },
        };
        const ct = Utils.toBase64(EncryptedMessage.encrypt(Utils.toArray(JSON.stringify(plaintext), 'utf8'), mill, PublicKey.fromString(devicePub)));
        records.push({
          seq: 2,
          txid: `direct:${'ef'.repeat(32)}`,
          vout: 0,
          scriptHex: '',
          height: 0,
          firstSeen: new Date().toISOString(),
          signer: millPub,
          payload: { v: 1, kind: 'msg', class: 'grist', to: devicePub, from: millPub, ts: Math.floor(Date.now() / 1000), ct },
        });
      }
      return route.fulfill(json({ records: records.filter((r) => (r.seq as number) > since), next: records.length > 0 ? 2 : 1 }));
    }
    return route.fulfill(json({ error: 'not stubbed' }, 404));
  });
  return factory;
}

test.describe('the Tutor screen behind sf-tutor (mw-bhvxcn.8)', () => {
  test('a typed problem goes out, is read back, and shows large; a reload keeps it', async ({ page }) => {
    test.setTimeout(180_000);
    mkdirSync(SHOTS, { recursive: true });

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

      const device = PrivateKey.fromRandom();
      const factory = await stubFactory(page, device, PrivateKey.fromRandom());
      await completeOnboarding(page, 'Tutor Kid');
      await giveDeviceKey(page, device);

      // --- Flag off: nothing new on Home ---
      await expect(page.getByRole('button', { name: /Tutor/ })).toHaveCount(0);

      // --- Flag on: the Tutor tile ---
      await page.evaluate(() => localStorage.setItem('sf-tutor', '1'));
      await page.reload();
      const tile = page.getByRole('button', { name: /Tutor/ });
      await expect(tile).toBeVisible();
      await tile.click();
      await expect(page.getByRole('heading', { name: 'Tutor' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Take a photo' })).toBeVisible();
      await expect(page.getByRole('radio')).toHaveCount(0);

      // --- A typed problem goes out as a problem-in grist, and the screen waits ---
      await page.getByRole('button', { name: 'Type it instead' }).click();
      await page.getByLabel('Type the problem').fill(TYPED);
      await page.screenshot({ path: join(SHOTS, 'tutor-typed.png'), fullPage: true });
      await page.getByRole('button', { name: 'Send' }).click();
      await expect(page.getByRole('status')).toBeVisible({ timeout: 15_000 });
      await expect.poll(() => factory.delivered.length, { timeout: 15_000 }).toBe(1);
      expect(factory.delivered[0].grist).toMatchObject({ app: 'spellforge', kind: 'tutor-turn' });
      expect(factory.delivered[0].input).toMatchObject({ mode: 'problem-in', strictness: 'meaning-gated', target_text: TYPED });
      await page.screenshot({ path: join(SHOTS, 'tutor-reading.png'), fullPage: true });

      // --- The mill answers: the problem it read shows large, in the child's own font and size ---
      factory.answerNow();
      const shown = page.getByText(READ_BACK);
      await expect(shown).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('A word problem')).toBeVisible();
      const sizes = await shown.evaluate((el) => ({
        shown: parseFloat(getComputedStyle(el).fontSize),
        child: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sf-font-size')),
        family: getComputedStyle(el).fontFamily,
        childFamily: getComputedStyle(document.documentElement).getPropertyValue('--sf-font-family'),
      }));
      expect(sizes.shown, 'larger than the child\'s own reading size').toBeGreaterThan(sizes.child);
      expect(sizes.family.replace(/["\s]/g, '')).toBe(sizes.childFamily.replace(/["\s]/g, ''));
      await page.screenshot({ path: join(SHOTS, 'tutor-shown.png'), fullPage: true });

      // --- A reload: Home again, and the Tutor tile brings the problem back from Dexie ---
      await page.reload();
      await page.getByRole('button', { name: /Tutor/ }).click();
      await expect(page.getByText(READ_BACK)).toBeVisible({ timeout: 15_000 });
      expect(factory.delivered, 'nothing was sent a second time').toHaveLength(1);

      expect(pageErrors, `page-level errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    } finally {
      previewProcess?.kill();
    }
  });
});

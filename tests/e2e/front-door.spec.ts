// tests/e2e/front-door.spec.ts: the front door at a phone's 390x844, in a real browser (Chromium), against the BUILT app (the one
// server playwright.config.ts builds and serves; Kestrel 13e, mw-79en7t.67). With the Tutor on, the app opens on the door: the tutor
// greets by voice and there is no keyboard; he talks with the big bar; something shared from another app (a screenshot, a highlighted
// passage) waits with Send this picture / Not this one, is never sent by itself, lands in the talk as his turn once sent, and is not
// landed again on the next boot (the reload). voice-kit's honest speech and microphone fakes stand in for the phone's voice and ear.
//
// The Postern backend (https://postern.allmymind.org) is answered by page.route, and the stub plays the mill: it opens each delivered
// grist with the mill's key (so the spec sees exactly what the app sent) and answers it, sealed to the device's key, as tutor.spec.ts's does.
//
// Run: npx playwright test front-door --project=chromium
import { expect, test, type Page } from '@playwright/test';
import { EncryptedMessage, PrivateKey, PublicKey, Utils } from '@bsv/sdk';
import { clips, micInitScript } from 'voice-kit/testing/mic';
import { speechInitScript } from 'voice-kit/testing/speech';
import { decodeRecordScript } from '../../src/bsv/record';
import { shot } from './shot';
import { noTapGuard } from './tap-guard';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const APP_PATH = '/spell-forge/';
const POSTERN = 'https://postern.allmymind.org';
const SEES_HOMEWORK = 'I can see your homework. Which question is the hard one?';
const HEARS_YOU = 'Good. Tell me more about it.';
// a 1x1 PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

interface Delivered {
  grist: { app: string; kind: string; v: string };
  input: { message: string; pictures?: number };
  attachments: unknown[];
}

interface Factory {
  /** What the app sent in each delivered grist, opened with the mill's key. */
  delivered: Delivered[];
  /** From now on the backend cannot be reached: a turn cannot be sent. */
  goDown(): void;
}

/** Plays the Postern backend and the mill behind it: each grist delivered is answered at once, with words that depend on whether a picture came. */
async function stubFactory(page: Page, device: PrivateKey, mill: PrivateKey): Promise<Factory> {
  const millPub = mill.toPublicKey().toString();
  const devicePub = device.toPublicKey().toString();
  const delivered: Delivered[] = [];
  const records: Record<string, unknown>[] = [];
  let down = false;
  let seq = 0;
  let challenges = 0;
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });

  await page.route(`${POSTERN}/**`, (route) => {
    const request = route.request();
    const { pathname, searchParams } = new URL(request.url());
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (down) return route.abort('internetdisconnected');

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
      const opened = JSON.parse(Utils.toUTF8(EncryptedMessage.decrypt(Utils.toArray(envelope.ct, 'base64'), mill))) as Delivered;
      delivered.push(opened);
      const posted = (seq += 1);
      const txid = `direct:${posted.toString(16).padStart(2, '0').repeat(32)}`;
      // the mill answers at once: the next look finds it
      const plaintext = { re: txid, status: 'answered', answer: { words: opened.input.pictures ? SEES_HOMEWORK : HEARS_YOU } };
      const ct = Utils.toBase64(EncryptedMessage.encrypt(Utils.toArray(JSON.stringify(plaintext), 'utf8'), mill, PublicKey.fromString(devicePub)));
      seq += 1;
      records.push({
        seq,
        txid: `direct:${seq.toString(16).padStart(2, '0').repeat(32)}`,
        vout: 0,
        scriptHex: '',
        height: 0,
        firstSeen: new Date().toISOString(),
        signer: millPub,
        payload: { v: 1, kind: 'msg', class: 'grist', to: devicePub, from: millPub, ts: Math.floor(Date.now() / 1000), ct },
      });
      return route.fulfill(json({ txid, seq: posted }, 201));
    }
    if (pathname === '/api/messages') {
      const since = Number(searchParams.get('since') ?? '0');
      return route.fulfill(json({ records: records.filter((record) => (record.seq as number) > since), next: seq }));
    }
    return route.fulfill(json({ error: 'not stubbed' }, 404));
  });
  return { delivered, goDown: () => { down = true; } };
}

/** A device wallet key, in the row shape the Grown-ups screen's "This device's key" saves. */
async function giveDeviceKey(page: Page, key: PrivateKey): Promise<void> {
  const row = { id: 'e2e-device-key', kind: 'wif', network: 'testnet', material: key.toWif([0xef]), address: key.toAddress('testnet'), createdAt: new Date() };
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

/** What the share sheet leaves for the app (src/share/share-store.ts: the Dexie database 'spell-forge-share', its `shares` table), parked as the worker parks it. */
async function parkShare(page: Page, share: { id: string; text?: string; picture: boolean }): Promise<void> {
  await page.evaluate(
    ({ id, text, picture, png }) =>
      new Promise<void>((resolve, reject) => {
        // Dexie's version(1) is IndexedDB version 10
        const openReq = indexedDB.open('spell-forge-share', 10);
        openReq.onupgradeneeded = () => {
          const store = openReq.result.createObjectStore('shares', { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        };
        openReq.onerror = () => reject(openReq.error);
        openReq.onsuccess = () => {
          const db = openReq.result;
          const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
          const files = picture ? [{ name: 'homework.png', type: 'image/png', bytes: bytes.buffer }] : [];
          const tx = db.transaction('shares', 'readwrite');
          tx.objectStore('shares').clear();
          tx.objectStore('shares').add({ id, createdAt: Date.now(), text, files });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { ...share, png: PNG },
  );
}

/** Opens the app as the share sheet does: at the address the worker redirects to, a page load of its own. */
async function openAsShared(page: Page, id: string): Promise<void> {
  await page.goto(`${APP_PATH}#/tutor?share=${id}`);
  await page.reload();
}

/** A phone that has never held SpellForge, the Tutor on, a child called Rowan and the device's key; the door is open and has greeted. */
async function startOnTheDoor(page: Page): Promise<Factory> {
  await noTapGuard(page);
  await page.addInitScript(() => localStorage.setItem('sf-tutor', '1'));
  await page.addInitScript(speechInitScript({ msPerWord: 5, baseMs: 5, voicesDelayMs: 5 }));
  await page.addInitScript(micInitScript({ clip: clips.english, grantMs: 5, openMs: 5, silenceMs: 5 }));
  const device = PrivateKey.fromRandom();
  const factory = await stubFactory(page, device, PrivateKey.fromRandom());
  await page.goto(APP_PATH);
  await expect(page.getByText('Welcome to SpellForge!')).toBeVisible();
  await page.getByPlaceholder('Enter your name').fill('Rowan');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start Forging!' }).click();
  await expect(page.getByText('Hello! I am your tutor.')).toBeVisible();
  await giveDeviceKey(page, device);
  return factory;
}

async function fitsThePhone(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({ window: window.innerWidth, page: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(widths.window).toBe(390);
  expect(widths.page).toBeLessThanOrEqual(widths.window);
  expect(widths.body).toBeLessThanOrEqual(widths.window);
}

const spoken = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __bsvKitTesting: { speech: { spoken(): string[] } } }).__bsvKitTesting.speech.spoken());

test('the app opens on the door: the tutor greets by voice, a share waits and lands in the talk once, and he talks with the bar, at 390x844', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const factory = await startOnTheDoor(page);

  // --- the door: the greeting is spoken and drawn, a big bar and a camera, no keyboard ---
  await expect.poll(async () => (await spoken(page)).join(' ')).toContain('Hello! I am your tutor.');
  await expect(page.getByRole('button', { name: 'Hold to talk' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Take a photo' })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.locator('textarea, input[type="text"]')).toHaveCount(0);
  await fitsThePhone(page);
  await shot(page, 'front-door-opens');

  // --- a screenshot is shared with SpellForge: the door opens with it waiting, and nothing has been sent ---
  await parkShare(page, { id: 'share-1', text: 'Question 4', picture: true });
  await openAsShared(page, 'share-1');
  await expect(page.getByText('Hello! I am your tutor.')).toBeVisible();
  await expect(page.getByTestId('shared-picture')).toBeVisible();
  await expect(page.getByText('Question 4')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send this picture' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Not this one' })).toBeVisible();
  expect(factory.delivered).toEqual([]);
  await fitsThePhone(page);
  await shot(page, 'front-door-share');

  // --- one tap sends it as his turn, with the picture, to the tutor-talk grind; the tutor's answer is drawn and spoken ---
  await page.getByRole('button', { name: 'Send this picture' }).click();
  await expect(page.getByText(SEES_HOMEWORK)).toBeVisible();
  await expect(page.getByTestId('shared-picture')).toHaveCount(0);
  expect(factory.delivered).toHaveLength(1);
  expect(factory.delivered[0].grist).toEqual({ app: 'spellforge', kind: 'tutor-talk', v: '1' });
  expect(factory.delivered[0].input).toMatchObject({ message: 'Question 4', pictures: 1 });
  expect(factory.delivered[0].attachments).toHaveLength(1);
  await expect.poll(async () => (await spoken(page)).join(' ')).toContain(SEES_HOMEWORK);
  await fitsThePhone(page);
  await shot(page, 'front-door-after-send');

  // --- the next boot: the share is gone ---
  await page.reload();
  await expect(page.getByRole('button', { name: 'Hold to talk' })).toBeVisible();
  await expect(page.getByTestId('shared-picture')).toHaveCount(0);
  await expect(page.getByText('Question 4')).toHaveCount(0);
  expect(factory.delivered).toHaveLength(1);

  // --- he holds the big bar and talks: letting go sends what he said ---
  const bar = page.getByRole('button', { name: 'Hold to talk' });
  const box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByTestId('live-transcript')).toHaveText(clips.english.transcript, { timeout: 20_000 });
  await page.mouse.up();
  await expect(page.getByText(HEARS_YOU)).toBeVisible();
  expect(factory.delivered).toHaveLength(2);
  expect(factory.delivered[1].input.message).toBe(clips.english.transcript);
  expect(factory.delivered[1].input.pictures).toBeUndefined();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await fitsThePhone(page);
  await shot(page, 'front-door-talk');

  expect(pageErrors).toEqual([]);
});

test('a share that is not wanted is turned away, and words shared with no picture wait to be sent too', async ({ page }) => {
  const factory = await startOnTheDoor(page);

  await parkShare(page, { id: 'share-2', text: 'Question 4', picture: true });
  await openAsShared(page, 'share-2');
  await page.getByRole('button', { name: 'Not this one' }).click();
  await expect(page.getByTestId('shared-picture')).toHaveCount(0);
  expect(factory.delivered).toEqual([]);

  await parkShare(page, { id: 'share-3', text: 'Question 4', picture: false });
  await openAsShared(page, 'share-3');
  await expect(page.getByTestId('shared-words')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send these words' })).toBeVisible();
  await fitsThePhone(page);
  await page.getByRole('button', { name: 'Send these words' }).click();
  await expect(page.getByText(HEARS_YOU)).toBeVisible();
  expect(factory.delivered).toHaveLength(1);
  expect(factory.delivered[0].input).toMatchObject({ message: 'Question 4' });
  expect(factory.delivered[0].input.pictures).toBeUndefined();
});

test('with the factory down the door says so, and the picture stays to be sent again', async ({ page }) => {
  const factory = await startOnTheDoor(page);

  await parkShare(page, { id: 'share-4', text: 'Question 4', picture: true });
  await openAsShared(page, 'share-4');
  await expect(page.getByTestId('shared-picture')).toBeVisible();
  factory.goDown();
  await page.getByRole('button', { name: 'Send this picture' }).click();
  await expect(page.getByText('The tutor cannot be reached right now. Check the internet and try again.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Send this picture' })).toBeVisible();
  expect(factory.delivered).toEqual([]);
  await fitsThePhone(page);
  await shot(page, 'front-door-down');
});

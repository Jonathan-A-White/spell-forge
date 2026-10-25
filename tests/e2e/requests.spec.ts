// tests/e2e/requests.spec.ts: requests to the maker and Conversations at a phone's 390x844, in a real browser (Chromium), against the BUILT
// app (mw-79en7t.20). He asks the tutor for something the app cannot do; the tutor says so and offers to pass it on; nothing is sent until
// he taps "Send this to the maker", which sends ONE grist of the maker-request grind with his words and who. A grown-up then finds it
// under Settings > Requests to the maker with the asks people are expected to make, picks one (which opens the tutor on it), and reads the
// talks kept on the phone in Conversations, searched by a word. The Postern backend is answered by page.route and the stub plays the mill,
// as front-door.spec.ts's does. There is no feedback form and no email.
//
// Run: npx playwright test requests --project=phone
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
const ASK = 'Can you read my maths book out loud to me?';
const OFFERS = 'SpellForge cannot read a book aloud yet. Shall I pass that on to the maker?';
const SUMMARY = 'Read a maths book aloud';
// a 1x1 PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

interface Delivered {
  grist: { app: string; kind: string; v: string };
  input: { message?: string; pictures?: number; kind?: string; text?: string; summary?: string; reference?: string; who?: string; app_version?: string };
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
      const answer = opened.grist.kind === 'maker-request' ? { status: 'sent' } : { words: OFFERS, maker_request: { summary: SUMMARY } };
      const plaintext = { re: txid, status: 'answered', answer };
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

test('he asks for what the app cannot do, taps Send once, and a grown-up finds it under Requests; Conversations lists the talk, searched and opened', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const factory = await startOnTheDoor(page);

  // --- he asks (a shared sentence stands for what he said): the tutor says it cannot, and offers to pass it on ---
  await parkShare(page, { id: 'share-1', text: ASK, picture: false });
  await openAsShared(page, 'share-1');
  await page.getByRole('button', { name: 'Send these words' }).click();
  await expect(page.getByText(OFFERS)).toBeVisible();
  const send = page.getByRole('button', { name: 'Send this to the maker' });
  await expect(send).toBeVisible();
  const talkGrists = () => factory.delivered.filter((d) => d.grist.kind === 'tutor-talk');
  const makerGrists = () => factory.delivered.filter((d) => d.grist.kind === 'maker-request');
  expect(talkGrists()).toHaveLength(1);
  expect(makerGrists()).toEqual([]); // nothing is sent without the tap
  await fitsThePhone(page);
  await shot(page, 'requests-offer');

  // --- one tap sends one request: his words, the tutor's summary, the talk and who asked (his id, never his name) ---
  await send.click();
  await expect(page.getByText('Sent. The answer will come back.')).toBeVisible();
  await expect(send).toHaveCount(0);
  expect(makerGrists()).toHaveLength(1);
  expect(makerGrists()[0].grist).toEqual({ app: 'spellforge', kind: 'maker-request', v: '1' });
  expect(makerGrists()[0].input).toMatchObject({ schemaVersion: '1', kind: 'tutor-ask', text: ASK, summary: SUMMARY });
  expect(makerGrists()[0].input.who).toMatch(/\S/);
  expect(makerGrists()[0].input.who).not.toContain('Rowan');
  expect(JSON.stringify(makerGrists()[0])).not.toContain('Rowan');
  await fitsThePhone(page);
  await shot(page, 'requests-sent');

  // --- Settings > Requests to the maker: who asked, where it stands, and the asks people are expected to make ---
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Send Feedback/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Requests to the maker/ }).click();
  await expect(page.getByRole('heading', { name: 'Requests to the maker' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rowan' })).toBeVisible();
  const mine = page.getByRole('list', { name: 'Requests of Rowan' });
  await expect(mine).toContainText(SUMMARY);
  await expect(mine).toContainText('Sent');
  const expected = page.getByRole('list', { name: 'Things people ask for' });
  await expect(expected.getByRole('listitem')).toHaveCount(5);
  await fitsThePhone(page);
  await shot(page, 'requests-screen');

  // --- picking an expected ask opens the tutor on it, to be said aloud ---
  await page.getByRole('button', { name: /A new word game/ }).click();
  await expect(page.getByText('You would like a new word game.')).toBeVisible();
  await expect.poll(async () => (await spoken(page)).join(' ')).toContain('You would like a new word game.');
  await expect(page.getByRole('button', { name: 'Hold to talk' })).toBeVisible();
  await fitsThePhone(page);
  await shot(page, 'requests-picked');

  // --- Conversations: the talks kept on the phone, searched by a word and opened ---
  await page.getByRole('button', { name: 'Conversations' }).click();
  await expect(page.getByRole('heading', { name: 'Conversations' })).toBeVisible();
  const talks = page.getByRole('list', { name: 'Conversations' });
  await expect(talks.getByRole('listitem').first()).toBeVisible();
  await fitsThePhone(page);
  await shot(page, 'conversations-list');
  await page.getByRole('searchbox', { name: 'Search conversations' }).fill('zeppelin');
  await expect(page.getByText(/No conversation has those words/)).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search conversations' }).fill('maths');
  await expect(talks.getByRole('listitem')).toHaveCount(1);
  await talks.getByRole('button').first().click();
  await expect(page.getByText(ASK)).toBeVisible();
  await expect(page.getByText(OFFERS)).toBeVisible();
  await fitsThePhone(page);
  await shot(page, 'conversations-open');
  await page.getByRole('button', { name: 'Back to conversations' }).click();
  await expect(page.getByRole('searchbox', { name: 'Search conversations' })).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test('with the factory down the offer says it was not sent and the button stays to try again', async ({ page }) => {
  const factory = await startOnTheDoor(page);
  await parkShare(page, { id: 'share-2', text: ASK, picture: false });
  await openAsShared(page, 'share-2');
  await page.getByRole('button', { name: 'Send these words' }).click();
  await expect(page.getByText(OFFERS)).toBeVisible();

  factory.goDown();
  await page.getByRole('button', { name: 'Send this to the maker' }).click();
  await expect(page.getByRole('alert')).toContainText('cannot be reached', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Send this to the maker' })).toBeEnabled();
  expect(factory.delivered.filter((d) => d.grist.kind === 'maker-request')).toEqual([]);
  await fitsThePhone(page);
  await shot(page, 'requests-down');
});

// tests/e2e/grown-ups.spec.ts: the Grown-ups world at a phone's 390x844, in a real browser (Chromium). A grown-up picks who is learning
// (Who is learning), opens Grown-ups from the Tutor (the PIN gate: choose a PIN and a question the first time, the PIN after), finds the
// Licence section (Buy, and a line that getting a licence is coming soon) and Settings (a first line and a search box); How is it going is a section of
// the Grown-ups home, read from the progress each world keeps for the learner (put in localStorage here, as the worlds write it). Each
// screen sits inside the window with nothing to scroll sideways.
//
// The app is served with `vite` (dev) on a port of its own, because the walk imports the spelling graph's node ids. The app opens on the tutor's door (left by its Home
// button). Getting a licence opens nothing: the spec counts the pages the context opens.
//
// Run: npx playwright test grown-ups (the chromium project; the port is this worktree's own, plus four, or SF_E2E_PORT).
import { expect, test, type Page } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';
import { order } from 'learn-kit/graph';
import { killGroup, spawnGroup } from '../support/spawned-processes';
import { previewPort } from '../support/preview-port';
import { spellingGraph } from '../../src/learn/spelling';
import { shot } from './shot';
import { leaveTheDoor } from './door';
import { noTapGuard } from './tap-guard';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const PORT = Number(process.env.SF_E2E_PORT) || previewPort(process.cwd()) + 4;
const ORIGIN = `http://localhost:${PORT}`;
const APP = `${ORIGIN}/spell-forge/`;

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`${url} never came up: ${String(lastError)}`);
}

let server: ChildProcess | undefined;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  server = spawnGroup('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', 'localhost'], { stdio: 'pipe' });
  await waitForServer(APP, 60_000);
  // The first load makes vite bundle the dependencies and reload the page once; let that happen before the walk starts.
  const warmUp = await browser.newPage();
  await warmUp.goto(APP);
  await expect(warmUp.getByRole('heading', { name: 'Welcome to Kestrel!' })).toBeVisible({ timeout: 120_000 });
  await warmUp.waitForLoadState('networkidle');
  await warmUp.close();
});

test.afterAll(() => killGroup(server));

async function fitsThePhone(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({ window: window.innerWidth, page: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(widths.window).toBe(390);
  expect(widths.page).toBeLessThanOrEqual(widths.window);
  expect(widths.body).toBeLessThanOrEqual(widths.window);
}

const PIN = '2468';
const pin = async (page: Page, digits: string): Promise<void> => {
  for (const digit of digits) await page.getByRole('button', { name: digit, exact: true }).click();
};

/** The first `count` spelling skills as the Spelling world keeps them for the learner picked: solid (src/worlds/spelling/spelling-store.ts). */
async function makeSolidInSpelling(page: Page, count: number): Promise<void> {
  const solid = order(spellingGraph).slice(0, count);
  await page.evaluate(
    async ({ ids }) => {
      const profileId = await new Promise<string>((resolve, reject) => {
        const openReq = indexedDB.open('SpellForgeDB');
        openReq.onerror = () => reject(openReq.error);
        openReq.onsuccess = () => {
          const db = openReq.result;
          const all = db.transaction('profiles').objectStore('profiles').getAllKeys();
          all.onsuccess = () => {
            db.close();
            resolve(String(all.result[0]));
          };
          all.onerror = () => reject(all.error);
        };
      });
      const states = ids.map((id) => [id, { level: 'solid', since: Date.now(), how: 'e2e' }]);
      localStorage.setItem(`sf-spelling-graph:${profileId}`, JSON.stringify(states));
    },
    { ids: solid },
  );
}

test('Who is learning, the PIN gate, Licence, Settings, at 390x844', async ({ page, context }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const opened: string[] = [];
  context.on('page', (opener) => opened.push(opener.url()));
  await noTapGuard(page);

  // --- a new child is welcomed, then Home (the Tutor is switched on once Home is shown: with it on, a child picked opens the front door) ---
  await page.goto(APP);
  await page.getByPlaceholder('Enter your name').fill('Rowan');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start Forging!' }).click();
  await leaveTheDoor(page);
  await expect(page.getByRole('heading', { name: 'Hey, Rowan!' })).toBeVisible();

  // --- Who is learning: the learner, what the tutor knows of them, the first line; tapping them opens Home ---
  await page.getByRole('button', { name: 'Profiles' }).click();
  await expect(page.getByRole('heading', { name: 'Who is learning?' })).toBeVisible();
  await expect(page.getByTestId('first-line')).toHaveText('Tap who is learning today, or add someone new.');
  await expect(page.getByRole('button', { name: /^Rowan/ })).toContainText('The tutor has not learned about them yet.');
  await expect(page.getByRole('button', { name: 'Add a learner' })).toBeVisible();
  await fitsThePhone(page);
  await shot(page, 'grown-ups-who-is-learning');
  await page.getByRole('button', { name: /^Rowan/ }).click();
  await leaveTheDoor(page);
  await expect(page.getByRole('heading', { name: 'Hey, Rowan!' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hey, Rowan!' })).toBeVisible();

  await makeSolidInSpelling(page, 12);

  // --- the gate: the first time a PIN and a question are chosen; the Tutor's Grown-ups button leads here ---
  await page.getByRole('button', { name: /^Tutor/ }).click();
  await expect(page.getByRole('heading', { name: 'Tutor', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Grown-ups' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a 4-digit PIN' })).toBeVisible();
  await fitsThePhone(page);
  await shot(page, 'grown-ups-choose-pin');
  await pin(page, PIN);
  await expect(page.getByRole('heading', { name: 'Type it again' })).toBeVisible();
  await pin(page, PIN);
  await expect(page.getByRole('heading', { name: 'Pick a question' })).toBeVisible();
  await page.getByLabel('Your answer').fill('pasta');
  await fitsThePhone(page);
  await page.getByRole('button', { name: 'Save' }).click();

  // --- Grown-ups, and its Licence section: Buy reads the licence, getting a licence says it is coming soon and opens nothing ---
  await expect(page.getByRole('heading', { name: 'Grown-ups', exact: true })).toBeVisible();
  await expect(page.getByTestId('first-line')).toBeVisible();

  // --- its home draws How is it going?, from what the Spelling world kept: 12 skills solid; Maths has nothing yet ---
  const howIsItGoing = page.getByRole('heading', { name: 'How is it going?' });
  await howIsItGoing.scrollIntoViewIfNeeded();
  await expect(howIsItGoing).toBeVisible();
  const spelling = page.getByRole('region', { name: 'Spelling' });
  await expect(spelling.getByTestId('solid-count')).toContainText('12 skills');
  await expect(spelling.getByText('Working on next:')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Maths' }).getByTestId('no-data')).toHaveText('Nothing to show for maths yet.');
  await fitsThePhone(page);
  await shot(page, 'grown-ups-how-is-it-going');

  const licence = page.getByRole('region', { name: 'Licence' });
  await licence.scrollIntoViewIfNeeded();
  await expect(licence.getByText('The tutor needs a licence. Everything else works without one.')).toBeVisible();
  await licence.getByRole('button', { name: 'Buy' }).click();
  await expect(licence.getByRole('status')).toHaveText("This device has no key yet. Make one under This device's key first.");
  const getLicence = licence.getByText('Getting a licence: coming soon.');
  await expect(getLicence).toBeVisible();
  await fitsThePhone(page);
  await shot(page, 'grown-ups-licence');
  await expect(licence.getByRole('link')).toHaveCount(0);
  await getLicence.click();
  expect(opened).toEqual([]);

  // --- leaving locks it again ---
  await page.getByRole('button', { name: /Back/ }).click();
  await page.getByRole('button', { name: 'Grown-ups' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your PIN' })).toBeVisible();
  await pin(page, '1111');
  await expect(page.getByRole('alert')).toHaveText('Try again');
  await expect(page.getByRole('heading', { name: 'Grown-ups', exact: true })).toHaveCount(0);
  await fitsThePhone(page);
  await shot(page, 'grown-ups-wrong-pin');
  await pin(page, PIN);
  await expect(page.getByRole('heading', { name: 'Grown-ups', exact: true })).toBeVisible();

  // --- Settings, from Home: a first line and a search box ---
  await page.getByRole('button', { name: /Back/ }).click();
  await page.getByRole('button', { name: 'Go back' }).click();
  await expect(page.getByRole('heading', { name: 'Hey, Rowan!' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByTestId('first-line')).toHaveText('Change how the app looks and works, or search for any setting.');
  await expect(page.getByRole('searchbox', { name: 'Search settings' })).toBeVisible();
  await fitsThePhone(page);
  await shot(page, 'grown-ups-settings');
  await page.getByRole('button', { name: /^About & Credits/ }).click();
  await expect(page.getByRole('heading', { name: 'About & Credits' })).toBeVisible();
  await fitsThePhone(page);
  await shot(page, 'grown-ups-about');

  expect(pageErrors, `page-level errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

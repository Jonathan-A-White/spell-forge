// tests/e2e/grown-ups.spec.ts: the Grown-ups world at a phone's 390x844, in a real browser (Chromium). A grown-up picks who is learning
// (Who is learning), opens Grown-ups from the Tutor (the PIN gate: choose a PIN and a question the first time, the PIN after), finds the
// Licence section (Buy, Get a licence opening the store) and Settings (a first line and a search box); How is it going is drawn on its
// own page. Each screen sits inside the window with nothing to scroll sideways.
//
// The app is served with `vite` (dev) on a port of its own, because no screen of the app draws How is it going yet: tests/e2e/harness/
// grown-ups.html hands it a learner's progress. The Tutor is behind its flag (localStorage 'sf-tutor'), switched on here. The store, and
// every other address the Licence check could reach, is answered by page.route: the test never reaches the network.
//
// Run: npx playwright test grown-ups (the chromium project; the port is this worktree's own, plus four, or SF_E2E_PORT).
import { expect, test, type Page } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';
import { killGroup, spawnGroup } from '../support/spawned-processes';
import { previewPort } from '../support/preview-port';
import { STORE_URL } from '../../src/shell/store';
import { shot } from './shot';
import { noTapGuard } from './tap-guard';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const PORT = Number(process.env.SF_E2E_PORT) || previewPort(process.cwd()) + 4;
const ORIGIN = `http://localhost:${PORT}`;
const APP = `${ORIGIN}/spell-forge/`;
const HOW_IS_IT_GOING = `${ORIGIN}/spell-forge/tests/e2e/harness/grown-ups.html`;

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
  await expect(warmUp.getByRole('heading', { name: 'Welcome to SpellForge!' })).toBeVisible({ timeout: 120_000 });
  await warmUp.waitForLoadState('networkidle');
  await warmUp.goto(HOW_IS_IT_GOING);
  await expect(warmUp.getByRole('heading', { name: 'How is it going?' })).toBeVisible({ timeout: 120_000 });
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

test('Who is learning, the PIN gate, Licence, Settings and How is it going, at 390x844', async ({ page, context }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await context.route(`${new URL(STORE_URL).origin}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>store</title>' }),
  );
  await noTapGuard(page);

  // --- a new child is welcomed, then Home (the Tutor is switched on once Home is shown: with it on, a child picked opens the front door) ---
  await page.goto(APP);
  await page.getByPlaceholder('Enter your name').fill('Rowan');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start Forging!' }).click();
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
  await expect(page.getByRole('heading', { name: 'Hey, Rowan!' })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('sf-tutor', '1'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hey, Rowan!' })).toBeVisible();

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

  // --- Grown-ups, and its Licence section: Buy reads the licence, Get a licence opens the store ---
  await expect(page.getByRole('heading', { name: 'Grown-ups', exact: true })).toBeVisible();
  await expect(page.getByTestId('first-line')).toBeVisible();
  const licence = page.getByRole('region', { name: 'Licence' });
  await licence.scrollIntoViewIfNeeded();
  await expect(licence.getByText('The tutor needs a licence. Everything else works without one.')).toBeVisible();
  await licence.getByRole('button', { name: 'Buy' }).click();
  await expect(licence.getByRole('status')).toHaveText("This device has no key yet. Make one under This device's key first.");
  const getLicence = licence.getByRole('link', { name: 'Get a licence' });
  await expect(getLicence).toBeVisible();
  await fitsThePhone(page);
  await shot(page, 'grown-ups-licence');
  const [store] = await Promise.all([context.waitForEvent('page'), getLicence.click()]);
  await store.waitForLoadState();
  expect(new URL(store.url()).href).toBe(new URL(STORE_URL).href);
  await store.close();

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

  // --- How is it going: both subjects in plain words ---
  await page.goto(HOW_IS_IT_GOING);
  await expect(page.getByRole('heading', { name: 'How is it going?' })).toBeVisible();
  const spelling = page.getByRole('region', { name: 'Spelling' });
  await expect(spelling.getByTestId('solid-count')).toContainText('12 skills');
  await expect(spelling.getByTestId('last-week')).toContainText('5 drills');
  const maths = page.getByRole('region', { name: 'Maths' });
  await expect(maths.getByTestId('goal-progress')).toContainText('of the way there');
  await expect(maths.getByTestId('last-week')).toContainText('No drills in the last week.');
  await fitsThePhone(page);
  await shot(page, 'grown-ups-how-is-it-going');

  expect(pageErrors, `page-level errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

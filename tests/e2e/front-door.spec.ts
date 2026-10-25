// tests/e2e/front-door.spec.ts: the front door at a phone's 390x844, in a real browser (Chromium), with voice-kit's honest speech and
// microphone fakes. The tutor greets by voice and there is no keyboard; he talks with the big bar; something shared from another app
// (a screenshot, a highlighted passage) waits with Send this picture / Not this one, is never sent by itself, lands in the talk once
// sent, is kept, and is not landed again on the next boot (the reload).
//
// The app does not draw FrontDoor yet, so the spec serves the page tests/e2e/harness/front-door.html with `vite` (dev) on a port of its
// own: that page opens the database, parks the share and takes it once as the app does, and stands in for the tutor-talk grind.
//
// Run: npx playwright test front-door (the chromium project; the port is this worktree's own, plus two, or SF_E2E_PORT).
import { expect, test, type Page } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';
import { clips } from 'voice-kit/testing/mic';
import { killGroup, spawnGroup } from '../support/spawned-processes';
import { previewPort } from '../support/preview-port';
import { shot } from './shot';
import { noTapGuard } from './tap-guard';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const PORT = Number(process.env.SF_E2E_PORT) || previewPort(process.cwd()) + 2;
const PAGE = `http://localhost:${PORT}/spell-forge/tests/e2e/harness/front-door.html`;
const TUTOR_SAYS = 'I can see your homework. Which question is the hard one?';

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
  await waitForServer(PAGE, 60_000);
  // The first load makes vite bundle the dependencies and reload the page once; let that happen before the walk starts.
  const warmUp = await browser.newPage();
  await warmUp.goto(PAGE);
  await expect(warmUp.getByRole('button', { name: 'Hold to talk' })).toBeVisible({ timeout: 120_000 });
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

const spoken = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __bsvKitTesting: { speech: { spoken(): string[] } } }).__bsvKitTesting.speech.spoken());

test('the tutor greets by voice, a share waits and lands in the talk once, and he talks with the bar, at 390x844', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && pageErrors.push(message.text()));
  await noTapGuard(page);

  // --- a screenshot is shared with Kestrel: the door opens with it waiting ---
  await page.goto(`${PAGE}?share=picture-and-words`);
  await expect(page.getByText('Hello! I am your tutor.')).toBeVisible();
  await expect.poll(async () => (await spoken(page)).join(' ')).toContain('Hello! I am your tutor.');
  await expect(page.getByRole('button', { name: 'Hold to talk' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Take a photo' })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.locator('textarea, input[type="text"]')).toHaveCount(0);

  await expect(page.getByTestId('shared-picture')).toBeVisible();
  await expect(page.getByText('Question 4')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send this picture' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Not this one' })).toBeVisible();
  expect(await page.evaluate(() => window.__door.asked)).toEqual([]);
  await fitsThePhone(page);
  await shot(page, 'front-door-share');

  // --- one tap sends it: his turn, with the picture, and the tutor's answer drawn and spoken ---
  await page.getByRole('button', { name: 'Send this picture' }).click();
  await expect(page.getByText(TUTOR_SAYS)).toBeVisible();
  await expect(page.getByTestId('shared-picture')).toHaveCount(0);
  expect(await page.evaluate(() => window.__door.asked)).toEqual([{ message: 'Question 4', pictures: 1, files: ['homework.png'] }]);
  await expect.poll(async () => (await spoken(page)).join(' ')).toContain(TUTOR_SAYS);
  await fitsThePhone(page);
  await shot(page, 'front-door-after-send');

  // --- the next boot: the share is gone and the talk is kept ---
  await page.goto(PAGE);
  await expect(page.getByRole('button', { name: 'Hold to talk' })).toBeVisible();
  await expect(page.getByTestId('shared-picture')).toHaveCount(0);
  await expect(page.getByText('Question 4')).toHaveCount(0);
  expect(await page.evaluate(() => window.__door.asked)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__door.talks())).toEqual(expect.arrayContaining(['user: Question 4', `assistant: ${TUTOR_SAYS}`]));

  // --- he holds the big bar and talks: letting go sends what he said ---
  const bar = page.getByRole('button', { name: 'Hold to talk' });
  const box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByTestId('live-transcript')).toHaveText(clips.english.transcript, { timeout: 20_000 });
  await page.mouse.up();
  await expect(page.getByText(TUTOR_SAYS)).toBeVisible();
  expect(await page.evaluate(() => window.__door.asked)).toEqual([{ message: clips.english.transcript, pictures: undefined, files: [] }]);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await fitsThePhone(page);
  await shot(page, 'front-door-talk');

  expect(pageErrors).toEqual([]);
});

test('a share that is not wanted is turned away, and words shared with no picture wait to be sent too', async ({ page }) => {
  await noTapGuard(page);

  await page.goto(`${PAGE}?share=picture-and-words`);
  await page.getByRole('button', { name: 'Not this one' }).click();
  await expect(page.getByTestId('shared-picture')).toHaveCount(0);
  expect(await page.evaluate(() => window.__door.asked)).toEqual([]);

  await page.goto(`${PAGE}?share=words`);
  await expect(page.getByTestId('shared-words')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send these words' })).toBeVisible();
  await fitsThePhone(page);
  await page.getByRole('button', { name: 'Send these words' }).click();
  await expect(page.getByText(TUTOR_SAYS)).toBeVisible();
  expect(await page.evaluate(() => window.__door.asked)).toEqual([{ message: 'Question 4', pictures: undefined, files: [] }]);
});

test('with no licence the worlds are big pictures and a share is not sent', async ({ page }) => {
  await noTapGuard(page);
  await page.goto(`${PAGE}?share=picture-and-words&licence=none`);
  await expect(page.getByRole('button', { name: 'Spelling' })).toBeVisible();
  await expect(page.getByTestId('shared-picture')).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  expect(await page.evaluate(() => window.__door.asked)).toEqual([]);
  await fitsThePhone(page);
  await shot(page, 'front-door-asleep');
});

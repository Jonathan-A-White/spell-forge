// tests/e2e/tutor-long-problem.spec.ts
//
// Proves mw-kuy7rx.6 in real Chromium on a phone-sized screen (390x844): a 20-line problem sits in its own scroll area
// above the 'Read it' button, the button stays in view (pinned at the bottom) and the text scrolls; the button keeps
// touch-action pan-y and the text area pan-y, so a second finger can scroll the text during a hold.
//
// The session is put straight into Dexie (a session and its answered problem turn) the way the Tutor screen would have
// left it. Same setup as tutor-reread.spec.ts: builds dist/ itself and serves it with `vite preview` on port 4173. Not
// part of `npm test`; run by hand with:
//
//   npm run test:e2e -- tutor-long-problem
//
// (SF_E2E_PORT=4180 ... when something else already holds port 4173.) Every e2e spec uses port 4173: run them one at a time.

import { test, expect, type Page } from '@playwright/test';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// 4173 like every e2e spec; SF_E2E_PORT moves it when another preview already holds that port
const PREVIEW_PORT = Number(process.env.SF_E2E_PORT ?? 4173);
const PREVIEW_ORIGIN = `http://localhost:${PREVIEW_PORT}`;
const APP_PATH = '/spell-forge/';
const SHOTS = join(repoRoot, 'test-results');
const LINES = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}: the character has ${i + 3} apples and buys ${i + 4} more apples at the market.`);
const PROBLEM = LINES.join('\n');

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
  await page.goto(`${PREVIEW_ORIGIN}${APP_PATH}`);
  await expect(page.getByText('Welcome to SpellForge!')).toBeVisible();
  await page.getByPlaceholder('Enter your name').fill(name);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start Forging!' }).click();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
}

/** An active session for the (only) profile: the long problem, answered, no reading yet. */
async function seedLongProblemSession(page: Page, problem: string): Promise<void> {
  await page.evaluate(
    (text) =>
      new Promise<void>((resolve, reject) => {
        const openReq = indexedDB.open('SpellForgeDB');
        openReq.onerror = () => reject(openReq.error);
        openReq.onsuccess = () => {
          const db = openReq.result;
          const read = db.transaction('profiles', 'readonly').objectStore('profiles').getAll();
          read.onerror = () => reject(read.error);
          read.onsuccess = () => {
            const profileId = (read.result[0] as { id: string }).id;
            const now = new Date();
            const tx = db.transaction(['tutorSessions', 'tutorTurns'], 'readwrite');
            tx.objectStore('tutorSessions').put({
              id: 'e2e-session',
              profileId,
              startedAt: now,
              strictness: 'meaning-gated',
              problemKind: 'word',
              targetText: text,
              status: 'active',
            });
            tx.objectStore('tutorTurns').put({
              id: 'e2e-turn-1',
              sessionId: 'e2e-session',
              index: 1,
              mode: 'problem-in',
              sentAt: now,
              answeredAt: now,
              request: { strictness: 'meaning-gated', session_history: [], mode: 'problem-in', target_text: text },
              attachments: [],
              status: 'answered',
            });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        };
      }),
    problem,
  );
}

test.describe('a long problem stays readable while he holds (mw-kuy7rx.6)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a 20-line problem scrolls in its own area and the Read it button stays in view', async ({ page }) => {
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

      await completeOnboarding(page, 'Long Kid');
      await seedLongProblemSession(page, PROBLEM);
      await page.evaluate(() => localStorage.setItem('sf-tutor', '1'));
      await page.reload();
      await page.getByRole('button', { name: /Tutor/ }).click();

      const button = page.getByRole('button', { name: 'Read it' });
      await expect(button).toBeVisible({ timeout: 15_000 });
      const area = page.getByTestId('reading-text');
      await expect(area).toContainText('Line 1:');

      // the button is fully in view, with no page scrolling, and the text area is the thing that overflows
      await expect(button).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      const metrics = await area.evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight, top: el.scrollTop, overflowY: getComputedStyle(el).overflowY, touchAction: getComputedStyle(el).touchAction }));
      expect(metrics.overflowY).toBe('auto');
      expect(metrics.touchAction).toBe('pan-y');
      expect(metrics.scroll, 'the 20 lines overflow the text area').toBeGreaterThan(metrics.client);
      expect(metrics.top).toBe(0);
      expect(await button.evaluate((el) => getComputedStyle(el).touchAction)).toBe('pan-y');
      expect(await area.evaluate((el, b) => el.contains(b), await button.elementHandle())).toBe(false);
      const before = await button.boundingBox();

      // the text scrolls to its last line; the button has not moved and is still in view
      await area.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await expect(page.getByText('Line 20:')).toBeInViewport();
      expect(await area.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      await expect(button).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      const after = await button.boundingBox();
      expect(after?.y).toBe(before?.y);
      await page.screenshot({ path: join(SHOTS, 'tutor-long-problem.png') });

      expect(pageErrors, `page-level errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    } finally {
      previewProcess?.kill();
    }
  });
});

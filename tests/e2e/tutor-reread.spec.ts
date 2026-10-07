// tests/e2e/tutor-reread.spec.ts
//
// Proves mw-ke5k7i in real Chromium on a phone-sized screen (390x844): when the tutor's answer asks to reread one
// word, the Tutor screen shows only that word, big, with its parts, a one-line tip, 'Say it again' and one
// 'Read the word' button, and that button is inside the viewport without scrolling.
//
// The session is put straight into Dexie (a session, the problem turn, and a reading turn answered with
// reread_word) the way the Tutor screen would have left it, so no mill stub is needed. Same setup as tutor.spec.ts:
// builds dist/ itself and serves it with `vite preview` on port 4173. Not part of `npm test`; run by hand with:
//
//   npm run test:e2e -- tutor-reread
//
// (SF_E2E_PORT=4180 npm run test:e2e -- tutor-reread, when something else already holds port 4173.)
//
// Every e2e spec uses port 4173: run them one at a time (--workers=1), not side by side.

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

const PROBLEM = 'The character has 3 apples and buys 4 more. How many apples does the character have now?';
const TIP = 'Look at this word, one chunk at a time, and say each part out loud before you put them together.';

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

/** An active session for the (only) profile: the problem shown, then a reading answered with reread_word. */
async function seedRereadSession(page: Page): Promise<void> {
  await page.evaluate(
    ({ problem, tip }) =>
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
            const request = { strictness: 'meaning-gated', session_history: [] };
            const tx = db.transaction(['tutorSessions', 'tutorTurns'], 'readwrite');
            tx.objectStore('tutorSessions').put({
              id: 'e2e-session',
              profileId,
              startedAt: now,
              strictness: 'meaning-gated',
              problemKind: 'word',
              targetText: problem,
              status: 'active',
            });
            tx.objectStore('tutorTurns').put({
              id: 'e2e-turn-1',
              sessionId: 'e2e-session',
              index: 1,
              mode: 'problem-in',
              sentAt: now,
              answeredAt: now,
              request: { ...request, mode: 'problem-in', target_text: problem },
              attachments: [],
              status: 'answered',
            });
            tx.objectStore('tutorTurns').put({
              id: 'e2e-turn-2',
              sessionId: 'e2e-session',
              index: 2,
              mode: 'reading',
              sentAt: now,
              answeredAt: now,
              request: { ...request, mode: 'reading', target_text: problem },
              attachments: [],
              answer: {
                action: 'reread_word',
                focus_words: [{ word: 'character', chunks: ['char', 'ac', 'ter'] }],
                prompt_to_child: tip,
                layer_diagnosis: 'reading',
              },
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
    { problem: PROBLEM, tip: TIP },
  );
}

test.describe('a reread shows only the missed word (mw-ke5k7i)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the word, its parts and the Read the word button fit one phone screen', async ({ page }) => {
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

      await completeOnboarding(page, 'Reread Kid');
      await seedRereadSession(page);
      await page.evaluate(() => localStorage.setItem('sf-tutor', '1'));
      await page.reload();
      await page.getByRole('button', { name: /Tutor/ }).click();

      const word = page.getByTestId('reread-word');
      await expect(word).toHaveText('character', { timeout: 15_000 });
      await expect(page.getByText('char · ac · ter')).toBeVisible();
      await expect(page.getByText(PROBLEM)).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Say it again' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Read it' })).toHaveCount(0);

      // the tip is clamped to one line
      const tip = page.getByText(TIP);
      const lineHeight = await tip.evaluate((el) => {
        const style = getComputedStyle(el);
        return { height: el.getBoundingClientRect().height, line: parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5 };
      });
      expect(lineHeight.height, 'the tip is one line tall').toBeLessThan(lineHeight.line * 1.5);

      // the one primary button is inside the viewport with no scrolling
      const button = page.getByRole('button', { name: 'Read the word' });
      await expect(button).toBeVisible();
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      const box = await button.boundingBox();
      expect(box, 'the button has a box').not.toBeNull();
      expect(box?.y).toBeGreaterThanOrEqual(0);
      expect((box?.y ?? 0) + (box?.height ?? 0), 'the button ends above the bottom of the 844 px screen').toBeLessThanOrEqual(844);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
      await expect(button).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: join(SHOTS, 'tutor-reread.png') });

      expect(pageErrors, `page-level errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    } finally {
      previewProcess?.kill();
    }
  });
});

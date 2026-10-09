// tests/e2e/tutor-speech-bar.spec.ts
//
// Proves mw-kuy7rx.20 in real Chromium on a 360x740 phone: while the tutor speaks, the speaking bar (Pause, Restart,
// Stop) sits in the footer above 'Read the word', inside the viewport, with 44 px targets; Pause turns into Resume.
// A synthesiser that never finishes by itself stands in for the phone's voice, so the bar stays up to be seen.
// Not part of `npm test`; run by hand with:
//
//   SF_E2E_PORT=4180 npm run test:e2e -- tutor-speech-bar
//
// Every e2e spec uses port 4173 by default: run them one at a time (--workers=1).

import { test, expect, type Page } from '@playwright/test';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREVIEW_PORT = Number(process.env.SF_E2E_PORT ?? 4173);
const PREVIEW_ORIGIN = `http://localhost:${PREVIEW_PORT}`;
const APP_PATH = '/spell-forge/';
const SHOTS = join(repoRoot, 'test-results');

const PROBLEM = 'The character has 3 apples and buys 4 more. How many apples does the character have now?';
const TIP = 'Look at this word, one chunk at a time. Say each part out loud. Then put them together.';

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
async function seedRereadSession(page: Page, withReread = true): Promise<void> {
  await page.evaluate(
    ({ problem, tip, withReread }) =>
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
            if (withReread) tx.objectStore('tutorTurns').put({
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
    { problem: PROBLEM, tip: TIP, withReread },
  );
}

test.describe("the tutor's speaking bar (mw-kuy7rx.20)", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('Pause, Restart and Stop sit in the footer while he speaks; Pause becomes Resume', async ({ page }) => {
    test.setTimeout(180_000);
    mkdirSync(SHOTS, { recursive: true });
    await page.addInitScript(() => {
      class Utterance {
        text: string;
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: ((e: unknown) => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      }
      const live: Utterance[] = [];
      const synth = {
        speak: (u: Utterance) => live.push(u),
        cancel: () => live.splice(0).forEach((u) => setTimeout(() => u.onerror?.({ error: 'interrupted' }), 0)),
        resume: () => undefined,
        pause: () => undefined,
        getVoices: () => [],
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      };
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true });
      Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    });

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

      await completeOnboarding(page, 'Bar Kid');
      await seedRereadSession(page);
      await page.evaluate(() => localStorage.setItem('sf-tutor', '1'));
      await page.reload();
      await page.getByRole('button', { name: /Tutor/ }).click();

      await expect(page.getByRole('button', { name: 'Say it again' })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('group', { name: 'Tutor speech' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Say it again' }).click();

      const bar = page.getByRole('group', { name: 'Tutor speech' });
      await expect(bar).toBeVisible();
      await expect(bar).toBeInViewport({ ratio: 1 });
      for (const name of ['Pause', 'Restart', 'Stop']) {
        const box = await bar.getByRole('button', { name }).boundingBox();
        expect(box?.height, `${name} is at least 44 px tall`).toBeGreaterThanOrEqual(44);
        expect((box?.x ?? 0) + (box?.width ?? 0), `${name} ends inside the 360 px screen`).toBeLessThanOrEqual(360);
      }
      const read = await page.getByRole('button', { name: 'Read the word' }).boundingBox();
      const barBox = await bar.boundingBox();
      expect((barBox?.y ?? 0) + (barBox?.height ?? 0), 'the bar ends above the Read the word button').toBeLessThanOrEqual(read?.y ?? 0);
      await page.screenshot({ path: join(SHOTS, 'tutor-speech-bar.png') });

      await bar.getByRole('button', { name: 'Pause' }).click();
      await expect(bar.getByRole('button', { name: 'Resume' })).toBeVisible();
      for (const name of ['Resume', 'Restart', 'Stop']) {
        const box = await bar.getByRole('button', { name }).boundingBox();
        expect((box?.x ?? 0) + (box?.width ?? 0), `${name} ends inside the 360 px screen`).toBeLessThanOrEqual(360);
      }
      await page.screenshot({ path: join(SHOTS, 'tutor-speech-bar-paused.png') });

      await bar.getByRole('button', { name: 'Stop' }).click();
      await expect(bar).toHaveCount(0);

      expect(pageErrors, `page-level errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
    } finally {
      previewProcess?.kill();
    }
  });
});

// tests/e2e/spelling-world.spec.ts: the Spelling world walked in a real browser at a phone's 390x844. A new child opens the world, is placed by
// hearing words and tapping the spelling (no keyboard anywhere), then plays a drill with the pattern's picture beside the game; then a game in
// Practice Games takes the child's one coin. Each screen sits inside the window with nothing to scroll sideways.
//
// The spec serves the app with `vite` (dev), whose modules are the app's own live instances (as worlds.spec.ts does):
//  - the Spelling world has no card on Home yet, so the tutor's "go" answer opens it, played by the shell's own `go` (taken from its context provider);
//  - a picture is "kept" the way the picture module finds it first (db.mnemonicPictures), so no grind is asked and nothing reaches the network;
//  - the child's words, one coin and the right spelling of a placement word come from the app's own modules.
//
// Run: npx playwright test spelling-world (the chromium project; the port is this worktree's own, plus three, or SF_E2E_PORT).
import { expect, test, type Page } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';
import { killGroup, spawnGroup } from '../support/spawned-processes';
import { previewPort } from '../support/preview-port';
import { shot } from './shot';
import { noTapGuard } from './tap-guard';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const PORT = Number(process.env.SF_E2E_PORT) || previewPort(process.cwd()) + 3;
const ORIGIN = `http://localhost:${PORT}`;
const APP_PATH = '/spell-forge/';
const PLACEMENT_LIMIT = 60;

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
  await waitForServer(`${ORIGIN}${APP_PATH}`, 60_000);
  // The first load makes vite bundle the dependencies and reload the page once; let that happen before the walk starts.
  const warmUp = await browser.newPage();
  await warmUp.goto(`${ORIGIN}${APP_PATH}`);
  await expect(warmUp.getByRole('heading', { name: 'Welcome to SpellForge!' })).toBeVisible({ timeout: 120_000 });
  await warmUp.waitForLoadState('networkidle');
  await warmUp.close();
});

test.afterAll(() => killGroup(server));

async function fitsThePhone(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    window: window.innerWidth,
    page: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(widths.window).toBe(390);
  expect(widths.page).toBeLessThanOrEqual(widths.window);
  expect(widths.body).toBeLessThanOrEqual(widths.window);
}

/** The tutor's "go" answer, played by the shell's own `go` (taken from its context provider): true when the screen opened. */
async function tutorSaysGo(page: Page, id: string): Promise<boolean> {
  return page.evaluate((target) => {
    const root = document.getElementById('root') as unknown as Record<string, unknown>;
    const key = Object.keys(root).find((k) => k.startsWith('__reactContainer$'));
    if (!key) throw new Error('the React root is not there');
    type Fiber = { tag: number; child: Fiber | null; sibling: Fiber | null; memoizedProps: { value?: { go?: (id: string) => boolean } } | null };
    const stack = [root[key] as Fiber];
    while (stack.length > 0) {
      const fiber = stack.pop()!;
      const value = fiber.memoizedProps?.value;
      if (fiber.tag === 10 && value && typeof value.go === 'function') return value.go(target);
      if (fiber.sibling) stack.push(fiber.sibling);
      if (fiber.child) stack.push(fiber.child);
    }
    throw new Error('no shell context provider found');
  }, id);
}

const PICTURE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="48" r="30" fill="#c33"/></svg>';

/** Keeps a picture for every node of the spelling graph, and three words the child has learned with one coin to play them. */
async function seedPicturesWordsAndACoin(page: Page): Promise<void> {
  await page.evaluate(
    async ({ appPath, picture }) => {
      const { db } = (await import(/* @vite-ignore */ `${appPath}src/data/db.ts`)) as typeof import('../../src/data/db');
      const { SPELLING_NODES } = (await import(/* @vite-ignore */ `${appPath}src/learn/spelling/index.ts`)) as typeof import('../../src/learn/spelling');
      const now = new Date();
      for (const node of SPELLING_NODES) await db.mnemonicPictures.put({ nodeId: node.id, svg: picture, createdAt: now });
      const [profile] = await db.profiles.toArray();
      const listId = 'e2e-list';
      await db.wordLists.put({ id: listId, profileId: profile.id, name: 'Week 1', language: 'en', testDate: null, createdAt: now, source: 'manual', active: true, archived: false });
      for (const text of ['cat', 'dog', 'sun']) {
        const wordId = `e2e-${text}`;
        await db.words.put({ id: wordId, listId, profileId: profile.id, text, phonemes: [], syllables: [], patterns: [], imageUrl: null, imageCached: false, createdAt: now });
        await db.learningProgress.put({
          id: `${profile.id}:${wordId}`,
          profileId: profile.id,
          wordId,
          wordListId: listId,
          stage: 3,
          consecutiveSuccesses: 2,
          consecutiveFailures: 0,
          mastered: true,
          totalAttempts: 3,
          totalErrors: 0,
          lastAttemptAt: now,
          createdAt: now,
        });
      }
      await db.coinBalances.put({ profileId: profile.id, coins: 1, totalEarned: 1, totalSpent: 0, updatedAt: now });
    },
    { appPath: APP_PATH, picture: PICTURE },
  );
}

/** The coins the child holds, as the app keeps them. */
async function coinsHeld(page: Page): Promise<number> {
  return page.evaluate(async (appPath) => {
    const { db } = (await import(/* @vite-ignore */ `${appPath}src/data/db.ts`)) as typeof import('../../src/data/db');
    const [profile] = await db.profiles.toArray();
    return (await db.coinBalances.get(profile.id))?.coins ?? 0;
  }, APP_PATH);
}

/** Of a placement question's two spellings, the one that is the word (the other is the graph's distractor for it). */
async function rightSpelling(page: Page, first: string, second: string): Promise<string> {
  return page.evaluate(
    async ({ appPath, a, b }) => {
      const { SPELLING_NODES } = (await import(/* @vite-ignore */ `${appPath}src/learn/spelling/index.ts`)) as typeof import('../../src/learn/spelling');
      for (const node of SPELLING_NODES) {
        for (const item of node.items) {
          if ((item.word === a && item.distractor === b) || (item.word === b && item.distractor === a)) return item.word;
        }
      }
      throw new Error(`neither ${a} nor ${b} is a word and its distractor in the spelling graph`);
    },
    { appPath: APP_PATH, a: first, b: second },
  );
}

test('the Spelling world: placement, a drill with a picture, and a game that takes a coin, at 390x844', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await noTapGuard(page);

  // --- A new child is welcomed, then Home; the child's pictures, words and one coin are kept on the phone ---
  await page.goto(`${ORIGIN}${APP_PATH}`);
  await expect(page.getByRole('heading', { name: 'Welcome to SpellForge!' })).toBeVisible();
  await page.getByPlaceholder('Enter your name').fill('Rowan');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start Forging!' }).click();
  await expect(page.getByRole('heading', { name: 'Hey, Rowan!' })).toBeVisible();
  await seedPicturesWordsAndACoin(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hey, Rowan!' })).toBeVisible();

  // --- Placement: a word to hear and two spellings to tap, and no keyboard ---
  expect(await tutorSaysGo(page, 'spelling-home')).toBe(true);
  await expect(page.getByRole('heading', { name: 'Spelling' })).toBeVisible();
  const placementLine = page.getByText(/Let's see what you know/);
  await expect(placementLine).toBeVisible();
  const hear = page.getByRole('button', { name: 'Hear the word' });
  await expect(hear).toBeVisible();
  await expect(page.locator('input, textarea')).toHaveCount(0);
  await expect(page.getByTestId('mnemonic-picture')).toHaveCount(0);
  await fitsThePhone(page);
  await shot(page, 'spelling-world-placement');

  // The child spells every word right, so the placement finds where he is and ends.
  for (let asked = 0; asked < PLACEMENT_LIMIT && (await placementLine.isVisible()); asked++) {
    const spellings = hear.locator('xpath=following-sibling::*[1]').getByRole('button');
    await expect(spellings).toHaveCount(2);
    const first = (await spellings.nth(0).innerText()).trim();
    const second = (await spellings.nth(1).innerText()).trim();
    await page.getByRole('button', { name: await rightSpelling(page, first, second), exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Right! Well done.');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0);
    await expect(page.getByText('One moment...')).toHaveCount(0);
  }
  await expect(placementLine).toHaveCount(0);

  // --- A drill: a game of the pattern's words with the pattern's picture beside it ---
  const picture = page.getByTestId('mnemonic-picture');
  await expect(picture).toBeVisible();
  const box = await picture.boundingBox();
  expect(box && box.width).toBeGreaterThan(0);
  await fitsThePhone(page);
  await shot(page, 'spelling-world-drill');

  // --- A game that takes a coin: Practice Games asks first, then the one coin is spent ---
  expect(await tutorSaysGo(page, 'practice-games')).toBe(true);
  await expect(page.getByText('🪙 1 Coin — 1 per game')).toBeVisible();
  expect(await coinsHeld(page)).toBe(1);
  await page.getByRole('button', { name: /Spell Catcher/ }).click();
  await expect(page.getByRole('heading', { name: 'Spend 1 Coin to Play?' })).toBeVisible();
  await fitsThePhone(page);
  await shot(page, 'spelling-world-coin-gate');
  await page.getByRole('button', { name: 'Spend 1 Coin & Play' }).click();
  await expect(page.getByRole('button', { name: 'Back to Games' })).toBeVisible();
  await fitsThePhone(page);
  await shot(page, 'spelling-world-game');
  await expect.poll(() => coinsHeld(page)).toBe(0);
  await page.getByRole('button', { name: 'Back to Games' }).click();
  await expect(page.getByText('🪙 0 Coins — 1 per game')).toBeVisible();
  await fitsThePhone(page);
  await shot(page, 'spelling-world-coin-spent');

  expect(pageErrors, `page-level errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

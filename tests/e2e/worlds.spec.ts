// tests/e2e/worlds.spec.ts: the four worlds walked in a real browser at a phone's 390x844. A new child is welcomed (Front door), opens
// My Words (Spelling), Maths (placement's first question) and Settings (Grown-ups); a stand-in for the tutor's "go" answer opens an old screen through the shell's openView;
// Get a licence opens STORE_URL; each screen sits inside the window with nothing to scroll sideways.
//
// Two things the built app cannot show, so this spec serves the app with `vite` (dev), whose modules are the app's own live instances:
//  - nothing in the app reads a licence yet (mw-6ww.111), so the licence state is handed to src/shell/licence-gate.ts the way that story will;
//  - (nothing else: Maths is reached by a tap on Home's Maths card, like the other worlds).
// No tutor answer says "go" yet, so the "go" function is taken from the shell's own context provider (React's fiber tree).
// The store itself is answered by page.route: the test never reaches the network.
//
// Run: npx playwright test worlds (the chromium project; the port is this worktree's own, plus one, or SF_E2E_PORT).
import { expect, test, type Page } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';
import { killGroup, spawnGroup } from '../support/spawned-processes';
import { previewPort } from '../support/preview-port';
import { STORE_URL } from '../../src/shell/store';
import { shot } from './shot';
import { noTapGuard } from './tap-guard';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const PORT = Number(process.env.SF_E2E_PORT) || previewPort(process.cwd()) + 1;
const ORIGIN = `http://localhost:${PORT}`;
const APP_PATH = '/spell-forge/';

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

test('the four worlds, an old screen from the tutor, and Get a licence, at 390x844', async ({ page, context }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await context.route(`${new URL(STORE_URL).origin}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>store</title>' }),
  );

  // the walk taps faster than a child, so the tap guard is off (tests/e2e/tap-guard.ts)
  await noTapGuard(page);

  // --- Front door: a new child is welcomed, then Home ---
  await page.goto(`${ORIGIN}${APP_PATH}`);
  await expect(page.getByRole('heading', { name: 'Welcome to SpellForge!' })).toBeVisible();
  await fitsThePhone(page);
  await page.getByPlaceholder('Enter your name').fill('Rowan');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start Forging!' }).click();
  await expect(page.getByRole('heading', { name: 'Hey, Rowan!' })).toBeVisible();
  await fitsThePhone(page);
  await shot(page, 'worlds-front-door');

  // --- Spelling: an old screen reached from its world (Home's My Words) ---
  await page.getByRole('button', { name: /My Words/ }).click();
  await expect(page.getByRole('heading', { name: 'Word Lists' })).toBeVisible();
  await fitsThePhone(page);
  await shot(page, 'worlds-spelling');

  // --- Maths: the card on Home, a tap a child can make; it starts by finding out what he knows, with the first question ---
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Hey, Rowan!' })).toBeVisible();
  await page.getByRole('button', { name: /Maths/ }).click();
  await expect(page.getByRole('heading', { name: 'Maths' })).toBeVisible();
  await expect(page.getByText(/see what you know/i)).toBeVisible();
  await expect(page.getByLabel('Your answer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Not sure' })).toBeVisible();
  await fitsThePhone(page);
  await shot(page, 'worlds-maths');

  // --- Grown-ups: Settings reached from Home ---
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Hey, Rowan!' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await fitsThePhone(page);
  await shot(page, 'worlds-grown-ups');

  // --- Get a licence: not shown before the licence is known, shown with none, opens STORE_URL ---
  const getLicence = page.getByRole('link', { name: 'Get a licence' });
  await expect(getLicence).toHaveCount(0);
  await page.evaluate(
    `import('${APP_PATH}src/shell/licence-gate.ts').then((gate) => gate.setLicenceStatus({ state: 'none', checkedAt: '2026-10-24T10:00:00Z' }))`,
  );
  await expect(getLicence).toBeVisible();
  await fitsThePhone(page);
  await shot(page, 'worlds-get-a-licence');
  const [store] = await Promise.all([context.waitForEvent('page'), getLicence.click()]);
  await store.waitForLoadState();
  expect(new URL(store.url()).href).toBe(new URL(STORE_URL).href);
  await store.close();

  // --- The tutor says go: an old screen in each of two worlds, and a screen that is not one opens nothing ---
  expect(await tutorSaysGo(page, 'progress')).toBe(true);
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();
  await expect(getLicence).toHaveCount(0);
  await fitsThePhone(page);
  await shot(page, 'worlds-tutor-go-progress');
  expect(await tutorSaysGo(page, 'about')).toBe(true);
  await expect(page.getByRole('heading', { name: 'About & Credits' })).toBeVisible();
  expect(await tutorSaysGo(page, 'no-such-screen')).toBe(false);
  await expect(page.getByRole('heading', { name: 'About & Credits' })).toBeVisible();

  expect(pageErrors, `page-level errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

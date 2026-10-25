// tests/e2e/maths-world.spec.ts: the Maths world walked in a real browser at a phone's 390x844. A new child opens the world, is placed by
// problems put in turn to be typed, heard, seen or done with number tiles (no keyboard is needed for the last), then works problems with the
// concept's mnemonic picture beside them; and a homework picture on the Tutor screen shows its concept's picture too. Each screen sits
// inside the window with nothing to scroll sideways.
//
// The spec serves the app with `vite` (dev), whose modules are the app's own live instances (as worlds.spec.ts does):
//  - the Maths world has no card on Home yet, so the tutor's "go" answer opens it, played by the shell's own `go` (taken from its context provider);
//  - a picture is "kept" the way the picture module finds it first (db.mnemonicPictures), so no grind is asked and nothing reaches the network;
//  - the right answer to a problem on the screen comes from the app's own maths graph.
//
// Run: npx playwright test maths-world (the chromium project; the port is this worktree's own, plus five, or SF_E2E_PORT).
import { expect, test, type Page } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';
import { killGroup, spawnGroup } from '../support/spawned-processes';
import { previewPort } from '../support/preview-port';
import { shot } from './shot';
import { noTapGuard } from './tap-guard';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const PORT = Number(process.env.SF_E2E_PORT) || previewPort(process.cwd()) + 5;
const ORIGIN = `http://localhost:${PORT}`;
const APP_PATH = '/spell-forge/';
const QUESTION_LIMIT = 80;

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

/** Keeps a picture for every concept of the maths graph, and a tutor session on a homework problem the graph knows, a maths turn in. */
async function seedPicturesAndHomework(page: Page): Promise<string> {
  return page.evaluate(
    async ({ appPath, picture }) => {
      const { db } = (await import(/* @vite-ignore */ `${appPath}src/data/db.ts`)) as typeof import('../../src/data/db');
      const { MATHS_NODES, PROBLEM_KIND_NODES } = (await import(/* @vite-ignore */ `${appPath}src/learn/maths/index.ts`)) as typeof import('../../src/learn/maths');
      const now = new Date();
      for (const node of MATHS_NODES) await db.mnemonicPictures.put({ nodeId: node.id, svg: picture, createdAt: now });
      const problem = PROBLEM_KIND_NODES.find((row) => row.problems.length > 0)!.problems[0];
      const [profile] = await db.profiles.toArray();
      const request = { strictness: 'meaning-gated', session_history: [] };
      await db.tutorSessions.put({ id: 'e2e-homework', profileId: profile.id, startedAt: now, strictness: 'meaning-gated', problemKind: 'word', targetText: problem, status: 'active' } as never);
      await db.tutorTurns.bulkPut([
        { id: 'e2e-h1', sessionId: 'e2e-homework', index: 1, mode: 'problem-in', sentAt: now, answeredAt: now, request: { ...request, mode: 'problem-in', target_text: problem }, attachments: [], status: 'answered' },
        {
          id: 'e2e-h2',
          sessionId: 'e2e-homework',
          index: 2,
          mode: 'math',
          sentAt: now,
          answeredAt: now,
          request: { ...request, mode: 'math', target_text: problem, child_answer: '1' },
          attachments: [],
          answer: { action: 'math_probe', focus_words: [], prompt_to_child: 'Look at what she starts with. What happens when she finds more?', layer_diagnosis: 'math' },
          status: 'answered',
        },
      ] as never);
      return problem;
    },
    { appPath: APP_PATH, picture: PICTURE },
  );
}

/** The right answer to the problem on the screen, from the maths graph (the node named above it, the item whose problem it is). */
async function rightAnswer(page: Page, nodeName: string, problem: string): Promise<string> {
  return page.evaluate(
    async ({ appPath, name, text }) => {
      const { MATHS_NODES } = (await import(/* @vite-ignore */ `${appPath}src/learn/maths/index.ts`)) as typeof import('../../src/learn/maths');
      for (const node of MATHS_NODES.filter((n) => n.name === name)) {
        for (let i = 0; i < 200; i++) {
          const item = node.item(i);
          if (item.problem === text) return item.answer;
        }
      }
      throw new Error(`no item of "${name}" has the problem "${text}"`);
    },
    { appPath: APP_PATH, name: nodeName, text: problem },
  );
}

type Form = 'type' | 'hear' | 'see' | 'do';

/** Which form the question on the screen is put in: what the screen holds for each. */
async function formOnScreen(page: Page): Promise<Form> {
  if ((await page.getByRole('button', { name: 'Hear it again' }).count()) > 0) return 'hear';
  if ((await page.getByTestId('answer-zone').count()) > 0) return 'do';
  if ((await page.locator('svg[role="img"]').count()) > 0) return 'see';
  return 'type';
}

test('the Maths world: placement, hear, see, do and a homework picture, at 390x844', async ({ page }) => {
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await noTapGuard(page);

  // --- A new child is welcomed, then Home; a picture for every concept and a homework problem are kept on the phone ---
  await page.goto(`${ORIGIN}${APP_PATH}`);
  await expect(page.getByRole('heading', { name: 'Welcome to SpellForge!' })).toBeVisible();
  await page.getByPlaceholder('Enter your name').fill('Rowan');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start Forging!' }).click();
  await expect(page.getByRole('heading', { name: 'Hey, Rowan!' })).toBeVisible();
  const homework = await seedPicturesAndHomework(page);
  await page.evaluate(() => localStorage.setItem('sf-tutor', '1'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hey, Rowan!' })).toBeVisible();

  // --- Placement: a problem and a way to answer it, with "Not sure" for a child who reads little; no picture yet ---
  expect(await tutorSaysGo(page, 'maths-home')).toBe(true);
  await expect(page.getByRole('heading', { name: 'Maths' })).toBeVisible();
  const placementLine = page.getByText(/Let's see what you know/);
  await expect(placementLine).toBeVisible();
  await expect(page.getByRole('button', { name: 'Not sure' })).toBeVisible();
  await expect(page.getByTestId('mnemonic-picture')).toHaveCount(0);
  await fitsThePhone(page);
  await shot(page, 'maths-world-placement');

  // --- The child answers every problem right, as each is put (typed, heard, seen or done with the tiles), until all four have been met ---
  const seen = new Set<Form>();
  let pictureBesideAProblem = false;
  for (let asked = 0; asked < QUESTION_LIMIT && !(seen.size === 4 && pictureBesideAProblem); asked++) {
    await expect(page.getByRole('button', { name: 'Check' })).toBeVisible();
    const form = await formOnScreen(page);
    const stage = (await placementLine.isVisible()) ? 'placement' : 'drill';
    const nodeName = (await page.locator('p.text-sf-muted.text-sm').last().innerText()).trim();
    const problem =
      form === 'see'
        ? ((await page.locator('svg[role="img"]').getAttribute('aria-label')) ?? '')
        : (await page.locator('p.text-2xl.font-bold').first().innerText()).trim();
    const answer = await rightAnswer(page, nodeName, problem);

    if (!seen.has(form)) {
      seen.add(form);
      await fitsThePhone(page);
      await shot(page, `maths-world-${form}`);
    }
    if (stage === 'placement') await expect(page.getByTestId('mnemonic-picture')).toHaveCount(0);
    else if (!pictureBesideAProblem) {
      const picture = page.getByTestId('mnemonic-picture');
      await expect(picture).toBeVisible();
      const box = await picture.boundingBox();
      expect(box && box.width).toBeGreaterThan(0);
      await fitsThePhone(page);
      await shot(page, `maths-world-picture-${form}`);
      pictureBesideAProblem = true;
    }

    if (form === 'do') for (const tile of answer.trim()) await page.getByRole('button', { name: tile, exact: true }).click();
    else await page.getByLabel('Your answer').fill(answer);
    await page.getByRole('button', { name: 'Check' }).click();
    await expect(page.getByRole('status')).toContainText(/Right!/);
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0);
    await expect(page.getByText('One moment...')).toHaveCount(0);
  }
  expect([...seen].sort()).toEqual(['do', 'hear', 'see', 'type']);
  expect(pictureBesideAProblem, 'a picture sat beside a problem after the placement').toBe(true);

  // --- A homework picture: the Tutor screen's maths turn shows its concept's picture beside the problem ---
  expect(await tutorSaysGo(page, 'tutor')).toBe(true);
  await expect(page.getByText(homework)).toBeVisible();
  const homeworkPicture = page.getByTestId('mnemonic-picture');
  await expect(homeworkPicture).toBeVisible();
  await fitsThePhone(page);
  await shot(page, 'maths-world-homework');

  expect(pageErrors, `page-level errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

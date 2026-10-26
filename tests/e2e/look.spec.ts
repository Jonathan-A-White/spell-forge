// tests/e2e/look.spec.ts: the Kestrel look at a phone's 390x844, in a real browser (Chromium), on the built app (the config's preview).
// Part 1 (mw-79en7t.78, look C): the Grown-ups screens (Who is learning, the Grown-ups home behind its PIN, its How is it going? and
// Licence sections) each take a shot, pass axe and sit inside the window with nothing to scroll sideways; and the Shell has set the
// look (data-sf-age, here 'unknown': the tutor has learned no age of the new child) with the look's tokens on the document.
//
// Part 2 (mw-79en7t.79, look D): the children's worlds charming at phone width. For a 7-year-old and a 13-year-old (the age the tutor has
// learned, so data-sf-age is 'young' and 'teen'), the front door (its bubbles and hold bar take the age), Spelling, Maths and the
// Grown-ups home each take a shot (8 in all: shots/look-<world>-age<N>.png), pass axe, and have every element's rect inside the window.
// The drill cards enter with the motion tokens, and a run with reduced motion finds no transition or animation longer than the reduced token.
//
// Run: npx playwright test look (the chromium project; it builds the app and serves it on this worktree's own port).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { emptyProfile, learn } from 'learn-kit/learner';
import { DURATION, EASING } from '../../src/look';
import { shot } from './shot';
import { noTapGuard } from './tap-guard';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const PIN = '2468';
const pin = async (page: Page, digits: string): Promise<void> => {
  for (const digit of digits) await page.getByRole('button', { name: digit, exact: true }).click();
};

/** The screen fits the window, has no axe violation, and is kept as a shot. */
async function looksRight(page: Page, name: string): Promise<void> {
  // what is arriving has arrived (a card half faded in has half its contrast); a loop that never ends is left to run
  await page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity || a.playState !== 'running'));
  const widths = await page.evaluate(() => ({ window: window.innerWidth, page: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(widths.window).toBe(390);
  expect(widths.page).toBeLessThanOrEqual(widths.window);
  expect(widths.body).toBeLessThanOrEqual(widths.window);
  // the scroll box is the one thing that scrolls, and only down
  const box = await page.evaluate(() => {
    const scroll = document.querySelector('[data-scroll-box]')!;
    return { scrollWidth: scroll.scrollWidth, clientWidth: scroll.clientWidth };
  });
  expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), `axe on ${name}`).toEqual([]);
  await shot(page, name);
}

test('part 1: the Grown-ups screens at 390x844 pass axe and fit the phone', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await noTapGuard(page);

  await page.goto('/spell-forge/');
  await page.getByPlaceholder('Enter your name').fill('Rowan');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start Forging!' }).click();
  await expect(page.getByRole('heading', { name: 'Hey, Rowan!' })).toBeVisible();

  // the Shell has set the look: no age is known of a new child
  await expect(page.locator('[data-shell]')).toHaveAttribute('data-sf-age', 'unknown');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sf-radius-card').trim())).not.toBe('');

  // --- Who is learning ---
  await page.getByRole('button', { name: 'Profiles' }).click();
  await expect(page.getByRole('heading', { name: 'Who is learning?' })).toBeVisible();
  await looksRight(page, 'look-who-is-learning');
  await page.getByRole('button', { name: /^Rowan/ }).click();
  await expect(page.getByRole('heading', { name: 'Hey, Rowan!' })).toBeVisible();

  // --- the Grown-ups home: the PIN is chosen the first time; How is it going? and Licence are sections of it ---
  await page.evaluate(() => localStorage.setItem('sf-tutor', '1'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hey, Rowan!' })).toBeVisible();
  await page.getByRole('button', { name: /^Tutor/ }).click();
  await page.getByRole('button', { name: 'Grown-ups' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a 4-digit PIN' })).toBeVisible();
  await pin(page, PIN);
  await pin(page, PIN);
  await page.getByLabel('Your answer').fill('pasta');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Grown-ups', exact: true })).toBeVisible();
  await expect(page.getByTestId('first-line').first()).toBeVisible();
  await looksRight(page, 'look-grown-ups-home');

  const howIsItGoing = page.getByRole('heading', { name: 'How is it going?' });
  await howIsItGoing.scrollIntoViewIfNeeded();
  await expect(howIsItGoing).toBeVisible();
  await looksRight(page, 'look-how-is-it-going');

  const licence = page.getByRole('region', { name: 'Licence' });
  await licence.scrollIntoViewIfNeeded();
  await expect(licence.getByRole('button', { name: 'Buy' })).toBeVisible();
  await looksRight(page, 'look-licence');

  expect(pageErrors, `page-level errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
});

// ─── Part 2: the children's worlds, age by age ────────────────────────────────────────────────────────────────────────────────────────

const REM = 16;

/** Every element of the app sits inside the window's width, by its own rect (scrollWidth hides what a clipped box swallows). */
async function everyRectInside(page: Page, name: string): Promise<void> {
  const outside = await page.evaluate(() => {
    const width = window.innerWidth;
    const found: string[] = [];
    for (const el of document.querySelectorAll('[data-shell] *')) {
      if (el.closest('.sf-scene')) continue; // the scene is fixed behind the shell and as wide as the window
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.left < -0.5 || rect.right > width + 0.5) {
        found.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} ${Math.round(rect.left)}..${Math.round(rect.right)}`);
      }
    }
    return found;
  });
  expect(outside, `elements outside the 390px window on ${name}`).toEqual([]);
}

/** The Shell's `go`, taken from its context provider (the tutor's "go" answer), as worlds.spec.ts does: true when the screen opened. */
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

/** The tutor has learned the child's age: it is put in the profile the phone keeps, as the front door's talk would. */
async function theTutorKnowsTheAge(page: Page, age: number): Promise<void> {
  const learner = learn(emptyProfile(), { field: 'age', value: age, turn: 't1', when: 1 }).profile;
  await page.evaluate(async (known) => {
    const opening = indexedDB.open('SpellForgeDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    const tx = db.transaction('profiles', 'readwrite');
    const store = tx.objectStore('profiles');
    const all = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    for (const profile of all) store.put({ ...profile, learner: known });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, learner);
}

/** A new child, Rowan, welcomed; the tutor knows their age and the Tutor (preview) is on, so the app opens on the front door. */
async function aChildOfAge(page: Page, age: number): Promise<void> {
  await noTapGuard(page);
  await page.goto('/spell-forge/');
  await page.getByPlaceholder('Enter your name').fill('Rowan');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start Forging!' }).click();
  await expect(page.getByRole('heading', { name: 'Hey, Rowan!' })).toBeVisible();
  await theTutorKnowsTheAge(page, age);
  await page.evaluate(() => localStorage.setItem('sf-tutor', '1'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hey, Rowan!' })).toBeVisible();
}

const px = (value: string): number => Number.parseFloat(value);

for (const [age, look] of [[7, 'young'], [13, 'teen']] as const) {
  test(`part 2: the children's worlds at 390x844 for a ${age}-year-old (${look})`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await aChildOfAge(page, age);
    await expect(page.locator('[data-shell]')).toHaveAttribute('data-sf-age', look);

    // --- the front door: the tutor's bubble and the hold bar wear the age ---
    expect(await tutorSaysGo(page, 'door')).toBe(true);
    const bubble = page.locator('.sf-bubble').first();
    await expect(bubble).toBeVisible();
    const hold = page.locator('.bk-composer__bar');
    await expect(hold).toBeVisible();
    const bubbleRadius = px(await bubble.evaluate((el) => getComputedStyle(el).borderTopLeftRadius));
    const barHeight = (await hold.boundingBox())!.height;
    const barRadius = px(await hold.evaluate((el) => getComputedStyle(el).borderTopLeftRadius));
    if (look === 'young') {
      expect(bubbleRadius).toBeGreaterThanOrEqual(1.75 * REM);
      expect(barHeight).toBeGreaterThanOrEqual(7 * REM - 1);
      expect(barRadius).toBeGreaterThanOrEqual(2.5 * REM);
    } else {
      expect(bubbleRadius).toBeLessThanOrEqual(1 * REM);
      expect(barHeight).toBeLessThanOrEqual(5 * REM + 1);
      expect(barRadius).toBeLessThanOrEqual(1.25 * REM);
    }
    await looksRight(page, `look-door-age${age}`);
    await everyRectInside(page, `the door at ${age}`);

    // --- Spelling: the placement's turn is a card that enters with the motion tokens ---
    expect(await tutorSaysGo(page, 'spelling-home')).toBe(true);
    await expect(page.getByRole('heading', { name: 'Spelling' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hear the word' })).toBeVisible();
    await expect(page.locator('.sf-turn')).toBeVisible();
    const entering = await page.locator('.sf-turn').evaluate((el) => {
      const style = getComputedStyle(el);
      return { name: style.animationName, duration: style.animationDuration, timing: style.animationTimingFunction };
    });
    expect(entering.name).not.toBe('none');
    expect(px(entering.duration) * 1000).toBeCloseTo(DURATION.base, 3);
    expect(entering.timing).toBe(EASING.out);
    await looksRight(page, `look-spelling-age${age}`);
    await everyRectInside(page, `Spelling at ${age}`);

    // --- Maths: the first question is a card too ---
    expect(await tutorSaysGo(page, 'maths-home')).toBe(true);
    await expect(page.getByRole('heading', { name: 'Maths' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Not sure' })).toBeVisible();
    await expect(page.locator('.sf-turn')).toBeVisible();
    await looksRight(page, `look-maths-age${age}`);
    await everyRectInside(page, `Maths at ${age}`);

    // --- Grown-ups: the home behind its PIN ---
    expect(await tutorSaysGo(page, 'home')).toBe(true);
    await page.getByRole('button', { name: /^Tutor/ }).click();
    await page.getByRole('button', { name: 'Grown-ups' }).click();
    await expect(page.getByRole('heading', { name: 'Choose a 4-digit PIN' })).toBeVisible();
    await pin(page, PIN);
    await pin(page, PIN);
    await page.getByLabel('Your answer').fill('pasta');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'Grown-ups', exact: true })).toBeVisible();
    await expect(page.getByTestId('first-line').first()).toBeVisible();
    await looksRight(page, `look-grown-ups-age${age}`);
    await everyRectInside(page, `the Grown-ups home at ${age}`);

    expect(pageErrors, `page-level errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
  });
}

test('part 2: with reduced motion no transition or animation is longer than the reduced token', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await aChildOfAge(page, 7);

  /** The longest transition or animation duration, in ms, of any element (and its ::before and ::after) on the page now. */
  const longest = (): Promise<{ ms: number; where: string }> =>
    page.evaluate(() => {
      const seconds = (list: string): number[] => list.split(',').map((one) => (one.trim().endsWith('ms') ? parseFloat(one) / 1000 : parseFloat(one)));
      let worst = { ms: 0, where: '' };
      for (const el of document.querySelectorAll('*')) {
        for (const pseudo of [null, '::before', '::after']) {
          const style = getComputedStyle(el, pseudo);
          for (const value of [style.transitionDuration, style.animationDuration]) {
            for (const s of seconds(value || '0s')) {
              if (s * 1000 > worst.ms) worst = { ms: s * 1000, where: `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}${pseudo ?? ''}` };
            }
          }
        }
      }
      return worst;
    });

  for (const [id, ready] of [
    ['door', () => page.locator('.sf-bubble').first().waitFor()],
    ['spelling-home', () => page.locator('.sf-turn').waitFor()],
    ['maths-home', () => page.locator('.sf-turn').waitFor()],
    ['home', () => page.getByRole('heading', { name: 'Hey, Rowan!' }).waitFor()],
  ] as const) {
    expect(await tutorSaysGo(page, id)).toBe(true);
    await ready();
    const worst = await longest();
    expect(worst.ms, `${id}: ${worst.where}`).toBeLessThanOrEqual(DURATION.reduced);
  }
});

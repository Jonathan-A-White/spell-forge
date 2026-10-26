// tests/e2e/front-door-scene.spec.ts: the front door's scene (Kestrel look B, mw-79en7t.77) at a phone's 390x844, in a real browser
// (Chromium), against the BUILT app (the one server playwright.config.ts builds and serves).
// covers: the door's backdrop paints under the PROVISIONAL first-paint budget (1500 ms) on a real clock; the WebGL scene is a lazy chunk
// fetched only when it may be drawn; reduced motion gets the still fallback and never fetches it; the scene never takes a tap.
//
// The time is the page's own: performance's first-contentful-paint, and the 'sf-scene-painted' mark the scene (or its fallback) sets when
// it first shows (src/look/scene/clock.ts), both measured from the reload that opens the app on the door.
//
// Run: npx playwright test front-door-scene --project=chromium
import { expect, test, type Page } from '@playwright/test';
import { speechInitScript } from 'voice-kit/testing/speech';
import { shot } from './shot';
import { noTapGuard } from './tap-guard';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const APP_PATH = '/spell-forge/';
/** PROVISIONAL (the Fable plan for mw-79en7t.21): the door's backdrop shows within this of the page opening. */
const FIRST_PAINT_BUDGET_MS = 1500;
const SCENE_CHUNK = /\/assets\/FrontDoorScene-[\w-]+\.js$/;

interface Paint {
  firstContentfulPaint: number | null;
  scenePainted: number | null;
  sceneChunks: string[];
  preloaded: string[];
}

const paint = (page: Page): Promise<Paint> =>
  page.evaluate(() => ({
    firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
    scenePainted: performance.getEntriesByName('sf-scene-painted')[0]?.startTime ?? null,
    sceneChunks: performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.includes('FrontDoorScene')),
    preloaded: [...document.querySelectorAll('link[rel="modulepreload"], script[src]')].map((el) => el.getAttribute('href') ?? el.getAttribute('src') ?? ''),
  }));

/** A phone that has never held SpellForge, the Tutor on: it is set up once (a child called Rowan), then opened again on the door. */
async function openOnTheDoor(page: Page): Promise<void> {
  await noTapGuard(page);
  await page.addInitScript(() => localStorage.setItem('sf-tutor', '1'));
  await page.addInitScript(speechInitScript({ msPerWord: 5, baseMs: 5, voicesDelayMs: 5 }));
  // nothing here talks to the factory
  await page.route('https://postern.allmymind.org/**', (route) => route.abort('internetdisconnected'));
  await page.goto(APP_PATH);
  await expect(page.getByText('Welcome to SpellForge!')).toBeVisible();
  await page.getByPlaceholder('Enter your name').fill('Rowan');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start Forging!' }).click();
  await expect(page.getByText('Hello! I am your tutor.')).toBeVisible();
  // the reopen is what is timed: the app lands on the door again
  await page.reload();
  await expect(page.getByText('Hello! I am your tutor.')).toBeVisible();
}

/** The Home button is what a tap at its middle lands on: the scene behind is never in the way. */
async function homeTakesTheTap(page: Page): Promise<void> {
  const home = page.getByRole('button', { name: 'Home', exact: true });
  await expect(home).toBeVisible();
  const box = (await home.boundingBox())!;
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.textContent?.trim() ?? null, {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  });
  expect(hit).toBe('Home');
}

async function fitsThePhone(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({ window: window.innerWidth, page: document.documentElement.scrollWidth }));
  expect(widths.window).toBe(390);
  expect(widths.page).toBeLessThanOrEqual(widths.window);
}

test('the door opens over its WebGL scene, a lazy chunk, painted under the budget, at 390x844', async ({ page }) => {
  await openOnTheDoor(page);

  // the live scene is drawn: its canvas has had a frame, and fills the screen behind the door
  const canvas = page.getByTestId('scene-canvas');
  await expect(canvas).toHaveAttribute('data-drawn', '');
  for (const layer of [page.getByTestId('scene-live'), canvas]) {
    const box = (await layer.boundingBox())!;
    expect(box, 'the scene fills the screen').toEqual({ x: 0, y: 0, width: 390, height: 844 });
  }
  await expect(page.getByTestId('scene-fallback')).toHaveCount(0);

  const timing = await paint(page);
  // the scene is its own chunk, fetched after the page, not preloaded with it
  expect(timing.sceneChunks).toHaveLength(1);
  expect(timing.sceneChunks[0]).toMatch(SCENE_CHUNK);
  expect(timing.preloaded.some((href) => href.includes('FrontDoorScene'))).toBe(false);
  // first paint under the budget
  expect(timing.firstContentfulPaint).not.toBeNull();
  expect(timing.firstContentfulPaint!).toBeLessThan(FIRST_PAINT_BUDGET_MS);
  expect(timing.scenePainted).not.toBeNull();
  expect(timing.scenePainted!).toBeLessThan(FIRST_PAINT_BUDGET_MS);
  test.info().annotations.push({
    type: 'first paint',
    description: `first-contentful-paint ${Math.round(timing.firstContentfulPaint!)} ms, scene ${Math.round(timing.scenePainted!)} ms`,
  });

  await homeTakesTheTap(page);
  await fitsThePhone(page);
  await shot(page, 'front-door-scene');

  // hidden, it draws no more: the page's frames stop (the clock's own test is tests/unit/scene-fallback.test.tsx)
  const hidden = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
        let asked = 0;
        const real = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (callback) => {
          asked += 1;
          return real(callback);
        };
        setTimeout(() => resolve(asked), 300);
      }),
  );
  expect(hidden).toBe(0);
});

test('with reduced motion the door shows the still fallback and never fetches the scene, at 390x844', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openOnTheDoor(page);

  await expect(page.getByTestId('scene-fallback')).toBeVisible();
  await expect(page.getByTestId('scene-canvas')).toHaveCount(0);
  expect(await page.locator('canvas').count()).toBe(0);
  const timing = await paint(page);
  expect(timing.sceneChunks).toEqual([]);
  expect(timing.scenePainted).not.toBeNull();
  expect(timing.scenePainted!).toBeLessThan(FIRST_PAINT_BUDGET_MS);

  await homeTakesTheTap(page);
  await fitsThePhone(page);
  await shot(page, 'front-door-scene-still');
});

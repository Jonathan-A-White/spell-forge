// tests/e2e/look.spec.ts: the Kestrel look at a phone's 390x844, in a real browser (Chromium), on the built app (the config's preview).
// Part 1 (mw-79en7t.78, look C): the Grown-ups screens (Who is learning, the Grown-ups home behind its PIN, its How is it going? and
// Licence sections) each take a shot, pass axe and sit inside the window with nothing to scroll sideways; and the Shell has set the
// look (data-sf-age, here 'unknown': the tutor has learned no age of the new child) with the look's tokens on the document.
//
// Run: npx playwright test look (the chromium project; it builds the app and serves it on this worktree's own port).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { shot } from './shot';
import { noTapGuard } from './tap-guard';

test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

const PIN = '2468';
const pin = async (page: Page, digits: string): Promise<void> => {
  for (const digit of digits) await page.getByRole('button', { name: digit, exact: true }).click();
};

/** The screen fits the window, has no axe violation, and is kept as a shot. */
async function looksRight(page: Page, name: string): Promise<void> {
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

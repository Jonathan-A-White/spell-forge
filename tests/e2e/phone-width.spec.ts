// tests/e2e/phone-width.spec.ts: jsdom has no layout, so a layout claim is proven in a real browser at a phone's width. A new phone, opened for the
// first time on the built app (`vite preview` of dist/), shows its first screen inside 390x844 with nothing to scroll sideways.
// Run: npx playwright test --project=phone (it builds the app and serves it on this worktree's own port, tests/support/preview-port.ts).
import { expect, test } from '@playwright/test';
import { shot } from './shot';
import { noTapGuard } from './tap-guard';

// The spec sets its own viewport, so it passes in any project.
test.use({ viewport: { width: 390, height: 844 } });

test('the first screen fits a 390x844 phone with no horizontal scroll', async ({ page }) => {
  await noTapGuard(page);
  await page.goto('/spell-forge/');
  await expect(page.getByRole('heading', { name: 'Welcome to SpellForge!' })).toBeVisible();

  const widths = await page.evaluate(() => ({
    window: window.innerWidth,
    page: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(widths.window).toBe(390);
  expect(widths.page).toBeLessThanOrEqual(widths.window);
  expect(widths.body).toBeLessThanOrEqual(widths.window);

  // The name field a new child types into sits fully inside the window.
  const field = await page.getByPlaceholder('Enter your name').boundingBox();
  expect(field).not.toBeNull();
  expect(field!.x).toBeGreaterThanOrEqual(0);
  expect(field!.x + field!.width).toBeLessThanOrEqual(widths.window);

  await shot(page, 'first-screen');
});

test('a button is native-feel and the hover washes on Home let a tap through (mw-79en7t.76)', async ({ page }) => {
  await noTapGuard(page);
  await page.goto('/spell-forge/');
  await expect(page.getByRole('heading', { name: 'Welcome to SpellForge!' })).toBeVisible();

  // topic 08: no 300 ms tap delay, no grey flash, no selected label on a control.
  const next = await page.getByRole('button', { name: 'Next' }).evaluate((button) => {
    const style = getComputedStyle(button);
    return { touchAction: style.touchAction, userSelect: style.userSelect, highlight: style.getPropertyValue('-webkit-tap-highlight-color') };
  });
  expect(next.touchAction).toBe('manipulation');
  expect(next.userSelect).toBe('none');
  expect(next.highlight).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);

  await page.getByPlaceholder('Enter your name').fill('Rowan');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Start Forging!' }).click();
  await expect(page.getByRole('heading', { name: 'Hey, Rowan!' })).toBeVisible();

  // Home's cards each hold a hover wash over the whole card; none of them takes the pointer, and a tap on the middle of one lands on its card.
  const washes = page.locator('[class*="group-hover:opacity-100"]');
  expect(await washes.count()).toBeGreaterThan(0);
  for (const pointerEvents of await washes.evaluateAll((layers) => layers.map((layer) => getComputedStyle(layer).pointerEvents))) {
    expect(pointerEvents).toBe('none');
  }
  const box = await page.getByRole('button', { name: /My Words/ }).boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByRole('heading', { name: 'Word Lists' })).toBeVisible();
  await shot(page, 'native-feel-home-tap');
});

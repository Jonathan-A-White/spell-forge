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

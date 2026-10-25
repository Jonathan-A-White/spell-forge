// The tap guard swallows a tap for 300 ms after a screen change (src/shell/tap-guard.ts); a spec taps faster than a child, so it sets the
// guard's own test seam (localStorage 'sf-tap-guard-ms') to 0 before the app loads. Every spec calls this before its first goto.
import type { Page } from '@playwright/test';

export async function noTapGuard(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('sf-tap-guard-ms', '0'));
}

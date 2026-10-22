// tests/e2e/shot.ts: one full-page screenshot at the end of a layout spec, taken at whatever viewport the running Playwright project sets
// (the 'phone' project: 390x844), written to shots/<name>.png.
import type { Page } from '@playwright/test';

export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `shots/${name}.png`, fullPage: true });
}

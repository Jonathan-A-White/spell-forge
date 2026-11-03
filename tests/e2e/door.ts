// The app opens on the tutor's front door for everyone (mw-79en7t.82), so a spec that wants Home taps the door's own Home button first.
// Call it right after "Start Forging!" (or after a reopen that lands on the door).
import { expect, type Page } from '@playwright/test';

export async function leaveTheDoor(page: Page): Promise<void> {
  await expect(page.getByText('Hello! I am your tutor.')).toBeVisible();
  await page.getByRole('button', { name: 'Home' }).click();
}

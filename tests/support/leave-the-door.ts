// The app opens on the tutor's front door for everyone (mw-79en7t.82), so a test of Home taps the door's Home button first.
import { expect } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

export async function leaveTheDoor(): Promise<void> {
  await screen.findByText(/Hello! I am your tutor/);
  fireEvent.click(screen.getByRole('button', { name: 'Home' }));
}

/** The same where the licence may be known to be missing, which lands on Home and not on the door. */
export async function leaveTheDoorIfShown(): Promise<void> {
  await waitFor(() => expect(screen.queryByText(/Hello! I am your tutor/) ?? screen.queryByRole('heading', { name: /^Hey, / })).not.toBeNull());
  if (screen.queryByText(/Hello! I am your tutor/)) await leaveTheDoor();
}

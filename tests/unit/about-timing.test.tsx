// mw-79en7t.51 (Kestrel 17c, M28): About, under Grown-ups, opens with one short line and shows how long the tutor's
// last answer took (in ms) beside the version.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { TutorTurn } from '../../src/contracts/types';
import { db } from '../../src/data/db';
import { AboutScreen } from '../../src/features/about';
import { APP_VERSION } from '../../src/version';
import { viewWorld } from '../../src/shell/worlds';

const T0 = Date.parse('2026-10-25T09:00:00Z');

function turn(id: string, over: Partial<TutorTurn>): TutorTurn {
  return {
    id,
    sessionId: 's1',
    index: 1,
    mode: 'problem-in',
    sentAt: new Date(T0),
    request: { mode: 'problem-in', strictness: 'meaning-gated', session_history: [] },
    attachments: [],
    status: 'answered',
    txid: `direct:${id}`,
    ...over,
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(cleanup);

describe('About, under Grown-ups', () => {
  it('is a Grown-ups screen', () => {
    expect(viewWorld('about')).toBe('grown-ups');
  });

  it('opens with one plain line under 100 characters, the first paragraph on the screen', async () => {
    render(<AboutScreen onBack={() => undefined} />);
    const line = await screen.findByTestId('first-line');
    const text = (line.textContent ?? '').trim();
    expect(text.length).toBeGreaterThan(10);
    expect(text.length).toBeLessThan(100);
    expect(text).toMatch(/[.!?]$/);
    expect(document.querySelector('p')).toBe(line);
  });

  it("shows the last tutor answer's time in ms beside the version", async () => {
    await db.tutorTurns.bulkAdd([
      turn('old', { sentAt: new Date(T0), answeredAt: new Date(T0 + 9000) }),
      turn('new', { index: 2, sentAt: new Date(T0 + 60_000), answeredAt: new Date(T0 + 60_000 + 1840) }),
    ]);
    render(<AboutScreen onBack={() => undefined} />);
    const timing = await screen.findByText(/Last tutor answer: 1840 ms/);
    const version = screen.getByText(`SpellForge v${APP_VERSION}`);
    expect(timing.closest('section')).toBe(version.closest('section'));
  });

  it('does not count the child\'s own correction (no mill), a failed turn or a turn still out', async () => {
    await db.tutorTurns.bulkAdd([
      turn('real', { sentAt: new Date(T0), answeredAt: new Date(T0 + 2500) }),
      turn('fix', { index: 2, txid: undefined, sentAt: new Date(T0 + 10_000), answeredAt: new Date(T0 + 10_000) }),
      turn('bad', { index: 3, status: 'failed', sentAt: new Date(T0 + 20_000), answeredAt: new Date(T0 + 29_000) }),
      turn('out', { index: 4, status: 'waiting', answeredAt: undefined, sentAt: new Date(T0 + 30_000) }),
    ]);
    render(<AboutScreen onBack={() => undefined} />);
    expect(await screen.findByText(/Last tutor answer: 2500 ms/)).toBeTruthy();
  });

  it('says so, plainly, when the tutor has not answered yet', async () => {
    render(<AboutScreen onBack={() => undefined} />);
    const version = screen.getByText(`SpellForge v${APP_VERSION}`);
    expect(await within(version.closest('section')!).findByText(/No tutor answer yet/)).toBeTruthy();
  });
});

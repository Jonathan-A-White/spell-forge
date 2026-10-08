// mw-kuy7rx.3: the Grown-ups screen's 'This week' summary and the Sessions as plain lines.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { db } from '../../src/data/db';
import { sessionLine, sessionLines, weekSummary } from '../../src/features/tutor/parent-sessions';
import { ParentSessions, ParentThisWeek } from '../../src/features/tutor/parent-sessions-view';
import { ParentScreen } from '../../src/features/tutor/parent-screen';
import { NOW, mathFound, old, readRight, session, stopped, turn } from '../fixtures/parent-sessions';

const all = [readRight, mathFound, stopped, old];

async function seed(rows = all) {
  await db.delete();
  await db.open();
  for (const r of rows) {
    await db.tutorSessions.add(r.session);
    await db.tutorTurns.bulkAdd(r.turns);
  }
}

describe('weekSummary', () => {
  it('counts sessions, minutes and problems of the last seven days, and names the words he misread most', () => {
    const summary = weekSummary(all, NOW);
    expect(summary).toBe('This week he had 3 sessions, 35 minutes, and tried 3 problems. The words he misread most: chapter, fiend.');
  });

  it('says so plainly when there is nothing this week', () => {
    expect(weekSummary([old], NOW)).toBe('No sessions this week yet.');
    expect(weekSummary([], NOW)).toBe('No sessions this week yet.');
  });

  it('leaves out the words when he misread none', () => {
    const clean = { session: mathFound.session, turns: mathFound.turns };
    expect(weekSummary([clean], NOW)).toBe('This week he had 1 session, 10 minutes, and tried 1 problem.');
  });

  it('counts a session still going up to its last turn', () => {
    const going = { session: session('g', '2025-10-08T10:00:00Z', { status: 'active', targetText: 'Going' }), turns: [turn('g', 1, 'math', '2025-10-08T10:07:00Z', { action: 'continue' })] };
    expect(weekSummary([going], NOW)).toContain('7 minutes');
  });

  it('uses one engine per turn, so a word is not counted twice', () => {
    expect(weekSummary([stopped], NOW)).toContain('The words he misread most: chapter.');
  });
});

describe('sessionLine', () => {
  it('reads: the date, the problem\'s first words, read it right on the 2nd try', () => {
    expect(sessionLine(readRight.session, readRight.turns)).toEqual({
      sessionId: 's1',
      date: 'Tue 7 Oct',
      what: 'The fiend read the chapter aloud to…',
      how: 'read it right on the 2nd try',
    });
  });

  it('a maths problem whose answer was found', () => {
    const line = sessionLine(mathFound.session, mathFound.turns);
    expect(line).toMatchObject({ date: 'Mon 6 Oct', what: 'What is 12 times 4?', how: 'answer found' });
  });

  it('a session that ended without either: stopped early', () => {
    expect(sessionLine(stopped.session, stopped.turns).how).toBe('stopped early');
  });

  it('a session still open: still going; no problem yet', () => {
    const line = sessionLine(session('a', '2025-10-08T09:00:00Z', { status: 'active' }), []);
    expect(line).toMatchObject({ how: 'still going', what: 'No problem yet' });
  });

  it('a stale answer does not count as the problem solved', () => {
    const turns = [turn('s', 1, 'reading', '2025-10-07T09:00:00Z', { action: 'done', status: 'stale' })];
    expect(sessionLine(session('s', '2025-10-07T09:00:00Z'), turns).how).toBe('stopped early');
  });

  it('counts the first reading as the 1st try, and 3rd, 11th and 22nd read right', () => {
    const tries = (n: number) => {
      const turns = Array.from({ length: n }, (_, i) =>
        turn('s', i + 1, 'reading', '2025-10-07T09:00:00Z', { action: i + 1 === n ? 'done' : 'reread_word' }),
      );
      return sessionLine(session('s', '2025-10-07T09:00:00Z'), turns).how;
    };
    expect(tries(1)).toBe('read it right on the 1st try');
    expect(tries(3)).toBe('read it right on the 3rd try');
    expect(tries(11)).toBe('read it right on the 11th try');
    expect(tries(22)).toBe('read it right on the 22nd try');
  });

  it('lists newest first', () => {
    expect(sessionLines([old, stopped, readRight, mathFound]).map((l) => l.sessionId)).toEqual(['s1', 's2', 's3', 's4']);
  });
});

describe('the Grown-ups screen\'s This week and Sessions', () => {
  beforeEach(async () => {
    await seed();
    vi.useRealTimers();
  });

  it('This week shows the summary built from Dexie', async () => {
    render(<ParentThisWeek profileId="p1" now={NOW} />);
    expect(await screen.findByText(/This week he had 3 sessions, 35 minutes, and tried 3 problems/)).toBeTruthy();
    expect(screen.getByText(/The words he misread most: chapter, fiend\./)).toBeTruthy();
  });

  it('Sessions shows one plain line each, newest first, and a tap opens the session', async () => {
    const onOpen = vi.fn();
    const { container } = render(<ParentSessions profileId="p1" onOpen={onOpen} />);
    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(within(items[0]).getByText('Tue 7 Oct')).toBeTruthy();
    expect(within(items[0]).getByText('The fiend read the chapter aloud to…')).toBeTruthy();
    expect(within(items[0]).getByText('read it right on the 2nd try')).toBeTruthy();
    expect(within(items[1]).getByText('answer found')).toBeTruthy();
    expect(within(items[2]).getByText('stopped early')).toBeTruthy();
    expect(container.textContent).not.toMatch(/Mode|Turn/);
    fireEvent.click(within(items[1]).getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith('s2');
  });

  it('only the profile\'s own sessions are listed', async () => {
    await db.tutorSessions.add(session('other', '2025-10-07T09:00:00Z', { profileId: 'p2', targetText: 'Not his' }));
    render(<ParentSessions profileId="p1" onOpen={() => undefined} />);
    await screen.findAllByRole('listitem');
    expect(screen.queryByText('Not his')).toBeNull();
  });

  it('says so when there are no sessions', async () => {
    await seed([]);
    render(<ParentSessions profileId="p1" onOpen={() => undefined} />);
    expect(await screen.findByText('No sessions yet.')).toBeTruthy();
  });

  it('the Grown-ups screen has both sections, with no Mode or Turn text', async () => {
    const { container } = render(<ParentScreen profileId="p1" onBack={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'This week' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sessions' })).toBeTruthy();
    await screen.findAllByRole('listitem');
    expect(container.textContent).not.toMatch(/Mode|Turn/);
  });
});

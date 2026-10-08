// mw-kuy7rx.4: a session's page on the Grown-ups screen: its turns in plain words, 'Notes for you', and the raw
// record behind a 'Details' tap; the child's Tutor screen no longer has Sessions or Record views.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PrivateKey } from '@bsv/sdk';
import { db } from '../../src/data/db';
import { tutorRepo } from '../../src/data/repositories';
import type { Profile, TutorTurn } from '../../src/contracts';
import { ParentScreen, TutorScreen } from '../../src/features/tutor';
import { plainTurn } from '../../src/features/tutor/parent-sessions';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { paulProfile } from '../fixtures/profiles';
import { MATH_PROBLEM, seedRecordedSession } from '../fixtures/tutor-math';
import { readRight, turn } from '../fixtures/parent-sessions';

const profile: Profile = { ...paulProfile, settings: { ...DEFAULT_SETTINGS } };

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});

async function openPage() {
  await db.profiles.put(profile);
  const seeded = await seedRecordedSession(profile.id);
  render(<ParentScreen profileId={profile.id} onBack={vi.fn()} />);
  const lines = await screen.findAllByRole('button', { name: new RegExp(MATH_PROBLEM.split(' ').slice(0, 3).join(' ')) });
  fireEvent.click(lines[0]);
  await screen.findByRole('heading', { name: 'Notes for you' });
  return seeded;
}

describe('a session line on the Grown-ups screen', () => {
  it('opens that session\'s page, and Back returns to the list', async () => {
    await openPage();
    expect(screen.queryByRole('heading', { name: 'This week' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Back to sessions/ }));
    expect(await screen.findByRole('heading', { name: 'This week' })).toBeTruthy();
  });
});

describe('the session page', () => {
  it('has the problem and the turns in plain words', async () => {
    await openPage();
    expect(screen.getByText(MATH_PROBLEM)).toBeTruthy();
    const turns = within(screen.getByRole('list', { name: 'What happened' })).getAllByRole('listitem');
    expect(turns).toHaveLength(5);
    expect(turns[0]).toHaveTextContent('The tutor read the problem.');
    expect(turns[1]).toHaveTextContent('He read it aloud. He misread: apples. The tutor said: "Try that word again."');
    expect(turns[2]).toHaveTextContent('He had moved on before this answer came.');
    expect(turns[4]).toHaveTextContent('He answered "8", with a photo of his work.');
  });

  it('puts what to look at, the way he did it, the notes and the recommendations under Notes for you', async () => {
    await openPage();
    const notes = within(screen.getByRole('region', { name: 'Notes for you' }));
    const look = within(notes.getByRole('group', { name: 'What to look at' }));
    expect(look.getByText('you took the apples away instead of putting them together')).toBeTruthy();
    expect(look.getByText('knowing that buying more means adding')).toBeTruthy();
    const how = within(notes.getByRole('group', { name: 'The way you did it' }));
    expect(how.getByText('counting on from the bigger number')).toBeTruthy();
    expect(notes.getByText('Reads short words well; long ones need chunking.')).toBeTruthy();
    expect(notes.getByText('Subtracts when the story says "buys more".')).toBeTruthy();
    expect(notes.getByText('Act the story out with real fruit')).toBeTruthy();
    expect(notes.getByText(/makes "more" something he can see/)).toBeTruthy();
    expect(notes.getByText(/at the kitchen table/)).toBeTruthy();
  });

  it('keeps the raw record hidden until Details is tapped, then shows it with Copy as JSON', async () => {
    const { session } = await openPage();
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy as JSON' })).toBeNull();
    expect(screen.queryByText(/"action": "math_probe"/)).toBeNull();

    const details = screen.getByRole('button', { name: 'Details' });
    expect(details).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(details);
    expect(details).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('article', { name: 'Turn 5' })).toBeTruthy();
    expect(screen.getByText(/"action": "math_probe"/)).toBeTruthy();

    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy as JSON' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const text = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(JSON.parse(text.slice('```json\n'.length, -'\n```'.length)).session.id).toBe(session.id);

    fireEvent.click(details);
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('says so when a session has no notes yet', async () => {
    await db.profiles.put(profile);
    const empty = await tutorRepo.createSession({ profileId: profile.id, strictness: 'precision', targetText: 'Quiet one' });
    render(<ParentScreen profileId={profile.id} onBack={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Quiet one/ }));
    const notes = within(await screen.findByRole('region', { name: 'Notes for you' }));
    expect(notes.getByText('Nothing to note for this session.')).toBeTruthy();
    expect(empty.id).toBeTruthy();
  });
});

describe('plainTurn', () => {
  const t = (extra: Partial<TutorTurn>): TutorTurn => ({ ...readRight.turns[1], ...extra });
  it('marks a failed, a refused and a waiting turn', () => {
    expect(plainTurn(t({ status: 'failed', failureReason: 'The reading did not get sent.', answer: undefined }))).toBe('This turn did not go through: The reading did not get sent.');
    expect(plainTurn(t({ status: 'refused', failureReason: undefined, answer: undefined }))).toBe('This turn did not go through: no reason given.');
    expect(plainTurn(t({ status: 'waiting', answer: undefined }))).toBe('Still waiting for the tutor.');
  });
  it('a reading with nothing misread and no prompt is just that he read', () => {
    expect(plainTurn(turn('s', 1, 'reading', '2025-10-07T09:00:00Z', { action: 'done' }))).toBe('He read it aloud. The tutor said: "Well done"');
  });
});

describe("the child's Tutor screen", () => {
  const deps = { getKey: async () => PrivateKey.fromRandom(), pollIntervalMs: 20 };

  it('has a Grown-ups button and no Sessions button', async () => {
    await db.profiles.put(profile);
    await seedRecordedSession(profile.id);
    render(<TutorScreen profile={profile} onBack={vi.fn()} deps={deps} />);
    expect(await screen.findByRole('button', { name: 'Grown-ups' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sessions' })).toBeNull();
  });

  it('has no Sessions button where a session has just stopped, either', async () => {
    await db.profiles.put(profile);
    const session = await tutorRepo.createSession({ profileId: profile.id, strictness: 'precision' });
    render(<TutorScreen profile={profile} onBack={vi.fn()} deps={deps} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Stop for now' }));
    expect(await screen.findByText('Stopped for now. Your work is kept.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start another' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sessions' })).toBeNull();
    expect(session.id).toBeTruthy();
  });
});

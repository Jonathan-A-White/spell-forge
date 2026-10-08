// mw-bhvxcn.10: the Session record screen: every turn's raw material and timing, from a fixture session with two
// scoring engines and one stale turn; 'Copy as JSON' for the whole session.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { db } from '../../src/data/db';
import { tutorRepo } from '../../src/data/repositories';
import type { Profile } from '../../src/contracts';
import { SessionRecord, sessionAsJson } from '../../src/features/tutor';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';
import { paulProfile } from '../fixtures/profiles';
import { MATH_PROBLEM, seedRecordedSession, T0 } from '../fixtures/tutor-math';

const profile: Profile = { ...paulProfile, settings: { ...DEFAULT_SETTINGS } };

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
});

const turnCard = async (n: number) => within(await screen.findByRole('article', { name: `Turn ${n}` }));

describe('the session record', () => {
  async function open() {
    await db.profiles.put(profile);
    const seeded = await seedRecordedSession(profile.id);
    render(<SessionRecord sessionId={seeded.session.id} />);
    return seeded;
  }

  it('shows each turn with its mode, when it was sent and answered, and the seconds between', async () => {
    await open();
    expect(await screen.findByRole('heading', { name: /Session/ })).toBeInTheDocument();
    expect(screen.getByText(MATH_PROBLEM, { selector: 'p' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(5);
    const expected: [number, string, string][] = [
      [1, 'problem-in', '3 seconds'],
      [2, 'reading', '12 seconds'],
      [3, 'reading', '30 seconds'],
      [4, 'reading', '5 seconds'],
      [5, 'math', '20 seconds'],
    ];
    for (const [n, mode, secs] of expected) {
      const card = await turnCard(n);
      expect(card.getByText(`Mode: ${mode}`)).toBeInTheDocument();
      expect(card.getByText(secs)).toBeInTheDocument();
      expect(card.getByText(/^Sent /)).toBeInTheDocument();
      expect(card.getByText(/^Answered /)).toBeInTheDocument();
    }
  });

  it("shows both engines' word tables on the reading turn: word, error, accuracy", async () => {
    await open();
    const card = await turnCard(2);
    const azure = card.getByRole('table', { name: 'azure' });
    const local = card.getByRole('table', { name: 'local' });
    for (const table of [azure, local]) {
      expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Word', 'Error', 'Accuracy']);
      expect(within(table).getAllByRole('row')).toHaveLength(3);
    }
    const azureRows = within(azure).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent));
    expect(azureRows).toEqual([['Anna', 'none', '98'], ['apples', 'mispronunciation', '52']]);
    const localRows = within(local).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent));
    expect(localRows).toEqual([['Anna', 'none', '98'], ['apples', 'mispronunciation', '61']]);
    expect(card.getByText('azure: accuracy 88, 4.2 s')).toBeInTheDocument();
  });

  it('marks the stale turn, and still shows what it answered', async () => {
    await open();
    const card = await turnCard(3);
    expect(card.getByText('Stale: he had moved on')).toBeInTheDocument();
    expect(card.getByText(/LATE ENCOURAGEMENT/)).toBeInTheDocument();
    expect((await turnCard(2)).queryByText(/^Stale/)).not.toBeInTheDocument();
  });

  it('marks a failed and a refused turn with the reason', async () => {
    await db.profiles.put(profile);
    const session = await tutorRepo.createSession({ profileId: profile.id, strictness: 'precision' });
    const a = await tutorRepo.addTurn({ sessionId: session.id, mode: 'reading', request: { mode: 'reading', strictness: 'precision', session_history: [] } });
    await tutorRepo.markFailed(a.id, 'The reading did not get sent.');
    const b = await tutorRepo.addTurn({ sessionId: session.id, mode: 'math', request: { mode: 'math', strictness: 'precision', session_history: [] } });
    await tutorRepo.markSent(b.id, { txid: 'x', seq: 1, mill: 'aa' });
    await tutorRepo.applyAnswer('x', { status: 'refused', reason: 'No licence.' });
    render(<SessionRecord sessionId={session.id} />);
    expect((await turnCard(1)).getByText('Failed: The reading did not get sent.')).toBeInTheDocument();
    expect((await turnCard(2)).getByText('Refused: No licence.')).toBeInTheDocument();
  });

  it('shows the request as sent, the photo as a thumbnail and the audio with a play button', async () => {
    await open();
    const math = await turnCard(5);
    expect(math.getByText(/"child_answer": "8"/)).toBeInTheDocument();
    expect(math.getByText('work-1.jpg')).toBeInTheDocument();
    const reading = await turnCard(2);
    expect(reading.getByRole('button', { name: 'Play reading-1.webm' })).toBeInTheDocument();
    // a thumbnail needs a blob URL; jsdom has none, so the name stands in and the img appears where URLs exist
    const create = vi.fn(() => 'blob:fake');
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    document.body.innerHTML = '';
    const seeded = await tutorRepo.listSessions(profile.id);
    render(<SessionRecord sessionId={seeded[0].id} />);
    const img = await within(await screen.findByRole('article', { name: 'Turn 5' })).findByRole('img', { name: 'work-1.jpg' });
    expect(img).toHaveAttribute('src', 'blob:fake');
  });

  it('shows the answer as the grist returned it', async () => {
    await open();
    const math = await turnCard(5);
    expect(math.getByText(/"action": "math_probe"/)).toBeInTheDocument();
    expect(math.getByText(/"where_wrong": "you took the apples away/)).toBeInTheDocument();
  });

  it('collects the notes and recommendations for the parent at the foot', async () => {
    await open();
    const foot = within(await screen.findByRole('region', { name: 'For the parent' }));
    expect(foot.getByText('Reads short words well; long ones need chunking.')).toBeInTheDocument();
    expect(foot.getByText('Subtracts when the story says "buys more".')).toBeInTheDocument();
    expect(foot.getByText('Act the story out with real fruit')).toBeInTheDocument();
    expect(foot.getByText(/makes "more" something he can see/)).toBeInTheDocument();
    expect(foot.getByText(/at the kitchen table/)).toBeInTheDocument();
  });

  it('has no way to delete anything', async () => {
    await open();
    await screen.findByRole('article', { name: 'Turn 1' });
    expect(screen.queryByRole('button', { name: /delete|remove|clear/i })).not.toBeInTheDocument();
  });
});

describe('Copy as JSON', () => {
  it('puts the whole session on the clipboard as one fenced json block', async () => {
    await db.profiles.put(profile);
    const { session } = await seedRecordedSession(profile.id);
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<SessionRecord sessionId={session.id} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy as JSON' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Copied')).toBeInTheDocument();

    const text = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(text.startsWith('```json\n')).toBe(true);
    expect(text.endsWith('\n```')).toBe(true);
    const parsed = JSON.parse(text.slice('```json\n'.length, -'\n```'.length));
    expect(parsed.session).toMatchObject({ id: session.id, strictness: 'meaning-gated', targetText: MATH_PROBLEM, startedAt: T0.toISOString() });
    expect(parsed.turns).toHaveLength(5);
    const [problem, r1, stale, , math] = parsed.turns;
    expect(problem.mode).toBe('problem-in');
    expect(r1.readingResult.azure.words[1]).toMatchObject({ text: 'apples', error: 'mispronunciation', accuracy: 52 });
    expect(r1.readingResult.local.engine).toBe('local');
    expect(r1.secondsBetween).toBe(12);
    expect(r1.attachments).toEqual([{ kind: 'audio', name: 'reading-1.webm', mime: 'audio/webm', bytes: 3 }]);
    expect(stale.status).toBe('stale');
    expect(stale.answer.prompt_to_child).toBe('LATE ENCOURAGEMENT');
    expect(math.request).toMatchObject({ child_answer: '8', work_photo: true });
    expect(math.attachments[0]).toMatchObject({ kind: 'work', name: 'work-1.jpg' });
    expect(math.answer.math_diagnosis.gap).toBe('knowing that buying more means adding');
    expect(parsed.parentNotes).toEqual(expect.arrayContaining(['Subtracts when the story says "buys more".']));
    expect(parsed.parentRecommendations[0]).toEqual({ what: 'Act the story out with real fruit', why: 'makes "more" something he can see', where: 'at the kitchen table' });
  });

  it('sessionAsJson is the same block without the screen', async () => {
    await db.profiles.put(profile);
    const { session } = await seedRecordedSession(profile.id);
    const text = await sessionAsJson(session.id);
    expect(text.startsWith('```json\n')).toBe(true);
  });

  it('shows the text to copy by hand when the clipboard is not there', async () => {
    await db.profiles.put(profile);
    const { session } = await seedRecordedSession(profile.id);
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => { throw new Error('denied'); }) } });
    render(<SessionRecord sessionId={session.id} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Copy as JSON' }));
    const box = (await screen.findByLabelText('Session as JSON')) as HTMLTextAreaElement;
    expect(box.value.startsWith('```json')).toBe(true);
  });
});

// mw-kuy7rx.11: 'Notes for the tutor' on the Grown-ups screen: standing notes kept per profile, sent as
// parent_notes on every tutor-turn request, and absent from it when there are none.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { PrivateKey } from '@bsv/sdk';
import { db } from '../../src/data/db';
import { profileRepo, tutorRepo } from '../../src/data/repositories';
import { ParentScreen } from '../../src/features/tutor/parent-screen';
import { sendMath, sendProblem, sendReading } from '../../src/features/tutor';
import type { TutorDeps } from '../../src/features/tutor';
import type { SendGristParams } from '../../src/grist';
import type { TutorRequest } from '../../src/contracts';
import { PRESETS, presetToSettings } from '../../src/accessibility/presets';
import { validateSettings } from '../../src/accessibility/settings';
import { emmaProfile, paulProfile } from '../fixtures/profiles';

const key = PrivateKey.fromRandom();

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.profiles.add({ ...paulProfile });
  await db.profiles.add({ ...emmaProfile });
});

const open = (profileId = paulProfile.id, onProfileChange?: () => void) =>
  render(<ParentScreen profileId={profileId} onBack={() => undefined} onProfileChange={onProfileChange} />);
const section = async () => within(await screen.findByRole('region', { name: 'Notes for the tutor' }));
const notesOf = async (id: string) => (await profileRepo.getById(id))?.settings.tutorNotes;

async function addNote(text: string) {
  const s = await section();
  fireEvent.change(await s.findByLabelText('New note'), { target: { value: text } });
  fireEvent.click(s.getByRole('button', { name: 'Add note' }));
}

describe('Notes for the tutor on the Grown-ups screen', () => {
  it('starts empty, and adding a note shows it and stores it on the profile', async () => {
    const onProfileChange = vi.fn();
    open(paulProfile.id, onProfileChange);
    const s = await section();
    expect(await s.findByText('No notes yet.')).toBeTruthy();
    await addNote('  Go slower on carrying  ');
    expect(await s.findByText('Go slower on carrying')).toBeTruthy();
    await vi.waitFor(async () => expect(await notesOf(paulProfile.id)).toEqual(['Go slower on carrying']));
    expect(onProfileChange).toHaveBeenCalled();
    expect((s.getByLabelText('New note') as HTMLInputElement).value).toBe('');
  });

  it('keeps notes per profile: another profile sees none', async () => {
    open(paulProfile.id);
    await addNote('Use pictures first');
    await vi.waitFor(async () => expect(await notesOf(paulProfile.id)).toEqual(['Use pictures first']));
    expect(await notesOf(emmaProfile.id)).toBeUndefined();
  });

  it('shows the notes the profile already has, and deleting one removes only that one', async () => {
    await profileRepo.update(paulProfile.id, { settings: { ...paulProfile.settings, tutorNotes: ['One', 'Two', 'Three'] } });
    open();
    const s = await section();
    expect(await s.findByText('Two')).toBeTruthy();
    fireEvent.click(s.getByRole('button', { name: 'Delete note: Two' }));
    await vi.waitFor(async () => expect(await notesOf(paulProfile.id)).toEqual(['One', 'Three']));
    await vi.waitFor(() => expect(s.queryByText('Two')).toBeNull());
  });

  it('deleting the last note leaves the profile with no notes at all', async () => {
    await profileRepo.update(paulProfile.id, { settings: { ...paulProfile.settings, tutorNotes: ['Only'] } });
    open();
    const s = await section();
    fireEvent.click(await s.findByRole('button', { name: 'Delete note: Only' }));
    await vi.waitFor(async () => expect(await notesOf(paulProfile.id)).toBeUndefined());
  });

  it('ignores a blank note, and stops the box at 200 characters', async () => {
    open();
    const s = await section();
    expect((await s.findByLabelText('New note') as HTMLInputElement).maxLength).toBe(200);
    expect((s.getByRole('button', { name: 'Add note' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(s.getByLabelText('New note'), { target: { value: '   ' } });
    expect((s.getByRole('button', { name: 'Add note' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('holds at most 10 notes: the eleventh cannot be added', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => `Note ${i + 1}`);
    await profileRepo.update(paulProfile.id, { settings: { ...paulProfile.settings, tutorNotes: ten } });
    open();
    const s = await section();
    await s.findByText('Note 10');
    fireEvent.change(s.getByLabelText('New note'), { target: { value: 'One too many' } });
    expect((s.getByRole('button', { name: 'Add note' }) as HTMLButtonElement).disabled).toBe(true);
    expect(s.getByText('You have 10 notes, the most there can be. Delete one to add another.')).toBeTruthy();
  });
});

describe('the notes survive settings handling', () => {
  it('validateSettings keeps good notes and drops bad ones (more than 10, over 200 characters, blank, not text)', () => {
    expect(validateSettings({ tutorNotes: ['a', 'b'] }).tutorNotes).toEqual(['a', 'b']);
    expect(validateSettings({}).tutorNotes).toBeUndefined();
    expect(validateSettings({ tutorNotes: [] }).tutorNotes).toBeUndefined();
    expect(validateSettings({ tutorNotes: ['ok', ' ', 'x'.repeat(201), 5 as unknown as string] }).tutorNotes).toEqual(['ok']);
    expect(validateSettings({ tutorNotes: Array.from({ length: 12 }, (_, i) => `n${i}`) }).tutorNotes).toHaveLength(10);
  });

  it('picking an accessibility preset keeps the notes', () => {
    const current = validateSettings({ tutorNotes: ['Go slower on carrying'] });
    expect(presetToSettings(PRESETS[0], current).tutorNotes).toEqual(['Go slower on carrying']);
  });
});

describe('parent_notes on the tutor-turn request', () => {
  const sent: SendGristParams[] = [];
  const deps = (): TutorDeps => ({
    getKey: async () => key,
    sendGrist: vi.fn(async (params: SendGristParams) => {
      sent.push(params);
      return { txid: `direct:${sent.length}`, seq: 1, mill: 'aa' };
    }),
    shrink: async () => ({ bytes: new Uint8Array([1]), mime: 'image/jpeg', name: 'work.jpg' }),
  });
  const lastInput = () => sent[sent.length - 1].input as TutorRequest;
  const setNotes = (id: string, notes?: string[]) =>
    profileRepo.update(id, { settings: { ...paulProfile.settings, ...(notes ? { tutorNotes: notes } : {}) } });

  beforeEach(() => {
    sent.length = 0;
  });

  it('sends the profile\'s notes with the problem, the reading and the math turn, and stores them in the turn', async () => {
    await setNotes(paulProfile.id, ['Go slower on carrying', 'Use pictures first']);
    const session = await sendProblem({ profileId: paulProfile.id, strictness: 'meaning-gated', source: { kind: 'text', text: 'What is 7 + 5?' } }, deps());
    expect(lastInput().parent_notes).toEqual(['Go slower on carrying', 'Use pictures first']);

    await sendReading({ session, targetText: 'What is 7 + 5?', recording: { blob: new Blob([new Uint8Array([1])], { type: 'audio/webm' }), mime: 'audio/webm', durationMs: 2000 } }, deps());
    expect(lastInput()).toMatchObject({ mode: 'reading', parent_notes: ['Go slower on carrying', 'Use pictures first'] });

    const math = await sendMath({ session, targetText: 'What is 7 + 5?', answer: '12' }, deps());
    expect(lastInput()).toMatchObject({ mode: 'math', parent_notes: ['Go slower on carrying', 'Use pictures first'] });
    expect(math.request.parent_notes).toEqual(['Go slower on carrying', 'Use pictures first']);
    expect((await tutorRepo.listTurns(session.id)).every((t) => t.request.parent_notes?.length === 2)).toBe(true);
  });

  it('sends the notes as they stand now, not as they stood when the session began', async () => {
    const session = await sendProblem({ profileId: paulProfile.id, strictness: 'meaning-gated', source: { kind: 'text', text: 'What is 7 + 5?' } }, deps());
    expect('parent_notes' in lastInput()).toBe(false);
    await setNotes(paulProfile.id, ['Ask him to draw it']);
    await sendMath({ session, targetText: 'What is 7 + 5?', answer: '12' }, deps());
    expect(lastInput().parent_notes).toEqual(['Ask him to draw it']);
  });

  it('leaves parent_notes out when there are none, and sends one profile\'s notes only for that profile', async () => {
    await setNotes(paulProfile.id, ['Paul only']);
    await sendProblem({ profileId: emmaProfile.id, strictness: 'precision', source: { kind: 'text', text: 'What is 2 + 2?' } }, deps());
    expect('parent_notes' in lastInput()).toBe(false);
    await setNotes(paulProfile.id);
    await sendProblem({ profileId: paulProfile.id, strictness: 'precision', source: { kind: 'text', text: 'What is 2 + 2?' } }, deps());
    expect('parent_notes' in lastInput()).toBe(false);
  });
});

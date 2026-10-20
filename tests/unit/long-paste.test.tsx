// mw-gq6.463: a text box with a limit never cuts a paste. 'Notes for the tutor' (200) and 'Ask the tutor' (1000) used
// maxLength, which drops the rest of a paste without a word. Now the box keeps the whole text. 'Notes for the tutor'
// counts it ('N of M', red with the reason once over) and its button is off and says why; 'Ask the tutor' is voice-kit's
// Composer (mw-06ggew.9), which has no count: Send refuses with the reason and the words stay. Nothing cuts the text.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PrivateKey } from '@bsv/sdk';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { ParentScreen } from '../../src/features/tutor/parent-screen';
import { MAX_TUTOR_NOTE_LENGTH } from '../../src/accessibility/settings';
import { PARENT_ASK_MAX_QUESTION, buildParentAskRequest } from '../../src/features/tutor/parent-ask-request';
import { sendParentAsk } from '../../src/features/tutor/parent-ask-flow';
import { TutorUserError } from '../../src/features/tutor/tutor-flow';
import type { SendGristParams } from '../../src/grist';
import { paulProfile } from '../fixtures/profiles';

const key = PrivateKey.fromRandom();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

/** A paste of exactly `length` characters, words and spaces, ending in a word the test can look for. */
const paste = (length: number) => `${'go slower '.repeat(length).slice(0, length - 4)}LAST`;

/** Pastes into the box as a browser does: jsdom does not cut a set value at maxLength, a real browser does. */
function pasteInto(field: HTMLInputElement | HTMLTextAreaElement, text: string) {
  fireEvent.change(field, { target: { value: field.maxLength >= 0 ? text.slice(0, field.maxLength) : text } });
}

function fakeSend() {
  const sent: SendGristParams[] = [];
  const sendGrist = vi.fn(async (params: SendGristParams) => {
    sent.push(params);
    return { txid: `direct:${sent.length}`, seq: 0, mill: 'aa' };
  });
  return { sent, sendGrist, deps: { sendGrist, read: async () => ({ pending: true as const, next: 0 }), getKey: async (): Promise<PrivateKey | undefined> => key, pollIntervalMs: 20 } };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.profiles.add({ ...paulProfile });
});

describe('no text box in src uses maxLength', () => {
  it('has no maxLength on any input or textarea (a box with a limit counts and turns its button off instead)', () => {
    const hits = sourceFiles(join(process.cwd(), 'src'))
      .filter((file) => /\.(tsx|ts)$/.test(file))
      .filter((file) => /\bmaxLength\s*[=:]/.test(readFileSync(file, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('renders the Grown-ups screen with no maxLength on any box', async () => {
    const { container } = render(<ParentScreen profileId={paulProfile.id} onBack={() => undefined} deps={fakeSend().deps} />);
    await screen.findByLabelText('New note');
    await screen.findByLabelText('Your question');
    const boxes = [...container.querySelectorAll('input, textarea')];
    expect(boxes.length).toBeGreaterThan(1);
    expect(boxes.filter((box) => box.hasAttribute('maxlength'))).toEqual([]);
  });
});

describe('Notes for the tutor keeps a long paste', () => {
  const section = async () => within(await screen.findByRole('region', { name: 'Notes for the tutor' }));

  it('keeps all 250 characters, reads "250 of 200" in red with the reason, and Add note is off and says why', async () => {
    render(<ParentScreen profileId={paulProfile.id} onBack={() => undefined} />);
    const s = await section();
    const text = paste(250);
    const field = (await s.findByLabelText('New note')) as HTMLInputElement;
    pasteInto(field, text);

    expect(field.value).toBe(text);
    const note = s.getByText(/^250 of 200/);
    expect(note.textContent).toBe('250 of 200: the note is too long to add. Shorten it; nothing has been cut.');
    expect(note.className).toContain('text-sf-error');
    const add = s.getByRole('button', { name: 'Add note' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(add.getAttribute('aria-describedby')).toBe(note.id);

    // Enter in the box does not add it either, and nothing is stored or cut
    fireEvent.submit(field.closest('form') as HTMLFormElement);
    expect(field.value).toBe(text);
    expect((await profileRepo.getById(paulProfile.id))?.settings.tutorNotes).toBeUndefined();
  });

  it('counts in grey near the limit, and a note shortened to the limit is added whole', async () => {
    render(<ParentScreen profileId={paulProfile.id} onBack={() => undefined} />);
    const s = await section();
    const field = (await s.findByLabelText('New note')) as HTMLInputElement;
    pasteInto(field, paste(150));
    expect(s.queryByText(/of 200/)).toBeNull();

    const text = paste(MAX_TUTOR_NOTE_LENGTH);
    pasteInto(field, text);
    const note = s.getByText('200 of 200');
    expect(note.className).not.toContain('text-sf-error');
    fireEvent.click(s.getByRole('button', { name: 'Add note' }));
    await vi.waitFor(async () => expect((await profileRepo.getById(paulProfile.id))?.settings.tutorNotes).toEqual([text]));
  });
});

describe('Ask the tutor keeps a long paste', () => {
  const box = async () => within(await screen.findByRole('region', { name: 'Ask the tutor' }));

  it('keeps all 1200 characters and says "1200 of 1000" with the reason when Send is pressed; nothing is sent', async () => {
    const client = fakeSend();
    render(<ParentScreen profileId={paulProfile.id} onBack={() => undefined} deps={client.deps} />);
    const s = await box();
    const text = paste(1200);
    const field = (await s.findByLabelText('Your question')) as HTMLTextAreaElement;
    pasteInto(field, text);
    expect(field.value).toBe(text);

    fireEvent.click(s.getByRole('button', { name: 'Send' }));
    const note = await s.findByRole('alert');
    expect(note.textContent).toBe('1200 of 1000: the question is too long to send. Shorten it; nothing has been cut.');
    expect(field.value).toBe(text);
    expect(client.sendGrist).not.toHaveBeenCalled();
    expect(await db.parentAsks.count()).toBe(0);
  });

  it('a question of exactly 1000 characters is sent whole, to its last word', async () => {
    const client = fakeSend();
    render(<ParentScreen profileId={paulProfile.id} onBack={() => undefined} deps={client.deps} />);
    const s = await box();
    const text = paste(PARENT_ASK_MAX_QUESTION);
    pasteInto((await s.findByLabelText('Your question')) as HTMLTextAreaElement, text);
    fireEvent.click(s.getByRole('button', { name: 'Send' }));
    await vi.waitFor(() => expect(client.sendGrist).toHaveBeenCalledTimes(1));
    expect((client.sent[0].input as { question: string }).question).toBe(text);
  });
});

describe('nothing between the box and the factory cuts the question', () => {
  it('buildParentAskRequest keeps a long question whole', () => {
    const text = paste(PARENT_ASK_MAX_QUESTION + 50);
    expect(buildParentAskRequest(`  ${text}  `, []).question).toBe(text);
  });

  it('sendParentAsk refuses an over-long question with the reason, stores nothing and sends nothing', async () => {
    const client = fakeSend();
    const asking = sendParentAsk({ profileId: paulProfile.id, question: paste(1200) }, client.deps);
    await expect(asking).rejects.toBeInstanceOf(TutorUserError);
    await expect(sendParentAsk({ profileId: paulProfile.id, question: paste(1200) }, client.deps)).rejects.toThrow(
      '1200 of 1000: the question is too long to send. Shorten it; nothing has been cut.',
    );
    expect(client.sendGrist).not.toHaveBeenCalled();
    expect(await db.parentAsks.count()).toBe(0);
  });
});

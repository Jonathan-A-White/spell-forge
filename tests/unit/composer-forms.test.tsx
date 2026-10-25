// mw-06ggew.9: Ask the tutor and the feedback form take voice-kit's Composer in place of their plain textareas: hold the
// bar to talk, letting go leaves the words in the box (send 'button'), Send sends them. Type on, attach and camera off (Ask the tutor alone has them on, mw-vmx5cb.1),
// all from the one SPELLFORGE_COMPOSER_SETTINGS. The microphone is voice-kit's honest fake (real timers, quick to open).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { PrivateKey } from '@bsv/sdk';
import { clips, installMic } from 'voice-kit/testing/mic';
import { db } from '../../src/data/db';
import { ParentScreen } from '../../src/worlds/grown-ups/parent-screen';
import { FeedbackForm } from '../../src/features/feedback/feedback-form';
import { SPELLFORGE_COMPOSER_SETTINGS } from '../../src/features/composer/composer-settings';
import type { SendGristParams } from '../../src/grist';
import { paulProfile } from '../fixtures/profiles';

const key = PrivateKey.fromRandom();
const SAID = clips.english.transcript;

let mic: ReturnType<typeof installMic>;
beforeEach(() => {
  mic = installMic(window, { clip: clips.english, grantMs: 1, openMs: 1, silenceMs: 1 });
});
afterEach(() => mic.uninstall());

/** Holds the bar, lets the clip play to its end, lets go; the words land in the box. */
async function holdAndRelease(bar: HTMLElement) {
  fireEvent.pointerDown(bar, { pointerId: 1 });
  await screen.findByTestId('live-transcript');
  await vi.waitFor(() => expect(screen.getByTestId('live-transcript').textContent).toBe(SAID), { timeout: 8000 });
  await act(async () => {
    fireEvent.pointerUp(bar, { pointerId: 1 });
  });
}

describe('SPELLFORGE_COMPOSER_SETTINGS', () => {
  it('is hold to talk, send by button, type on, attach off, camera off', () => {
    expect(SPELLFORGE_COMPOSER_SETTINGS).toMatchObject({ talk: 'hold', send: 'button', type: true, attach: false, camera: false });
  });
});

describe('Ask the tutor takes the Composer', () => {
  const fakeSend = () => {
    const sent: SendGristParams[] = [];
    const sendGrist = vi.fn(async (params: SendGristParams) => {
      sent.push(params);
      return { txid: `direct:${sent.length}`, seq: 0, mill: 'aa' };
    });
    return { sent, sendGrist, deps: { sendGrist, read: async () => ({ pending: true as const, next: 0 }), getKey: async (): Promise<PrivateKey | undefined> => key, pollIntervalMs: 20 } };
  };

  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.profiles.add({ ...paulProfile });
  });

  it('holding the mic and letting go puts the words in the box, and Send asks the tutor', { timeout: 20000 }, async () => {
    const client = fakeSend();
    render(<ParentScreen profileId={paulProfile.id} onBack={() => undefined} deps={client.deps} />);
    const s = within(await screen.findByRole('region', { name: 'Ask the tutor' }));
    expect(s.getByRole('button', { name: 'Attach files' })).toBeTruthy();
    expect(s.getByRole('button', { name: 'Take a photo' })).toBeTruthy();
    await holdAndRelease(await s.findByRole('button', { name: 'Hold to ask' }));

    const field = (await s.findByLabelText('Your question')) as HTMLTextAreaElement;
    expect(field.value).toBe(SAID);
    expect(client.sendGrist).not.toHaveBeenCalled();

    fireEvent.click(s.getByRole('button', { name: 'Send' }));
    await vi.waitFor(() => expect(client.sendGrist).toHaveBeenCalledTimes(1));
    expect((client.sent[0].input as { question: string }).question).toBe(SAID);
  });
});

describe('Ask the tutor shows its count through the kit (mw-06ggew.13)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.profiles.add({ ...paulProfile });
  });

  it('shows "N of 1000" live as the question grows and greys Send once it is over 1000', async () => {
    mic.uninstall(); // no microphone: the box is what opens
    render(<ParentScreen profileId={paulProfile.id} onBack={() => undefined} />);
    const s = within(await screen.findByRole('region', { name: 'Ask the tutor' }));
    const field = (await s.findByLabelText('Your question')) as HTMLTextAreaElement;

    fireEvent.change(field, { target: { value: 'a'.repeat(12) } });
    expect(s.getByTestId('composer-count').textContent).toBe('12 of 1000');
    expect((s.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(field, { target: { value: 'a'.repeat(1000) } });
    expect(s.getByTestId('composer-count').textContent).toBe('1000 of 1000');
    expect((s.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(field, { target: { value: 'a'.repeat(1001) } });
    expect(s.getByTestId('composer-count').textContent).toBe('1001 of 1000');
    expect((s.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
    expect(field.value.length).toBe(1001); // nothing is cut
  });
});

describe('the feedback form opens ready to type (mw-06ggew.13)', () => {
  it('has the box focused and 8 rows tall', async () => {
    mic.uninstall(); // with no microphone the box is what opens (with one, the bar does, and there is no box to focus)
    render(<FeedbackForm onSubmit={() => undefined} onCancel={() => undefined} />);
    const field = (await screen.findByLabelText('Your feedback')) as HTMLTextAreaElement;
    expect(field.rows).toBe(8);
    await vi.waitFor(() => expect(document.activeElement).toBe(field));
  });
});

describe('the feedback form takes the Composer', () => {
  it('holding the mic and letting go puts the words in the box, and Send sends the feedback', { timeout: 20000 }, async () => {
    const onSubmit = vi.fn();
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, set href(value: string) { assign(value); } } });
    try {
      render(<FeedbackForm onSubmit={onSubmit} onCancel={() => undefined} />);
      expect(screen.queryByRole('button', { name: 'Attach files' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Take a photo' })).toBeNull();
      await holdAndRelease(await screen.findByRole('button', { name: 'Hold to talk' }));

      const field = (await screen.findByLabelText('Your feedback')) as HTMLTextAreaElement;
      expect(field.value).toBe(SAID);
      expect(onSubmit).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith(SAID));
      expect(assign).toHaveBeenCalledTimes(1);
      expect(await screen.findByText('Thank You!')).toBeTruthy();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });
});

// mw-79en7t.51 (Kestrel 17c, M15): the phone's voices on 'Tutor settings' are one searchable list, not a page of radios.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stop } from 'voice-kit/speech';
import { installSpeech, type FakeVoice, type SpeechFake } from 'voice-kit/testing/speech';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { TutorSettings } from '../../src/features/tutor/tutor-settings';
import { paulProfile } from '../fixtures/profiles';

const voices: FakeVoice[] = Array.from({ length: 30 }, (_, i) => ({
  name: `Zed${i + 1}`,
  lang: 'en-US',
  voiceURI: `uri:Zed${i + 1}`,
  default: i === 0,
  localService: true,
}));

let speech: SpeechFake;

beforeEach(async () => {
  vi.restoreAllMocks();
  speech = installSpeech(window, { voices });
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US');
  await db.delete();
  await db.open();
  await db.profiles.add({ ...paulProfile });
});

afterEach(() => {
  cleanup();
  stop();
  speech.uninstall();
});

const open = async () => {
  render(<TutorSettings profileId={paulProfile.id} />);
  const region = within(await screen.findByRole('region', { name: 'Tutor settings' }));
  // the fake lists its voices 50 ms after install: wait for all of them (and the phone's default)
  await vi.waitFor(() => expect(region.getAllByRole('radio', { name: /Zed|Phone's default/ })).toHaveLength(31));
  return region;
};

describe('the Voice setting as a searchable list', () => {
  it('shows 30 voices as one list under one search box', async () => {
    const region = await open();
    expect(region.getAllByRole('searchbox', { name: 'Search voices' })).toHaveLength(1);
    const list = region.getByRole('radiogroup', { name: 'Voices' });
    expect(within(list).getAllByRole('radio')).toHaveLength(31);
    expect(within(list).getAllByRole('button', { name: /Try it/ })).toHaveLength(31);
  });

  it('typing filters the list by name, keeping the phone default', async () => {
    const region = await open();
    fireEvent.change(region.getByRole('searchbox', { name: 'Search voices' }), { target: { value: 'zed2' } });
    const list = () => within(region.getByRole('radiogroup', { name: 'Voices' }));
    const names = list().getAllByRole('radio').map((r) => r.closest('div')?.textContent ?? '');
    // Zed2 and Zed20 to Zed29, then the phone's default is always there
    expect(names.filter((n) => /^Zed2/.test(n))).toHaveLength(11);
    expect(names.some((n) => /^Zed1/.test(n))).toBe(false);
    expect(region.getByLabelText("Phone's default")).toBeTruthy();

    fireEvent.change(region.getByRole('searchbox', { name: 'Search voices' }), { target: { value: 'zed25' } });
    expect(list().getAllByRole('radio')).toHaveLength(2);
    fireEvent.change(region.getByRole('searchbox', { name: 'Search voices' }), { target: { value: 'nothing like it' } });
    expect(region.getByText('No voice matches that.')).toBeTruthy();
  });

  it('keeps the chosen voice: stored for the profile, still chosen once the search is cleared', async () => {
    const region = await open();
    const search = region.getByRole('searchbox', { name: 'Search voices' });
    fireEvent.change(search, { target: { value: 'zed25' } });
    fireEvent.click(region.getByLabelText(/^Zed25/));
    await vi.waitFor(async () => expect((await profileRepo.getById(paulProfile.id))?.settings.tutorVoice).toBe('uri:Zed25'));

    // filtered away, the choice is still said
    fireEvent.change(search, { target: { value: 'zed3' } });
    expect(await region.findByText('Chosen: Zed25')).toBeTruthy();

    fireEvent.change(search, { target: { value: '' } });
    expect((region.getByLabelText(/^Zed25/) as HTMLInputElement).checked).toBe(true);
    expect(within(region.getByRole('radiogroup', { name: 'Voices' })).getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1);
  });
});

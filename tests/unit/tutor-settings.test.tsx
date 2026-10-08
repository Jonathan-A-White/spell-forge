// mw-kuy7rx.8: 'Tutor settings' on the Grown-ups screen: How should the tutor help? and the Voice picker.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { ParentScreen } from '../../src/features/tutor/parent-screen';
import { tutorSayFor } from '../../src/features/tutor/tutor-voice';
import { presetToSettings, PRESETS } from '../../src/accessibility/presets';
import { validateSettings } from '../../src/accessibility/settings';
import { paulProfile } from '../fixtures/profiles';

class MockUtterance {
  text: string;
  rate = 1;
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  onstart: ((ev: Event) => void) | null = null;
  onend: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}
const v = (name: string, lang: string, isDefault = false) =>
  ({ name, lang, voiceURI: `uri:${name}`, default: isDefault, localService: true }) as SpeechSynthesisVoice;

let synth: SpeechSynthesis;
const spoken = () => vi.mocked(synth.speak).mock.calls.map((c) => c[0] as unknown as MockUtterance);

beforeEach(async () => {
  vi.restoreAllMocks();
  synth = {
    speak: vi.fn((u: MockUtterance) => {
      setTimeout(() => u.onend?.(new Event('end')), 0);
    }),
    cancel: vi.fn(),
    resume: vi.fn(),
    speaking: false,
    pending: false,
    paused: false,
    getVoices: vi.fn(() => [v('Sam', 'en-US', true), v('Fran', 'fr-FR'), v('Gwen', 'en-GB')]),
    onvoiceschanged: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as SpeechSynthesis;
  vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);
  vi.stubGlobal('speechSynthesis', synth);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-US');
  await db.delete();
  await db.open();
  await db.profiles.add({ ...paulProfile });
});

const open = () => render(<ParentScreen profileId={paulProfile.id} onBack={() => undefined} />);
const section = async () => within(await screen.findByRole('region', { name: 'Tutor settings' }));

describe('Tutor settings: How should the tutor help?', () => {
  it('offers Meaning first (selected by default) and Every word', async () => {
    open();
    const s = await section();
    expect((await s.findByLabelText('Meaning first') as HTMLInputElement).checked).toBe(true);
    expect((s.getByLabelText('Every word') as HTMLInputElement).checked).toBe(false);
  });

  it('choosing Every word stores profile.settings.tutorStrictness and tells the screen', async () => {
    const onProfileChange = vi.fn();
    render(<ParentScreen profileId={paulProfile.id} onBack={() => undefined} onProfileChange={onProfileChange} />);
    const s = await section();
    fireEvent.click(await s.findByLabelText('Every word'));
    await vi.waitFor(async () => expect((await profileRepo.getById(paulProfile.id))?.settings.tutorStrictness).toBe('precision'));
    await vi.waitFor(() => expect(onProfileChange).toHaveBeenCalled());
    expect(onProfileChange.mock.calls[0][0].settings.tutorStrictness).toBe('precision');
  });
});

describe('Tutor settings: Voice', () => {
  it("lists the phone's default first and selected, then the device's voices for the language", async () => {
    open();
    const s = await section();
    const radios = (await s.findAllByRole('radio', { name: /Phone's default|Sam|Gwen|Fran/ })) as HTMLInputElement[];
    const labels = radios.map((r) => r.closest('div')?.textContent ?? '');
    expect(labels[0]).toContain("Phone's default");
    expect(radios[0].checked).toBe(true);
    expect(s.getByLabelText(/^Sam/)).toBeTruthy();
    expect(s.getByLabelText(/^Gwen/)).toBeTruthy();
    expect(s.queryByLabelText(/^Fran/)).toBeNull();
  });

  it('picking a voice stores it for the profile', async () => {
    open();
    const s = await section();
    fireEvent.click(await s.findByLabelText(/^Gwen/));
    await vi.waitFor(async () => expect((await profileRepo.getById(paulProfile.id))?.settings.tutorVoice).toBe('uri:Gwen'));
  });

  it('picking the phone default again clears the choice', async () => {
    await profileRepo.update(paulProfile.id, { settings: { ...paulProfile.settings, tutorVoice: 'uri:Gwen' } });
    open();
    const s = await section();
    expect(((await s.findByLabelText(/^Gwen/)) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(s.getByLabelText("Phone's default"));
    await vi.waitFor(async () => expect((await profileRepo.getById(paulProfile.id))?.settings.tutorVoice).toBeUndefined());
  });

  it("each voice has a Try it that says one sentence in that voice", async () => {
    open();
    const s = await section();
    const buttons = await s.findAllByRole('button', { name: /Try it/ });
    expect(buttons).toHaveLength(3); // the phone's default, Sam, Gwen
    fireEvent.click(s.getByRole('button', { name: 'Try it: Gwen' }));
    await vi.waitFor(() => expect(spoken()).toHaveLength(1));
    expect(spoken()[0].voice?.name).toBe('Gwen');
    expect(spoken()[0].text.split(/[.!?]/).filter((x) => x.trim())).toHaveLength(1);
    fireEvent.click(s.getByRole('button', { name: "Try it: Phone's default" }));
    await vi.waitFor(() => expect(spoken()).toHaveLength(2));
    expect(spoken()[1].voice?.name).toBe('Sam');
  });
});

describe("the tutor's speech uses the profile's voice", () => {
  it('tutorSayFor speaks with the voice picked for the profile', async () => {
    await profileRepo.update(paulProfile.id, { settings: { ...paulProfile.settings, tutorVoice: 'uri:Gwen' } });
    await tutorSayFor(paulProfile.id)('Hello');
    expect(spoken()[0].voice?.name).toBe('Gwen');
  });

  it('with no pick, it follows the default rule', async () => {
    await tutorSayFor(paulProfile.id)('Hello');
    expect(spoken()[0].voice?.name).toBe('Sam');
    expect(spoken()[0].lang).toBe('');
  });

  it('an unknown profile still speaks, by the default rule', async () => {
    await tutorSayFor('nobody')('Hello');
    expect(spoken()[0].voice?.name).toBe('Sam');
  });
});

describe('settings keep the voice', () => {
  it('validateSettings keeps tutorVoice and drops a non-string', () => {
    expect(validateSettings({ ...paulProfile.settings, tutorVoice: 'uri:x' }).tutorVoice).toBe('uri:x');
    expect(validateSettings({ ...paulProfile.settings, tutorVoice: 7 as unknown as string }).tutorVoice).toBeUndefined();
  });

  it('applying a preset keeps the profile’s voice', () => {
    const out = presetToSettings(PRESETS[0], { ...paulProfile.settings, tutorVoice: 'uri:x' });
    expect(out.tutorVoice).toBe('uri:x');
  });
});

// mw-79en7t.40 (Kestrel 13c): the front door's screen. The tutor greets by voice; he holds the big bar to talk and has a
// camera, and there is no keyboard; each answer is drawn as markdown and spoken; without a licence the worlds are big pictures
// with the one line. Speech and the microphone are voice-kit's honest fakes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { stop } from 'voice-kit/speech';
import { installSpeech, type SpeechFake } from 'voice-kit/testing/speech';
import { clips, installMic } from 'voice-kit/testing/mic';
import { FrontDoor } from '../../src/features/front-door/FrontDoor';
import type { FrontDoorFlow, FrontDoorReply } from '../../src/features/front-door/front-door-flow';
import { FRONT_DOOR_COMPOSER_SETTINGS, SPELLFORGE_COMPOSER_SETTINGS } from '../../src/features/composer/composer-settings';
import { NO_LICENCE_LINE, setLicenceStatus } from '../../src/shell/licence-gate';
import type { ViewId } from '../../src/shell/worlds';

const SAID = clips.english.transcript;
const GREETING = 'Hello there. Hold the big button and tell me what you want to do.';
const CHECKED_AT = '2026-10-24T10:00:00Z';

let speech: SpeechFake;
let mic: ReturnType<typeof installMic>;

beforeEach(async () => {
  speech = installSpeech(window, { msPerWord: 1, baseMs: 1, voicesDelayMs: 1 });
  mic = installMic(window, { clip: clips.english, grantMs: 1, openMs: 1, silenceMs: 1 });
  await new Promise((resolve) => setTimeout(resolve, 20));
});
afterEach(() => {
  cleanup();
  act(() => stop());
  mic.uninstall();
  speech.uninstall();
  setLicenceStatus(undefined);
});

function fakeFlow(replies: FrontDoorReply[] = []) {
  let next = 0;
  const flow: FrontDoorFlow = {
    start: vi.fn(async () => 'talk-1'),
    ask: vi.fn(async () => replies[Math.min(next++, replies.length - 1)]),
  };
  return flow;
}

const answer = (words: string, extra: Partial<Extract<FrontDoorReply, { kind: 'answer' }>> = {}): FrontDoorReply => ({
  kind: 'answer',
  words,
  turn: 'talk-1:1',
  opened: false,
  learned: [],
  ...extra,
});

describe('the front door settings', () => {
  it('is hold to talk and the camera, with no typing and no attach, and the other forms\' values kept', () => {
    expect(FRONT_DOOR_COMPOSER_SETTINGS).toMatchObject({ talk: 'hold', send: 'release', type: false, attach: false, camera: true });
    expect(SPELLFORGE_COMPOSER_SETTINGS).toMatchObject({ talk: 'hold', send: 'button', type: true, attach: false, camera: false });
  });
});

describe('the front door (AC1)', () => {
  it('speaks the greeting on open and draws it', async () => {
    render(<FrontDoor flow={fakeFlow()} open={() => undefined} greeting={GREETING} />);
    await vi.waitFor(() => expect(speech.spoken()[0]).toBe('Hello there.'));
    await vi.waitFor(() => expect(speech.spoken().join(' ')).toBe(GREETING));
    expect(screen.getByText(GREETING)).toBeInTheDocument();
  });

  it('has the big hold-to-talk bar and the camera, and no text input at all', async () => {
    render(<FrontDoor flow={fakeFlow()} open={() => undefined} greeting={GREETING} />);
    expect(await screen.findByRole('button', { name: 'Hold to talk' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Take a photo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Attach files' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Type a message' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.querySelector('textarea, input[type="text"]')).toBeNull();
  });

  it('letting go of the bar sends the words, and the answer is drawn as markdown and spoken as plain text', { timeout: 20000 }, async () => {
    const flow = fakeFlow([answer('Good **thinking**!\n\n- say it\n- spell it')]);
    render(<FrontDoor flow={flow} open={() => undefined} greeting={GREETING} />);
    const bar = await screen.findByRole('button', { name: 'Hold to talk' });
    fireEvent.pointerDown(bar, { pointerId: 1 });
    await screen.findByTestId('live-transcript');
    await vi.waitFor(() => expect(screen.getByTestId('live-transcript').textContent).toBe(SAID), { timeout: 8000 });
    await act(async () => {
      fireEvent.pointerUp(bar, { pointerId: 1 });
    });

    await vi.waitFor(() => expect(flow.ask).toHaveBeenCalledTimes(1));
    expect(vi.mocked(flow.ask).mock.calls[0].slice(0, 2)).toEqual(['talk-1', SAID]);
    expect(await screen.findByText('thinking')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('*');
    expect(document.querySelectorAll('li')).toHaveLength(2);
    await vi.waitFor(() => expect(speech.spoken().join(' ')).toContain('Good thinking!'));
    expect(speech.spoken().join(' ')).not.toContain('*');
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('the front door without a licence (AC3)', () => {
  it('offers the worlds as big pictures with the one line, and no textbox, no bar and no call', async () => {
    setLicenceStatus({ state: 'none', checkedAt: CHECKED_AT });
    const opened: ViewId[] = [];
    const flow = fakeFlow();
    render(<FrontDoor flow={flow} open={(view) => opened.push(view)} greeting={GREETING} />);

    expect(screen.getByText(NO_LICENCE_LINE)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hold to talk' })).toBeNull();
    const spelling = screen.getByRole('button', { name: 'Spelling' });
    expect(spelling.querySelector('svg, img, [role="img"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Maths/ })).toBeInTheDocument();
    expect(flow.start).not.toHaveBeenCalled();
    expect(speech.log).toEqual([]);

    fireEvent.click(spelling);
    expect(opened).toEqual(['progress']);
  });

  it('turns to the worlds when the licence goes while the screen is open', async () => {
    const flow = fakeFlow();
    render(<FrontDoor flow={flow} open={() => undefined} greeting={GREETING} />);
    await screen.findByRole('button', { name: 'Hold to talk' });
    act(() => setLicenceStatus({ state: 'none', checkedAt: CHECKED_AT }));
    expect(screen.getByText(NO_LICENCE_LINE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hold to talk' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Spelling' })).toBeInTheDocument();
  });
});

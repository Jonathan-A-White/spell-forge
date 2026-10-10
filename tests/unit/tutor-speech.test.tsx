// mw-m7v5kc.4: the tutor's sentences are spoken by bsv-kit/speech and steered by its Pause/Resume, Restart and Stop bar:
// the position is kept, new speech replaces old, single words are untouched. The synthesiser is bsv-kit/testing's honest
// fake, which takes the time Android Chrome takes (150 ms and 60 ms a word) and reports a cancelled sentence as an error.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { stop } from 'bsv-kit/speech';
import { installSpeech, type SpeechFake } from 'bsv-kit/testing/speech';
import { sayAsTutor, sayWord } from '../../src/audio';
import { TutorSpeechBar } from '../../src/features/tutor/speech-bar';

let speech: SpeechFake;

beforeEach(async () => {
  vi.useFakeTimers();
  speech = installSpeech(window);
  await vi.advanceTimersByTimeAsync(60); // the phone lists its voices
});

afterEach(() => {
  act(() => stop());
  speech.uninstall();
  vi.useRealTimers();
});

const THREE = 'First sentence. Second sentence! Third sentence?'; // 270 ms each
const move = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const bar = () => screen.queryByRole('region', { name: 'Tutor speech' });
const press = (name: string) => act(() => void fireEvent.click(screen.getByRole('button', { name })));

describe('the tutor speaks with the bar', () => {
  it('shows Pause, Restart and Stop while a sentence speaks, and nothing once it is over', async () => {
    render(<TutorSpeechBar />);
    expect(bar()).toBeNull();
    act(() => void sayAsTutor(THREE));
    await move(10);
    expect(bar()).not.toBeNull();
    for (const name of ['Pause', 'Restart', 'Stop']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    expect(speech.spoken()).toEqual(['First sentence.']);
    await move(270 * 3);
    expect(speech.spoken()).toEqual(['First sentence.', 'Second sentence!', 'Third sentence?']);
    expect(speech.synth.speaking).toBe(false);
    expect(bar()).toBeNull();
  });

  it('Pause keeps the sentence reached and says nothing more; the bar offers Resume', async () => {
    render(<TutorSpeechBar />);
    act(() => void sayAsTutor(THREE));
    await move(300); // into the second sentence
    press('Pause');
    await move(2000);
    expect(speech.spoken()).toEqual(['First sentence.', 'Second sentence!']);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
  });

  it('Resume speaks on from the same sentence, not from the start', async () => {
    render(<TutorSpeechBar />);
    act(() => void sayAsTutor(THREE));
    await move(300);
    press('Pause');
    await move(100);
    press('Resume');
    await move(270 * 2 + 10);
    expect(speech.spoken()).toEqual(['First sentence.', 'Second sentence!', 'Second sentence!', 'Third sentence?']);
    expect(bar()).toBeNull();
  });

  it('Restart speaks from the first sentence, playing or paused', async () => {
    render(<TutorSpeechBar />);
    act(() => void sayAsTutor(THREE));
    await move(300);
    press('Restart');
    await move(10);
    expect(speech.spoken().slice(2)).toEqual(['First sentence.']);
    press('Pause');
    await move(100);
    press('Restart');
    await move(10);
    expect(speech.spoken().slice(3)).toEqual(['First sentence.']);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('Stop ends it: the bar goes and nothing is kept to resume', async () => {
    render(<TutorSpeechBar />);
    act(() => void sayAsTutor(THREE));
    await move(300);
    press('Stop');
    await move(2000);
    expect(bar()).toBeNull();
    expect(speech.spoken()).toEqual(['First sentence.', 'Second sentence!']);
    expect(speech.synth.speaking).toBe(false);
  });

  it('a page that goes hidden pauses the tutor, and coming back offers Resume', async () => {
    render(<TutorSpeechBar />);
    act(() => void sayAsTutor(THREE));
    await move(300);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    await move(1000);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(speech.spoken()).toEqual(['First sentence.', 'Second sentence!']);
  });
});

describe('new tutor speech replaces old', () => {
  it('a second sentence cuts the first off: the first is not spoken to its end, and nothing queues behind it', async () => {
    render(<TutorSpeechBar />);
    const first = sayAsTutor(THREE);
    await move(10);
    act(() => void sayAsTutor('Something new. Quite new.'));
    await move(10);
    await first; // replaced for good
    await move(2000);
    expect(speech.spoken()).toEqual(['First sentence.', 'Something new.', 'Quite new.']);
    expect(speech.log.find((entry) => entry.text === 'Second sentence!')?.outcome).toBe('canceled');
  });

  it('new speech replaces a paused one, which cannot be resumed any more', async () => {
    render(<TutorSpeechBar />);
    act(() => void sayAsTutor(THREE));
    await move(300);
    press('Pause');
    act(() => void sayAsTutor('Fresh start.'));
    await move(300);
    expect(speech.spoken()).toEqual(['First sentence.', 'Second sentence!', 'Fresh start.']);
    expect(bar()).toBeNull();
  });

  it('sayAsTutor resolves when the speech is over for good', async () => {
    let done = false;
    void sayAsTutor('Hello there.').then(() => (done = true));
    await move(100);
    expect(done).toBe(false);
    await move(400);
    expect(done).toBe(true);
  });
});

describe('single words keep their own engine', () => {
  it('a word spoken while the tutor plays pauses the tutor, leaving Resume', async () => {
    render(<TutorSpeechBar />);
    act(() => void sayAsTutor(THREE));
    await move(10);
    let wordDone = false;
    act(() => void sayWord('cat').then(() => (wordDone = true)));
    await move(500);
    expect(wordDone).toBe(true);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(speech.spoken()).toEqual(['First sentence.', 'cat']);
  });
});

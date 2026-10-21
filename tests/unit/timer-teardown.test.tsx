// A timer a screen starts must not touch the page once the screen has closed (pwa-kit/alive).
// Each test starts the timer, unmounts the screen, then runs the fake clock past the timer with the page torn down
// and expects no unhandled rejection and no uncaught error. The clock is fake: nothing here waits in real time.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { settleAfterTeardown } from 'pwa-kit/test-preset';
import { SharePanel } from '../../src/features/settings/share-panel';
import { KeyboardInput } from '../../src/features/learning/keyboard-input';
import { LetterBank } from '../../src/features/practice/letter-bank';
import { WordVolcano } from '../../src/features/practice/word-volcano';
import { SpellCatcher } from '../../src/features/practice/spell-catcher';
import { LetterInvasion } from '../../src/features/practice/letter-invasion';
import { WordRelayRace } from '../../src/features/practice/word-relay-race';
import { PdfExportDialog } from '../../src/features/word-lists/pdf-export-dialog';

vi.mock('../../src/features/word-lists/pdf-generator', () => ({ downloadWordListPdf: vi.fn() }));

// settleAfterTeardown waits on setImmediate, so that one stays real.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Runs the fake clock `ms` forward with the page gone; what the timers raised (thrown in the callback or not). */
async function runClockAfterTeardown(ms: number): Promise<unknown[]> {
  const thrown: unknown[] = [];
  const raised = await settleAfterTeardown(() => {
    try {
      vi.advanceTimersByTime(ms);
    } catch (err) {
      thrown.push(err);
    }
  });
  return [...thrown, ...raised];
}

function wrongLetterButton(word: string): HTMLElement {
  const wrong = screen
    .getAllByRole('button')
    .find((b) => /^[A-Za-z]$/.test(b.textContent ?? '') && !word.includes((b.textContent ?? '').toLowerCase()));
  if (!wrong) throw new Error('no wrong letter on screen');
  return wrong;
}

describe('SharePanel', () => {
  it('drops the Copied! reset when the copy succeeded and the panel closed (share-panel.tsx:22)', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: () => Promise.resolve() } });
    const { unmount } = render(<SharePanel onBack={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByText('Copy Link'));
    });
    expect(screen.getByText('Copied!')).toBeInTheDocument();
    unmount();

    expect(await runClockAfterTeardown(3000)).toEqual([]);
  });

  it('drops the Copied! reset when the copy fell back and the panel closed (share-panel.tsx:32)', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: () => Promise.reject(new Error('no')) } });
    document.execCommand = vi.fn().mockReturnValue(true);
    const { unmount } = render(<SharePanel onBack={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByText('Copy Link'));
    });
    expect(screen.getByText('Copied!')).toBeInTheDocument();
    unmount();

    expect(await runClockAfterTeardown(3000)).toEqual([]);
  });
});

describe('KeyboardInput', () => {
  it('drops the wrong-answer flash reset when the input closed (keyboard-input.tsx:32)', () => {
    const { unmount } = render(<KeyboardInput word="cat" onComplete={vi.fn()} tapTargetSize={48} />);
    const field = screen.getByRole('textbox', { name: 'Type the spelling word' });
    fireEvent.keyDown(field, { key: 'd' });
    fireEvent.keyDown(field, { key: 'Enter' });
    unmount();

    return runClockAfterTeardown(1000).then((raised) => expect(raised).toEqual([]));
  });
});

describe('LetterBank', () => {
  it('drops the wrong-letter flash reset when the bank closed (letter-bank.tsx:68)', async () => {
    // jsdom has no ResizeObserver; the bank only reads its width from it.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    const { unmount } = render(<LetterBank word="cat" onComplete={vi.fn()} tapTargetSize={48} />);
    fireEvent.click(wrongLetterButton('cat'));
    unmount();

    expect(await runClockAfterTeardown(1000)).toEqual([]);
  });
});

describe('WordVolcano', () => {
  const savedState = {
    words: ['cat'],
    currentWordIndex: 0,
    wordsCompleted: 0,
    totalScore: 0,
    mistakes: 0,
    hintsUsed: 0,
  };

  it('drops the correct-letter flash reset when the game closed (word-volcano.tsx:137)', async () => {
    const { unmount } = render(
      <WordVolcano words={['cat']} onComplete={vi.fn()} tapTargetSize={48} savedState={savedState} />,
    );
    for (const letter of ['C', 'A', 'T']) {
      fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent === letter && !b.hasAttribute('disabled'))!);
    }
    unmount();

    expect(await runClockAfterTeardown(2000)).toEqual([]);
  });

  it('drops the wrong-letter flash reset when the game closed (word-volcano.tsx:147)', async () => {
    const { unmount } = render(
      <WordVolcano words={['cat']} onComplete={vi.fn()} tapTargetSize={48} savedState={savedState} />,
    );
    fireEvent.click(wrongLetterButton('cat'));
    unmount();

    expect(await runClockAfterTeardown(2000)).toEqual([]);
  });

  it('drops the hint reveal reset when the game closed (word-volcano.tsx:163)', async () => {
    const { unmount } = render(
      <WordVolcano words={['cat']} onComplete={vi.fn()} tapTargetSize={48} savedState={savedState} />,
    );
    fireEvent.click(screen.getByText('Hint'));
    unmount();

    expect(await runClockAfterTeardown(2000)).toEqual([]);
  });
});

describe('SpellCatcher', () => {
  it('drops the feedback reset when the game closed (spell-catcher.tsx:213)', async () => {
    const { unmount } = render(
      <SpellCatcher
        words={['cat']}
        onComplete={vi.fn()}
        tapTargetSize={48}
        savedState={{ words: ['cat'], currentWordIndex: 0, wordsCompleted: 0, totalScore: 0, nextLetterIndex: 0, lives: 3 }}
      />,
    );
    const falling = screen.getAllByRole('button').find((b) => /^[A-Z]$/.test(b.textContent ?? ''));
    expect(falling).toBeDefined();
    fireEvent.click(falling!);
    unmount();

    expect(await runClockAfterTeardown(2000)).toEqual([]);
  });
});

describe('LetterInvasion', () => {
  it('drops the feedback reset when the game closed (letter-invasion.tsx:331)', async () => {
    const { unmount } = render(
      <LetterInvasion
        words={['cat']}
        onComplete={vi.fn()}
        tapTargetSize={48}
        savedState={{ words: ['cat'], currentWaveIndex: 0, wavesCleared: 0, totalScore: 0, nextLetterIndex: 0, shield: 3 }}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    const invader = screen.getAllByRole('button', { name: /^Shoot letter/ })[0];
    fireEvent.click(invader);
    unmount();

    expect(await runClockAfterTeardown(2000)).toEqual([]);
  });
});

describe('WordRelayRace', () => {
  it('drops the stumble reset when the race closed (word-relay-race.tsx:201)', async () => {
    const { unmount } = render(
      <WordRelayRace
        words={['cat']}
        onComplete={vi.fn()}
        tapTargetSize={48}
        savedState={{ words: ['cat', 'dog'], currentIndex: 0, wordTimes: [], elapsedMs: 0, bestTimeMs: null, difficulty: 'easy' }}
      />,
    );
    const field = screen.getByRole('textbox', { name: 'Type the spelling word' });
    fireEvent.keyDown(field, { key: 'x' });
    fireEvent.click(screen.getByRole('button', { name: 'Go!' }));
    unmount();

    expect(await runClockAfterTeardown(5000)).toEqual([]);
  });

  it('drops the countdown steps when the race closed during the countdown (word-relay-race.tsx:154)', async () => {
    const { unmount } = render(<WordRelayRace words={['cat', 'dog']} onComplete={vi.fn()} tapTargetSize={48} />);
    fireEvent.click(screen.getByText('Rookie Race'));
    fireEvent.click(screen.getByText('Start Race!'));
    unmount();

    expect(await runClockAfterTeardown(5000)).toEqual([]);
  });
});

describe('PdfExportDialog', () => {
  it('drops the Generating reset when the dialog closed meanwhile (pdf-export-dialog.tsx:33)', async () => {
    const { unmount } = render(<PdfExportDialog listName="Week 1" words={['cat']} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('pdf-generate-btn'));
    unmount();

    expect(await runClockAfterTeardown(1000)).toEqual([]);
  });
});

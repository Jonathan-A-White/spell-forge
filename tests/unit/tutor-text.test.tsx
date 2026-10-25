// mw-79en7t.40 (Kestrel 13c, M16): every tutor answer is drawn through one TutorText: markdown as markup, never a literal
// star or hash, and spoken as its plain text. The speech is voice-kit's honest fake.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { stop } from 'voice-kit/speech';
import { installSpeech, type SpeechFake } from 'voice-kit/testing/speech';
import { TutorText } from '../../src/features/front-door/TutorText';
import { plainText } from '../../src/features/front-door/tutor-markdown';

let speech: SpeechFake;
beforeEach(async () => {
  speech = installSpeech(window, { msPerWord: 1, baseMs: 1, voicesDelayMs: 1 });
  await new Promise((resolve) => setTimeout(resolve, 20));
});
afterEach(() => {
  cleanup();
  act(() => stop());
  speech.uninstall();
});

const ANSWER = [
  '# Let us spell',
  'Try the **tricky** word, then *say it* slowly.',
  '- first, find the `ph` sound',
  '- then write it',
  '1. look',
  '2. cover',
  'See [the list](https://example.com/list) for more.',
].join('\n');

const words = (text: string) => text.replace(/\s+/g, ' ').trim();
/** Blocks sit side by side in the DOM's textContent, so compare with the spaces out. */
const unspaced = (text: string) => text.replace(/\s+/g, '');

describe('TutorText', () => {
  it('draws a markdown answer with no literal * or #, as headings, emphasis and lists', () => {
    const { container } = render(<TutorText text={ANSWER} speak={false} />);
    expect(container.textContent).not.toMatch(/[*#`]/);
    expect(screen.getByRole('heading', { name: 'Let us spell' })).toBeInTheDocument();
    expect(container.querySelector('strong')?.textContent).toBe('tricky');
    expect(container.querySelector('em')?.textContent).toBe('say it');
    expect(container.querySelectorAll('ul > li')).toHaveLength(2);
    expect(container.querySelectorAll('ol > li')).toHaveLength(2);
    expect(container.textContent).toContain('the list');
    expect(container.textContent).not.toContain('https://');
    expect(container.querySelector('a')).toBeNull();
  });

  it('speaks the plain text of the answer, which is what is drawn', async () => {
    const { container } = render(<TutorText text={ANSWER} />);
    await vi.waitFor(() => expect(speech.log.at(-1)?.outcome).toBe('ended'));
    const plain = plainText(ANSWER);
    expect(plain).not.toMatch(/[*#`[\]]/);
    expect(words(speech.spoken().join(' '))).toBe(words(plain));
    expect(unspaced(container.textContent ?? '')).toBe(unspaced(plain));
  });

  it('is not spoken when told not to, and is drawn as plain text when it has no markdown', () => {
    const { container } = render(<TutorText text="Well done, Sam." speak={false} />);
    expect(container.textContent).toBe('Well done, Sam.');
    expect(speech.log).toEqual([]);
  });

  it('never makes a link or markup of what it was given', () => {
    const { container } = render(<TutorText text={'<img src=x onerror=alert(1)> and [x](javascript:alert(1))'} speak={false} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('plainText', () => {
  it('drops the marks and keeps the words, one block to a line', () => {
    expect(plainText('## Hi\n**Bold** and _soft_ and `code`.\n\n- a\n- b')).toBe('Hi\nBold and soft and code.\na\nb');
  });
  it('leaves a lone star or hash that is not markup', () => {
    expect(plainText('5 * 3 is #1')).toBe('5 * 3 is #1');
  });
});

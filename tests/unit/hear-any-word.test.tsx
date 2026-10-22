// M19 (story 12c, mw-79en7t.34): a long press on a word of prose says it aloud, through voice-kit's speak(), in the
// language the page names for it. Never in a spelling drill, where the word is the test.
import { cleanup, fireEvent, render } from '@testing-library/react';
import { stop } from 'voice-kit/speech';
import { installSpeech, type SpeechFake } from 'voice-kit/testing/speech';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HearAnyWord } from '../../src/shell/HearAnyWord';
import { LONG_PRESS_MS } from '../../src/shell/word-at';

let speech: SpeechFake;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** jsdom has no layout: the caret API answers with the first node of `within` at `offset`. */
function caretAt(node: Text, offset: number): void {
  Object.assign(document, { caretPositionFromPoint: () => ({ offsetNode: node, offset }) });
}

function press(target: Element, at = { clientX: 20, clientY: 20 }): void {
  fireEvent.pointerDown(target, { button: 0, ...at });
}

beforeEach(async () => {
  speech = installSpeech(window);
  await wait(60); // the phone lists its voices
});

afterEach(() => {
  cleanup();
  stop();
  speech.uninstall();
  Reflect.deleteProperty(document, 'caretPositionFromPoint');
});

describe('HearAnyWord', () => {
  it('says the word under a long press, in the language the page names', async () => {
    const { getByText } = render(
      <>
        <HearAnyWord />
        <p lang="es">hola mundo</p>
        <p>the dragon sleeps</p>
      </>,
    );
    const spanish = getByText('hola mundo');
    caretAt(spanish.firstChild as Text, 7); // inside "mundo"
    press(spanish);
    await wait(LONG_PRESS_MS + 100);
    expect(speech.log).toHaveLength(1);
    expect(speech.log[0]).toMatchObject({ text: 'mundo', lang: 'es-ES' });

    const english = getByText('the dragon sleeps');
    caretAt(english.firstChild as Text, 6); // inside "dragon"
    press(english);
    await wait(LONG_PRESS_MS + 100);
    expect(speech.log[1]).toMatchObject({ text: 'dragon', lang: 'en-US' });
  });

  it('says nothing for a tap or a finger that wanders', async () => {
    const { getByText } = render(
      <>
        <HearAnyWord />
        <p>the dragon sleeps</p>
      </>,
    );
    const p = getByText('the dragon sleeps');
    caretAt(p.firstChild as Text, 6);

    press(p);
    await wait(100);
    fireEvent.pointerUp(p);
    await wait(LONG_PRESS_MS);

    press(p);
    fireEvent.pointerMove(p, { clientX: 60, clientY: 20 });
    await wait(LONG_PRESS_MS + 100);
    expect(speech.log).toHaveLength(0);
  });

  it('leaves a button, a link and a field their own press', async () => {
    const { getByText, getByLabelText } = render(
      <>
        <HearAnyWord />
        <button>Practise now</button>
        <a href="#x">Read more</a>
        <input aria-label="name" defaultValue="Rowan" />
      </>,
    );
    for (const el of [getByText('Practise now'), getByText('Read more'), getByLabelText('name')]) {
      const node = el.firstChild instanceof Text ? el.firstChild : document.createTextNode('Rowan');
      caretAt(node, 1);
      press(el);
    }
    await wait(LONG_PRESS_MS + 100);
    expect(speech.log).toHaveLength(0);
  });

  it('is absent inside a drill form, where the word is the test', async () => {
    const { getByText } = render(
      <>
        <HearAnyWord />
        <form data-drill>
          <p>necessary</p>
        </form>
        <p>outside</p>
      </>,
    );
    const inside = getByText('necessary');
    caretAt(inside.firstChild as Text, 3);
    press(inside);
    await wait(LONG_PRESS_MS + 100);
    expect(speech.log).toHaveLength(0);

    const outside = getByText('outside');
    caretAt(outside.firstChild as Text, 3);
    press(outside);
    await wait(LONG_PRESS_MS + 100);
    expect(speech.log).toHaveLength(1);
  });

  it('drops the click that ends a spoken press, so a tap handler round the prose does not fire', async () => {
    let taps = 0;
    const { getByText } = render(
      <>
        <HearAnyWord />
        <div onClick={() => taps++}>
          <p>the dragon sleeps</p>
        </div>
      </>,
    );
    const p = getByText('the dragon sleeps');
    caretAt(p.firstChild as Text, 6);
    press(p);
    await wait(LONG_PRESS_MS + 100);
    fireEvent.pointerUp(p);
    fireEvent.click(p);
    expect(taps).toBe(0);

    fireEvent.click(p); // the next tap is a tap
    expect(taps).toBe(1);
  });
});

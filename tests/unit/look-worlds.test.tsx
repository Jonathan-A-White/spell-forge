// mw-79en7t.79 (Kestrel look D): the children's worlds charming at phone width. The front door's Worlds grid is big illustrated cards over
// the scene; its bubbles and the hold bar take the age's look (data-sf-age, set by the Shell); the Spelling and Maths drill cards and the
// turns entering them move with the motion tokens of src/look/motion.ts. jsdom has no layout, so the real pixels are
// tests/e2e/look.spec.ts's; here the structure and the stylesheet's rules are held.
import { readFileSync } from 'node:fs';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStore } from 'learn-kit/graph';
import { FrontDoor } from '../../src/features/front-door/FrontDoor';
import type { FrontDoorFlow } from '../../src/features/front-door/front-door-flow';
import { setLicenceStatus } from '../../src/shell/licence-gate';
import { MathsWorld } from '../../src/worlds/maths/MathsWorld';
import { createMathsFlow, memoryKeep as mathsKeep } from '../../src/worlds/maths/maths-flow';
import { SpellingWorld } from '../../src/worlds/spelling/SpellingWorld';
import { createSpellingFlow, memoryKeep as spellingKeep } from '../../src/worlds/spelling/spelling-flow';

const css = readFileSync('src/index.css', 'utf8');

/** The declarations of the rule whose selector is exactly `selector`, or undefined when the stylesheet has none. */
function rule(selector: string): string | undefined {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) return undefined;
  return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
}

const declaration = (body: string | undefined, property: string): string | undefined =>
  body?.match(new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`))?.[1].trim();

afterEach(() => {
  cleanup();
  setLicenceStatus(undefined);
});

describe('the door: Worlds as big illustrated cards over the scene (AC1)', () => {
  const flow: FrontDoorFlow = { start: vi.fn(async () => 'talk-1'), ask: vi.fn() };

  it('draws each world as a card with its own large picture, over the door\'s scene', () => {
    setLicenceStatus({ state: 'none', checkedAt: '2026-10-24T10:00:00Z' });
    render(<FrontDoor flow={flow} open={() => undefined} />);
    const cards = within(screen.getByRole('region', { name: 'Worlds' })).getAllByRole('button');
    expect(cards.map((card) => card.textContent)).toEqual([expect.stringContaining('Spelling'), expect.stringContaining('Maths')]);
    for (const card of cards) {
      expect(card).toHaveClass('sf-world-card');
      const art = card.querySelector('svg');
      expect(art, 'a picture on the card').not.toBeNull();
      expect(Number(art!.getAttribute('width'))).toBeGreaterThanOrEqual(128);
    }
    // the scene (or its still fallback) is what the cards sit over
    expect(document.querySelector('.sf-scene')).not.toBeNull();
  });

  it('gives the card a surface that lets the scene show through, and a size worth a thumb', () => {
    const card = rule('.sf-world-card');
    expect(card, '.sf-world-card in index.css').toBeDefined();
    expect(declaration(card, 'background')).toMatch(/color-mix|rgba|transparent/);
    expect(declaration(card, 'backdrop-filter')).toMatch(/blur/);
    expect(Number.parseFloat(declaration(card, 'min-height') ?? '0')).toBeGreaterThanOrEqual(12);
  });
});

describe('bubbles and the hold bar by age (AC1)', () => {
  it('marks the door\'s bubbles', async () => {
    render(<FrontDoor flow={{ start: vi.fn(async () => 'talk-1'), ask: vi.fn() }} open={() => undefined} greeting="Hello there." />);
    expect((await screen.findByText('Hello there.')).closest('.sf-bubble')).not.toBeNull();
  });

  it.each([
    ['.sf-bubble', 'border-radius'],
    ['.bk-composer.sf-composer', '--bk-composer-bar-height'],
    ['.bk-composer.sf-composer', '--bk-composer-bar-radius'],
  ])('%s has a different %s for a young child and a teen', (selector, property) => {
    const young = declaration(rule(`[data-sf-age='young'] ${selector}`), property);
    const teen = declaration(rule(`[data-sf-age='teen'] ${selector}`), property);
    expect(young, `young ${selector}`).toBeDefined();
    expect(teen, `teen ${selector}`).toBeDefined();
    expect(young).not.toBe(teen);
  });
});

describe('the drill cards (AC2)', () => {
  it('Spelling draws its turn in a card that is made again, and so enters again, for each turn', async () => {
    const flow = createSpellingFlow({ store: memoryStore(), keep: spellingKeep(), now: () => 0, seed: 3 });
    await act(async () => void render(<SpellingWorld flow={flow} />));
    const first = (await flow.question())!;
    await screen.findByRole('button', { name: first.items[0].word });
    const card = document.querySelector('.sf-turn');
    expect(card, 'a .sf-turn card').not.toBeNull();
    expect(within(card as HTMLElement).getByRole('button', { name: 'Hear the word' })).toBeInTheDocument();
  });

  it('Maths draws its question in a card', async () => {
    const flow = createMathsFlow({ store: memoryStore(), keep: mathsKeep(), now: () => 0, seed: 3 });
    await act(async () => void render(<MathsWorld flow={flow} forms={['type']} />));
    const q = (await flow.question())!;
    await screen.findByText(q.item.problem);
    const card = document.querySelector('.sf-turn');
    expect(card, 'a .sf-turn card').not.toBeNull();
    expect(within(card as HTMLElement).getByText(q.item.problem)).toBeInTheDocument();
    expect(within(card as HTMLElement).getByRole('button', { name: 'Check' })).toBeInTheDocument();
  });

  it('enters with the motion tokens, and its world card rises with them too', () => {
    for (const selector of ['.sf-turn', '.sf-world-card']) {
      const animation = declaration(rule(selector), 'animation');
      expect(animation, `${selector} animation`).toMatch(/var\(--sf-duration-\w+\)/);
      expect(animation).toMatch(/var\(--ease-sf-\w+\)/);
    }
  });
});

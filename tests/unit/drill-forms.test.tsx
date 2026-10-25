// The seven games of src/features/practice as learn-kit drill forms (mw-79en7t.45): each is registered under its id, takes a node's items and
// opens as the game it always was. Fake items, no network.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { checkItems } from 'learn-kit/drill';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DRILL_FORM_IDS,
  drillForms,
  gameItems,
  openGame,
  type DrillFormId,
  type GameContext,
} from '../../src/worlds/spelling/drill-forms';

vi.mock('../../src/core/haptics', () => ({
  hapticTap: vi.fn(),
  hapticError: vi.fn(),
  hapticSuccess: vi.fn(),
}));

/** A node's items as the spelling graph holds them (src/learn/spelling/items.ts), made up. */
const NODE_ID = 'phonics-long-a';
const FAKE_ITEMS = [
  { word: 'cake', pattern: 'a_e', distractor: 'caik' },
  { word: 'lake', pattern: 'a_e', distractor: 'laik' },
  { word: 'name', pattern: 'a_e', distractor: 'naim' },
] as const;

function context(overrides: Partial<GameContext> = {}): GameContext {
  return { tapTargetSize: 48, onComplete: vi.fn(), ...overrides };
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('drill forms', () => {
  it('registers the seven games, each once, under the names the practice screen uses', () => {
    expect([...DRILL_FORM_IDS]).toEqual([
      'spell-catcher',
      'word-volcano',
      'word-relay-race',
      'letter-invasion',
      'word-search',
      'unscramble',
      'quiz',
    ]);
    expect(drillForms.ids()).toEqual([...DRILL_FORM_IDS]);
  });

  it('plays the unscramble form through and reports how many words were put right', () => {
    const onComplete = vi.fn();
    render(openGame('unscramble', [{ word: 'at' }], context({ onComplete })));
    fireEvent.click(screen.getByLabelText('Letter a'));
    fireEvent.click(screen.getByLabelText('Letter t'));
    fireEvent.click(screen.getByText('Done'));
    expect(onComplete).toHaveBeenCalledWith({ correct: 1, total: 1 });
  });

  describe.each(DRILL_FORM_IDS.map((id) => [id] as const))('%s', (id: DrillFormId) => {
    it('makes one drill item of its form for each of a node\'s items, which the kit accepts', () => {
      const made = gameItems(NODE_ID, id, FAKE_ITEMS);
      expect(made).toHaveLength(FAKE_ITEMS.length);
      expect(new Set(made.map((m) => m.key)).size).toBe(FAKE_ITEMS.length);
      expect(made.every((m) => m.form === id)).toBe(true);
      expect(made.map((m) => m.payload.word)).toEqual(FAKE_ITEMS.map((i) => i.word));
      expect(() => checkItems(drillForms, made)).not.toThrow();
    });

    it('opens as a drill form with the node\'s items', () => {
      act(() => {
        render(openGame(id, FAKE_ITEMS, context()));
      });
      expect(document.body.textContent).toMatch(OPENS_WITH[id]);
    });
  });
});

/** What each opened game shows of its three items: its own title, or its count of them (found by opening each, see the games). */
const OPENS_WITH: Record<DrillFormId, RegExp> = {
  'spell-catcher': /Spell Catcher/,
  'word-volcano': /Word Volcano/,
  'word-relay-race': /Word Relay Race/,
  'letter-invasion': /Alien Word Invasion/,
  'word-search': /Find 3 words hidden in the grid/,
  unscramble: /Tap a letter to place it in the next empty slot/,
  quiz: /Question 1 of 3/,
};

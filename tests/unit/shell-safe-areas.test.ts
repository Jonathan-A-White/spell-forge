// M8 (story 12c, mw-79en7t.34): the safe-area insets sit on the Shell's top and bottom bars, never on body; the bottom
// one has a floor (Android Chrome does not always report its navigation bar); #root carries the background, so the
// area behind the insets is not white. jsdom has no layout, so this reads the stylesheet source.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/index.css', 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of every rule whose selector list names `selector` exactly (not a longer selector that contains it). */
function declarationsOf(selector: string): string {
  const out: string[] = [];
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors.split(',').some((s) => s.trim() === selector)) out.push(body);
  }
  return out.join('\n');
}

describe('safe areas (M8)', () => {
  it('puts no inset on body', () => {
    const body = declarationsOf('body');
    expect(body).not.toBe('');
    expect(body).not.toMatch(/safe-area-inset/);
  });

  it("gives the Shell's top bar the top inset and its bottom bar the bottom inset", () => {
    expect(declarationsOf('.sf-bar-top')).toMatch(/env\(safe-area-inset-top\)/);
    expect(declarationsOf('.sf-bar-bottom')).toMatch(/env\(safe-area-inset-bottom\)/);
  });

  it('floors the bottom inset at a three-button navigation bar (48 px or more)', () => {
    const bottom = /max\(\s*env\(safe-area-inset-bottom\)\s*,\s*(\d+)px\s*\)/.exec(declarationsOf('.sf-bar-bottom'));
    expect(bottom, 'max(env(safe-area-inset-bottom), <px>)').not.toBeNull();
    expect(Number(bottom![1])).toBeGreaterThanOrEqual(48);
    expect(declarationsOf('.sf-bar-top')).toMatch(/max\(\s*env\(safe-area-inset-top\)\s*,\s*\d+px\s*\)/);
  });

  it('puts the inset on the lowest bar only: nothing else in the stylesheet pads by the bottom inset', () => {
    const users = [...css.matchAll(/([^{}]+)\{([^{}]*safe-area-inset-bottom[^{}]*)\}/g)].map(([, selectors]) => selectors.trim());
    expect(users).toEqual(['.sf-bar-bottom']);
  });

  it('puts the background on #root', () => {
    expect(declarationsOf('#root')).toMatch(/background-color:\s*var\(--sf-background-color/);
  });
});

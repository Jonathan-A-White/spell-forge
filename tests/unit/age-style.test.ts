// mw-79en7t.78 (Kestrel look C): the look follows the learner's age: young under 10, teen from 10, unknown when the tutor
// has not learned it. The Shell sets data-sf-age from the open learner; the theme engine keeps a set of tokens for each look.
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProfile, learn } from 'learn-kit/learner';
import { AGE_STYLES, ageStyle, ageStyleOf } from '../../src/look/age-style';
import { themeEngine } from '../../src/themes/engine';
import { Shell } from '../../src/shell/Shell';
import { AppProvider } from '../../src/shell/app-context';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { DEFAULT_SETTINGS } from '../../src/accessibility/defaults';

const withAge = (age: number) => learn(emptyProfile(), { field: 'age', value: age, turn: 't1', when: 1 }).profile;

describe('ageStyle', () => {
  it('gives young under 10', () => {
    for (const age of [3, 7, 9, 9.5]) expect(ageStyle(age)).toBe('young');
  });

  it('gives teen at 10 and over', () => {
    for (const age of [10, 13, 14, 40]) expect(ageStyle(age)).toBe('teen');
  });

  it('gives unknown for a missing or unreadable age', () => {
    expect(ageStyle(undefined)).toBe('unknown');
    expect(ageStyle(Number.NaN)).toBe('unknown');
    expect(ageStyle(-1)).toBe('unknown');
  });

  it('reads the age from what the tutor knows of the learner', () => {
    expect(ageStyleOf(withAge(8))).toBe('young');
    expect(ageStyleOf(withAge(13))).toBe('teen');
    expect(ageStyleOf(emptyProfile())).toBe('unknown');
    expect(ageStyleOf(undefined)).toBe('unknown');
  });
});

describe('the theme engine, per age', () => {
  afterEach(() => document.documentElement.removeAttribute('style'));

  it('has tokens for each look, and sets them as custom properties', () => {
    for (const look of AGE_STYLES) {
      const tokens = themeEngine.getAgeTokens(look);
      expect(Object.keys(tokens).length).toBeGreaterThan(0);
      for (const name of Object.keys(tokens)) expect(name).toMatch(/^--sf-/);
    }
    themeEngine.applyAgeTokens('teen');
    const radius = Object.keys(themeEngine.getAgeTokens('teen'))[0];
    expect(document.documentElement.style.getPropertyValue(radius)).toBe(themeEngine.getAgeTokens('teen')[radius]);
    expect(themeEngine.getAgeTokens('young')[radius]).not.toBe(themeEngine.getAgeTokens('teen')[radius]);
  });
});

describe('the Shell sets data-sf-age', () => {
  async function openAs(learnerProfile?: ReturnType<typeof withAge>) {
    cleanup();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
    await db.delete();
    await db.open();
    await profileRepo.create({
      name: 'Rowan',
      avatar: 'dragon-forge-1',
      themeId: 'dragon-forge',
      createdAt: new Date(),
      settings: { ...DEFAULT_SETTINGS },
      status: 'active',
      ...(learnerProfile ? { learner: learnerProfile } : {}),
    });
    render(createElement(AppProvider, null, createElement(Shell)));
    await screen.findByText(/Hey, Rowan!/);
  }

  beforeEach(() => document.documentElement.removeAttribute('style'));
  afterEach(cleanup);

  it.each([
    ['young', 8],
    ['teen', 13],
  ] as const)('is %s for a learner of %i', async (look, age) => {
    await openAs(withAge(age));
    expect(document.querySelector('[data-shell]')?.getAttribute('data-sf-age')).toBe(look);
  });

  it('is unknown when the tutor has not learned the age', async () => {
    await openAs();
    expect(document.querySelector('[data-shell]')?.getAttribute('data-sf-age')).toBe('unknown');
  });
});

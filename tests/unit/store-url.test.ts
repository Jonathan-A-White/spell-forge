// "Get a licence" (12e) opens the store, in the Grown-ups world, and only where there is no licence.
import { createElement, type ComponentType } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { WorldSwitch } from '../../src/shell/WorldSwitch';
import { STORE_URL } from '../../src/shell/store';
import { setLicenceStatus } from '../../src/shell/licence-gate';
import type { WorldScreens } from '../../src/shell/world-screens';

const stub = (words: string): ComponentType<{ view: string | null }> => () => createElement('p', null, words);
const worlds: WorldScreens = {
  'front-door': stub('front door'),
  spelling: stub('spelling'),
  maths: stub('maths'),
  'grown-ups': stub('grown-ups'),
};
const CHECKED_AT = '2026-10-24T10:00:00Z';
const NAME = 'Get a licence';

afterEach(() => {
  cleanup();
  setLicenceStatus(undefined);
});

describe('STORE_URL', () => {
  it('is the provisional store address (the Governor confirms it)', () => {
    expect(STORE_URL).toBe('https://store.allmymind.org');
  });
});

describe('Get a licence', () => {
  it('opens STORE_URL in the Grown-ups world when there is no licence', () => {
    setLicenceStatus({ state: 'none', checkedAt: CHECKED_AT });
    render(createElement(WorldSwitch, { route: '/grown-ups/settings', worlds }));
    const link = screen.getByRole('link', { name: NAME });
    expect(link.getAttribute('href')).toBe(STORE_URL);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('is not shown in the other worlds', () => {
    setLicenceStatus({ state: 'none', checkedAt: CHECKED_AT });
    render(createElement(WorldSwitch, { route: '/spelling/practice', worlds }));
    expect(screen.queryByRole('link', { name: NAME })).toBeNull();
  });

  it('is not shown with a licence', () => {
    setLicenceStatus({ state: 'held', outpoint: { txid: 'ab', vout: 0 }, collection: 'spell-forge', checkedAt: CHECKED_AT });
    render(createElement(WorldSwitch, { route: '/grown-ups/settings', worlds }));
    expect(screen.queryByRole('link', { name: NAME })).toBeNull();
  });

  it('is not shown before the licence is known (today: nothing reads the chain)', () => {
    render(createElement(WorldSwitch, { route: '/grown-ups/settings', worlds }));
    expect(screen.queryByRole('link', { name: NAME })).toBeNull();
  });
});

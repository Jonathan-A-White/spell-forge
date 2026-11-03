// "Get a licence" (mw-79en7t.85): the store at store.allmymind.org does not exist (NXDOMAIN), so until the store is decided
// (mw-6ww.111) the Grown-ups world says plainly that getting a licence is coming soon, and opens nothing.
import { createElement, type ComponentType } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { WorldSwitch } from '../../src/shell/WorldSwitch';
import { Licence } from '../../src/worlds/grown-ups/Licence';
import { LICENCE_SOON } from '../../src/shell/store';
import { setLicenceStatus } from '../../src/shell/licence-gate';
import type { licence } from 'bsv-kit/bsv';
import type { WorldScreens } from '../../src/shell/world-screens';

const stub = (words: string): ComponentType<{ view: string | null }> => () => createElement('p', null, words);
const worlds: WorldScreens = {
  'front-door': stub('front door'),
  spelling: stub('spelling'),
  maths: stub('maths'),
  'grown-ups': stub('grown-ups'),
};
const CHECKED_AT = '2026-10-24T10:00:00Z';
const NONE: licence.LicenceStatus = { state: 'none', checkedAt: CHECKED_AT };
const COMING_SOON = 'Getting a licence: coming soon.';

afterEach(() => {
  cleanup();
  setLicenceStatus(undefined);
});

function noLinkToAStore(container: HTMLElement) {
  expect(screen.queryByRole('link', { name: /licence/i })).toBeNull();
  expect(container.querySelectorAll('a[href*="allmymind.org"]')).toHaveLength(0);
  expect(container.querySelectorAll('a[target="_blank"]')).toHaveLength(0);
}

describe('Get a licence', () => {
  it('says the line is coming soon, in Lampas\'s words', () => {
    expect(LICENCE_SOON).toBe(COMING_SOON);
  });

  it('in the Grown-ups world, with no licence, is the coming-soon line and no link', () => {
    setLicenceStatus(NONE);
    const { container } = render(createElement(WorldSwitch, { route: '/grown-ups/settings', worlds }));
    expect(screen.getByText(COMING_SOON)).toBeTruthy();
    noLinkToAStore(container);
  });

  it('in the Licence section, beside Buy, is the coming-soon line and no link', () => {
    const { container } = render(createElement(Licence, { getKey: async () => undefined, check: async () => NONE }));
    expect(screen.getByRole('button', { name: 'Buy' })).toBeTruthy();
    expect(screen.getByText(COMING_SOON)).toBeTruthy();
    noLinkToAStore(container);
  });

  it('is not shown in the other worlds', () => {
    setLicenceStatus(NONE);
    render(createElement(WorldSwitch, { route: '/spelling/practice', worlds }));
    expect(screen.queryByText(COMING_SOON)).toBeNull();
  });

  it('is not shown with a licence', () => {
    setLicenceStatus({ state: 'held', outpoint: { txid: 'ab', vout: 0 }, collection: 'spell-forge', checkedAt: CHECKED_AT });
    render(createElement(WorldSwitch, { route: '/grown-ups/settings', worlds }));
    expect(screen.queryByText(COMING_SOON)).toBeNull();
  });

  it('is not shown before the licence is known (today: nothing reads the chain)', () => {
    render(createElement(WorldSwitch, { route: '/grown-ups/settings', worlds }));
    expect(screen.queryByText(COMING_SOON)).toBeNull();
  });
});

// mw-79en7t.67, mw-79en7t.82: where the app opens when nothing says where. It is the door (worlds.ts WORLD_ENTRY['front-door']) for everyone,
// whatever the old 'sf-tutor' key holds; only a licence known to be missing lands on Home (the tutor cannot talk). A kept screen still wins.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { licence } from 'bsv-kit/bsv';
import { DOOR_VIEW, landingView } from '../../src/shell/landing';
import { licenceState, setLicenceStatus } from '../../src/shell/licence-gate';
import { forgetTrail, restoreLastRoute } from '../../src/shell/last-route';

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  forgetTrail();
});
afterEach(() => {
  localStorage.clear();
  setLicenceStatus(undefined);
});

describe('where the app opens', () => {
  it('is the door, with no setting touched', () => {
    expect(DOOR_VIEW).toBe('door');
    expect(landingView()).toBe('door');
  });

  it("is the door whatever the old 'sf-tutor' key holds", () => {
    localStorage.setItem('sf-tutor', '0');
    expect(landingView()).toBe('door');
    localStorage.setItem('sf-tutor', '1');
    expect(landingView()).toBe('door');
  });

  it('is the door while the licence is unknown or held, and Home once it is known to be missing', () => {
    expect(licenceState()).toBe('unknown');
    expect(landingView()).toBe('door');
    setLicenceStatus({ state: 'held' } as licence.LicenceStatus);
    expect(landingView()).toBe('door');
    setLicenceStatus({ state: 'none' } as licence.LicenceStatus);
    expect(licenceState()).toBe('unlicensed');
    expect(landingView()).toBe('home');
  });

  it('is what a reopen with nothing kept lands on, and a kept screen wins', () => {
    expect(restoreLastRoute('door')).toBe('door');
    localStorage.setItem('sf-last-route', '/spelling/progress');
    forgetTrail();
    expect(restoreLastRoute('door')).toBe('progress');
  });

});

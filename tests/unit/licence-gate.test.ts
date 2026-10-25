// The licence gate (12e): the app is useful with no licence; only the tutor and the grind calls are refused, each with the one line.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { door } from 'bsv-kit/bsv';
import { VIEWS, WORLDS, viewRoute } from '../../src/shell/worlds';
import {
  LicenceRequiredError,
  NO_LICENCE_LINE,
  gateGrind,
  gateRoute,
  licenceState,
  setLicenceStatus,
} from '../../src/shell/licence-gate';
import { sendGrist } from '../../src/grist';

const CHECKED_AT = '2026-10-24T10:00:00Z';
const held = { state: 'held', outpoint: { txid: 'ab', vout: 0 }, collection: 'spell-forge', checkedAt: CHECKED_AT } as const;
const none = { state: 'none', checkedAt: CHECKED_AT } as const;

/** Every route of worlds.ts, and each world's own front (Maths has no screen yet). */
const ROUTES = [...VIEWS.map((v) => v.route), ...WORLDS.map((w) => `/${w.id}`)];
const TUTOR = viewRoute('tutor');

afterEach(() => setLicenceStatus(undefined));

describe('licenceState', () => {
  it('is unknown until a licence reading is handed over, and is read from bsv-kit licence status', () => {
    expect(licenceState()).toBe('unknown');
    setLicenceStatus(held);
    expect(licenceState()).toBe('licensed');
    setLicenceStatus(none);
    expect(licenceState()).toBe('unlicensed');
    setLicenceStatus({ state: 'revoked', outpoint: held.outpoint, collection: 'spell-forge', checkedAt: CHECKED_AT });
    expect(licenceState()).toBe('unlicensed');
    setLicenceStatus({ state: 'indexing', txid: 'ab', broadcastAt: CHECKED_AT, checkedAt: CHECKED_AT });
    expect(licenceState()).toBe('unlicensed');
  });
});

describe('with no licence', () => {
  it('opens every world and every game, and refuses only the tutor', () => {
    setLicenceStatus(none);
    const refused = ROUTES.filter((route) => !gateRoute(route).allowed);
    expect(refused).toEqual([TUTOR]);
    expect(ROUTES.length).toBeGreaterThan(25);
    expect(ROUTES).toContain(viewRoute('practice-games'));
  });

  it('refuses the tutor and the grind calls, each with the one line', () => {
    setLicenceStatus(none);
    expect(gateRoute(TUTOR)).toEqual({ allowed: false, line: NO_LICENCE_LINE });
    expect(gateGrind()).toEqual({ allowed: false, line: NO_LICENCE_LINE });
  });

  it('refuses a grind sent through sendGrist before anything goes out', async () => {
    setLicenceStatus(none);
    const fetchImpl = vi.fn();
    const call = sendGrist({ key: {} as never, input: {}, header: { app: 'spell-forge', kind: 'tutor-turn', v: '1' }, fetchImpl });
    await expect(call).rejects.toBeInstanceOf(LicenceRequiredError);
    await expect(call).rejects.toMatchObject({ message: door.LICENCE_REQUIRED });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('with a licence', () => {
  it('refuses nothing', () => {
    setLicenceStatus(held);
    expect(ROUTES.filter((route) => !gateRoute(route).allowed)).toEqual([]);
    expect(gateGrind()).toEqual({ allowed: true });
  });
});

describe('before the licence is known', () => {
  it('refuses nothing: the mill still decides, as it did before the gate', () => {
    expect(ROUTES.filter((route) => !gateRoute(route).allowed)).toEqual([]);
    expect(gateGrind()).toEqual({ allowed: true });
  });
});

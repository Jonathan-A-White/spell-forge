// mw-79en7t.51 (Kestrel 17c): the Licence section of the Grown-ups screen. Buy reads the licence through bsv-kit's
// licence path and hands the reading to the one function that knows (licenceState); Get a licence opens the store;
// with a licence Buy shows "licensed".
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrivateKey } from '@bsv/sdk';
import { licence } from 'bsv-kit/bsv';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { checkLicence } from '../../src/grist';
import { licenceState, setLicenceStatus } from '../../src/shell/licence-gate';
import { STORE_URL } from '../../src/shell/store';
import { Licence } from '../../src/worlds/grown-ups/Licence';

const CHECKED_AT = '2026-10-25T10:00:00Z';
const held: licence.LicenceStatus = { state: 'held', outpoint: { txid: 'ab', vout: 0 }, collection: 'spell-forge', checkedAt: CHECKED_AT };
const none: licence.LicenceStatus = { state: 'none', checkedAt: CHECKED_AT };

const key = PrivateKey.fromRandom();
const getKey = async () => key;

afterEach(() => {
  cleanup();
  setLicenceStatus(undefined);
});

describe('Buy', () => {
  it("reads the licence for this device's key through the bsv-kit path and takes the reading as the licence state", async () => {
    const check = vi.fn(async () => held);
    render(<Licence getKey={getKey} check={check} />);
    expect(licenceState()).toBe('unknown');
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    expect(await screen.findByRole('button', { name: 'licensed' })).toBeTruthy();
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith(key);
    expect(licenceState()).toBe('licensed');
  });

  it('the default path is the kit: a key with no mint on the (fake) chain reads as no licence', async () => {
    const reader = new licence.FakeChainReader();
    const status = await checkLicence(key, { reader, now: () => Date.parse(CHECKED_AT) });
    expect(status.state).toBe('none');
  });

  it('with no licence found, says so plainly, stays Buy, and the licence state is unlicensed', async () => {
    render(<Licence getKey={getKey} check={async () => none} />);
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringMatching(/no licence/i));
    expect(screen.getByRole('button', { name: 'Buy' })).toBeTruthy();
    expect(licenceState()).toBe('unlicensed');
  });

  it('when the check cannot be made, says so and leaves the licence state alone', async () => {
    render(<Licence getKey={getKey} check={async () => Promise.reject(new Error('offline'))} />);
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringMatching(/internet/i));
    expect(licenceState()).toBe('unknown');
  });

  it('with no device key yet, does not check and points to the key', async () => {
    const check = vi.fn(async () => held);
    render(<Licence getKey={async () => undefined} check={check} />);
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringMatching(/key/i));
    expect(check).not.toHaveBeenCalled();
  });
});

describe('Get a licence', () => {
  it("opens the store's address in a new tab, beside Buy", () => {
    render(<Licence getKey={getKey} check={async () => none} />);
    const link = screen.getByRole('link', { name: 'Get a licence' });
    expect(link.getAttribute('href')).toBe(STORE_URL);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(screen.getByRole('button', { name: 'Buy' })).toBeTruthy();
  });
});

describe('with a licence', () => {
  it('Buy shows "licensed", cannot be pressed, and there is nothing left to get', () => {
    setLicenceStatus(held);
    render(<Licence getKey={getKey} check={async () => held} />);
    const button = screen.getByRole('button', { name: 'licensed' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Buy' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Get a licence' })).toBeNull();
  });
});

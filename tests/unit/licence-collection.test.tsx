// mw-79en7t.87: Buy and the tutor's door must count the same licence. The backend (POSTERN_APPS) maps this app's key
// to the collection spellforge-leaderboard-testnet, so that is where Buy looks; a licence minted only in 'postern'
// (a cockpit key's collection) is not this app's, and must not read as held.
import { afterEach, describe, expect, it } from 'vitest';
import { PrivateKey, Script, Transaction, Utils } from '@bsv/sdk';
import { licence } from 'bsv-kit/bsv';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LICENCE_COLLECTION, checkLicence } from '../../src/grist';
import { chainConfig } from '../../src/bsv/config';
import { licenceState, setLicenceStatus } from '../../src/shell/licence-gate';
import { Licence } from '../../src/worlds/grown-ups/Licence';

const NOW = '2026-11-04T04:00:00Z';
const text = (s: string) => Utils.toArray(s, 'utf8');

/** A transaction with one nftgate mint record naming `holder` in `collection`, the way the chain holds one. */
function mintHex(collection: string, holder: string): string {
  const payload = text(JSON.stringify({ kind: 'mint', collection, holder }));
  const script = new Script([
    { op: 0x00 },
    { op: 0x6a },
    { op: 7, data: text('nftgate') },
    { op: 1, data: [2] },
    { op: 1, data: text('M') },
    { op: 0x4c, data: payload },
  ]);
  const tx = new Transaction();
  tx.addOutput({ lockingScript: script, satoshis: 0 });
  return tx.toHex();
}

function chainWith(key: PrivateKey, ...collections: string[]): licence.FakeChainReader {
  const reader = new licence.FakeChainReader();
  const address = licence.addressForPublicKey(key.toPublicKey().toString());
  collections.forEach((collection, i) => {
    const hex = mintHex(collection, address);
    reader.addTransaction(address, Transaction.fromHex(hex).id('hex') + '', hex, 100 + i);
  });
  return reader;
}

const run = (key: PrivateKey, reader: licence.FakeChainReader) => checkLicence(key, { reader, now: () => Date.parse(NOW) });

afterEach(() => {
  cleanup();
  setLicenceStatus(undefined);
});

describe('the collection Buy reads', () => {
  it("is the one collection Kestrel names, the app's own", () => {
    expect(LICENCE_COLLECTION).toBe('spellforge-leaderboard-testnet');
    expect(LICENCE_COLLECTION).toBe(chainConfig.collectionId);
  });

  it('a key holding a licence in spellforge-leaderboard-testnet reads held', async () => {
    const key = PrivateKey.fromRandom();
    const status = await run(key, chainWith(key, 'spellforge-leaderboard-testnet'));
    expect(status.state).toBe('held');
  });

  it("a key holding only a licence in 'postern' does not count", async () => {
    const key = PrivateKey.fromRandom();
    const status = await run(key, chainWith(key, 'postern'));
    expect(status.state).toBe('none');
  });

  it('Buy on the licensed phone shows it held, and the tutor stays awake', async () => {
    const key = PrivateKey.fromRandom();
    const reader = chainWith(key, 'spellforge-leaderboard-testnet');
    render(<Licence getKey={async () => key} check={(k) => run(k, reader)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    expect(await screen.findByRole('button', { name: 'licensed' })).toBeTruthy();
    expect(licenceState()).toBe('licensed');
  });

  it("Buy with only a 'postern' licence finds none", async () => {
    const key = PrivateKey.fromRandom();
    const reader = chainWith(key, 'postern');
    render(<Licence getKey={async () => key} check={(k) => run(k, reader)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(licenceState()).toBe('unlicensed');
  });
});

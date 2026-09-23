import { describe, it, expect, vi } from 'vitest';
import { scanRecords } from '../../src/bsv/scan-records';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import type { AddressHistoryEntry } from '../../src/contracts/types';
import fixture from '../fixtures/bsv/scan-history.json';

const txHexByTxid: Record<string, string> = {
  [fixture.recordNewestTxid]: fixture.recordNewestTxHex,
  [fixture.recordOldestTxid]: fixture.recordOldestTxHex,
  [fixture.foreignOpReturnTxid]: fixture.foreignOpReturnTxHex,
  [fixture.plainPaymentTxid]: fixture.plainPaymentTxHex,
};

/** A provider whose getTransactionHex fails for `failingTxids` and tracks concurrency. */
function trackedProvider(options: {
  history: AddressHistoryEntry[];
  failingTxids?: string[];
  hexByTxid?: Record<string, string>;
}): ChainProvider & { maxConcurrent: number; hexCallOrder: string[] } {
  const failing = new Set(options.failingTxids ?? []);
  const hexByTxid = options.hexByTxid ?? txHexByTxid;
  const state = { active: 0, maxConcurrent: 0, hexCallOrder: [] as string[] };

  return {
    getUtxos: vi.fn(),
    broadcast: vi.fn(),
    getAddressHistory: vi.fn().mockResolvedValue(options.history),
    getTransactionHex: vi.fn(async (txid: string) => {
      state.active += 1;
      state.maxConcurrent = Math.max(state.maxConcurrent, state.active);
      state.hexCallOrder.push(txid);
      await new Promise((resolve) => setTimeout(resolve, 5));
      state.active -= 1;
      if (failing.has(txid)) {
        throw new Error(`could not fetch ${txid}`);
      }
      return hexByTxid[txid];
    }),
    get maxConcurrent() {
      return state.maxConcurrent;
    },
    get hexCallOrder() {
      return state.hexCallOrder;
    },
  } as ChainProvider & { maxConcurrent: number; hexCallOrder: string[] };
}

describe('scanRecords', () => {
  it('returns the two records newest first, a could-not-read entry for a fetch failure and one for a foreign OP_RETURN, and a payment entry for a plain payment', async () => {
    const provider = trackedProvider({
      history: fixture.history as AddressHistoryEntry[],
      failingTxids: [fixture.throwsTxid],
    });

    const entries = await scanRecords(provider, fixture.anchorAddress);

    expect(provider.getTransactionHex).toHaveBeenCalledTimes(5);
    expect(provider.maxConcurrent).toBe(1);
    expect(provider.hexCallOrder).toEqual([
      fixture.recordNewestTxid,
      fixture.throwsTxid,
      fixture.foreignOpReturnTxid,
      fixture.recordOldestTxid,
      fixture.plainPaymentTxid,
    ]);

    expect(entries).toHaveLength(5);

    expect(entries[0]).toMatchObject({ txid: fixture.recordNewestTxid, vout: 0, version: 1 });
    expect(entries[0]).toHaveProperty('decoded', fixture.recordNewestPayload);

    expect(entries[1]).toEqual({
      txid: fixture.throwsTxid,
      height: 400000,
      couldNotRead: true,
      reason: 'could not fetch the transaction',
    });

    expect(entries[2]).toEqual({
      txid: fixture.foreignOpReturnTxid,
      height: 300000,
      couldNotRead: true,
      reason: fixture.foreignOpReturnReason,
    });

    expect(entries[3]).toMatchObject({ txid: fixture.recordOldestTxid, vout: 0, version: 1 });
    expect(entries[3]).toHaveProperty('decoded', fixture.recordOldestPayload);

    expect(entries[4]).toEqual({
      txid: fixture.plainPaymentTxid,
      height: 100000,
      payment: true,
      direction: 'received',
      satoshis: fixture.plainPaymentSatoshis,
    });
  });

  it('fetches only `limit` transactions, the newest ones first', async () => {
    const provider = trackedProvider({
      history: fixture.history as AddressHistoryEntry[],
      failingTxids: [fixture.throwsTxid],
    });

    await scanRecords(provider, fixture.anchorAddress, { limit: 2 });

    expect(provider.getTransactionHex).toHaveBeenCalledTimes(2);
    expect(provider.hexCallOrder).toEqual([fixture.recordNewestTxid, fixture.throwsTxid]);
  });

  it('sorts an unconfirmed entry (height 0) first, ahead of any confirmed height', async () => {
    const provider = trackedProvider({
      history: fixture.unconfirmedFirstHistory as AddressHistoryEntry[],
      hexByTxid: {
        [fixture.confirmedTxid]: fixture.plainPaymentTxHex,
        [fixture.unconfirmedTxid]: fixture.plainPaymentTxHex,
      },
    });

    await scanRecords(provider, fixture.anchorAddress);

    expect(provider.hexCallOrder).toEqual([fixture.unconfirmedTxid, fixture.confirmedTxid]);
  });

  it('lists a record with an unsupported version rather than dropping it', async () => {
    const provider = trackedProvider({
      history: fixture.unsupportedVersionHistory as AddressHistoryEntry[],
      hexByTxid: { [fixture.unsupportedVersionTxid]: fixture.unsupportedVersionTxHex },
    });

    const entries = await scanRecords(provider, fixture.anchorAddress);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      txid: fixture.unsupportedVersionTxid,
      version: 2,
      decoded: { unsupportedVersion: 2 },
    });
  });

  it('returns an empty list for an anchor with no history', async () => {
    const provider = trackedProvider({ history: [] });

    const entries = await scanRecords(provider, fixture.anchorAddress);

    expect(entries).toEqual([]);
    expect(provider.getTransactionHex).not.toHaveBeenCalled();
  });

  it('merges the unconfirmed history in, ahead of confirmed entries, calling the unconfirmed variant once', async () => {
    const confirmedTxid = fixture.recordOldestTxid;
    const unconfirmedTxid = fixture.recordNewestTxid;
    const getUnconfirmedAddressHistory = vi.fn().mockResolvedValue([{ txid: unconfirmedTxid, height: 0 }]);
    const provider: ChainProvider = {
      getUtxos: vi.fn(),
      broadcast: vi.fn(),
      getAddressHistory: vi.fn().mockResolvedValue([{ txid: confirmedTxid, height: 200000 }]),
      getUnconfirmedAddressHistory,
      getTransactionHex: vi.fn((txid: string) => Promise.resolve(txHexByTxid[txid])),
    };

    const entries = await scanRecords(provider, fixture.anchorAddress);

    expect(getUnconfirmedAddressHistory).toHaveBeenCalledTimes(1);
    expect(getUnconfirmedAddressHistory).toHaveBeenCalledWith(fixture.anchorAddress);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ txid: unconfirmedTxid, height: 0 });
    expect(entries[1]).toMatchObject({ txid: confirmedTxid, height: 200000 });
  });

  it('does not duplicate a txid that appears in both the confirmed and unconfirmed history', async () => {
    const txid = fixture.recordOldestTxid;
    const getUnconfirmedAddressHistory = vi.fn().mockResolvedValue([{ txid, height: 0 }]);
    const provider: ChainProvider = {
      getUtxos: vi.fn(),
      broadcast: vi.fn(),
      getAddressHistory: vi.fn().mockResolvedValue([{ txid, height: 200000 }]),
      getUnconfirmedAddressHistory,
      getTransactionHex: vi.fn((t: string) => Promise.resolve(txHexByTxid[t])),
    };

    const entries = await scanRecords(provider, fixture.anchorAddress);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ txid, height: 200000 });
  });

  it('works when the provider has no unconfirmed history variant at all', async () => {
    const provider = trackedProvider({ history: [{ txid: fixture.recordOldestTxid, height: 200000 }] });

    const entries = await scanRecords(provider, fixture.anchorAddress);

    expect(entries).toHaveLength(1);
  });

  it('reports the anchor spending its own coin as sent, not received with the change amount', async () => {
    const provider = trackedProvider({
      history: [{ txid: fixture.anchorSentTxid, height: 200000 }],
      hexByTxid: { [fixture.anchorSentTxid]: fixture.anchorSentTxHex },
    });

    const entries = await scanRecords(provider, fixture.anchorSentAddress);

    expect(entries).toEqual([
      {
        txid: fixture.anchorSentTxid,
        height: 200000,
        payment: true,
        direction: 'sent',
        satoshis: fixture.anchorSentSatoshis,
      },
    ]);
  });
});

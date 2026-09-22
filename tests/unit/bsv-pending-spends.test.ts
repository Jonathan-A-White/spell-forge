import { describe, it, expect } from 'vitest';
import {
  outpointKey,
  reconcilePendingSpends,
  filterUtxosExcludingPending,
  PENDING_SPEND_TTL_MS,
} from '../../src/bsv/pending-spends';
import type { Utxo } from '../../src/contracts/types';

describe('outpointKey', () => {
  it('joins txid and vout with a colon', () => {
    expect(outpointKey({ txid: 'deadbeef', vout: 2 })).toBe('deadbeef:2');
  });
});

describe('reconcilePendingSpends', () => {
  it('keeps an entry whose spent outpoints still appear in the current UTXO list', () => {
    const entry = { txid: 'T1', outpoints: ['X:1', 'X:2'], createdAt: new Date('2026-09-22T14:00:00Z') };
    const utxos: Utxo[] = [
      { txid: 'X', vout: 1, satoshis: 1 },
      { txid: 'X', vout: 2, satoshis: 49997 },
      { txid: 'Y', vout: 1, satoshis: 49998 },
      { txid: 'Y', vout: 2, satoshis: 1 },
    ];
    const now = new Date('2026-09-22T14:01:00Z');

    const { remaining, dropped } = reconcilePendingSpends([entry], utxos, now);

    expect(remaining).toEqual([entry]);
    expect(dropped).toEqual([]);
  });

  it('drops an entry once none of its spent outpoints appear in the current UTXO list', () => {
    const entry = { txid: 'T1', outpoints: ['X:1', 'X:2'], createdAt: new Date('2026-09-22T14:00:00Z') };
    const utxos: Utxo[] = [
      { txid: 'Y', vout: 1, satoshis: 49998 },
      { txid: 'Y', vout: 2, satoshis: 1 },
    ];
    const now = new Date('2026-09-22T14:01:00Z');

    const { remaining, dropped } = reconcilePendingSpends([entry], utxos, now);

    expect(remaining).toEqual([]);
    expect(dropped).toEqual(['T1']);
  });

  it('drops an entry after 24 hours even if its outpoints still appear', () => {
    const entry = { txid: 'T1', outpoints: ['X:1'], createdAt: new Date('2026-09-21T14:00:00Z') };
    const utxos: Utxo[] = [{ txid: 'X', vout: 1, satoshis: 1 }];
    const now = new Date(entry.createdAt.getTime() + PENDING_SPEND_TTL_MS + 1);

    const { remaining, dropped } = reconcilePendingSpends([entry], utxos, now);

    expect(remaining).toEqual([]);
    expect(dropped).toEqual(['T1']);
  });

  it('keeps an entry that is exactly at the TTL boundary minus one millisecond', () => {
    const entry = { txid: 'T1', outpoints: ['X:1'], createdAt: new Date('2026-09-21T14:00:00Z') };
    const utxos: Utxo[] = [{ txid: 'X', vout: 1, satoshis: 1 }];
    const now = new Date(entry.createdAt.getTime() + PENDING_SPEND_TTL_MS - 1);

    const { remaining, dropped } = reconcilePendingSpends([entry], utxos, now);

    expect(remaining).toEqual([entry]);
    expect(dropped).toEqual([]);
  });
});

describe('filterUtxosExcludingPending', () => {
  it('excludes UTXOs whose outpoint is in a pending entry, and counts them', () => {
    const utxos: Utxo[] = [
      { txid: 'X', vout: 1, satoshis: 1 },
      { txid: 'X', vout: 2, satoshis: 49997 },
      { txid: 'Y', vout: 1, satoshis: 49998 },
      { txid: 'Y', vout: 2, satoshis: 1 },
    ];
    const pending = [{ txid: 'T1', outpoints: ['X:1', 'X:2'], createdAt: new Date() }];

    const { utxos: filtered, excludedCount } = filterUtxosExcludingPending(utxos, pending);

    expect(filtered).toEqual([
      { txid: 'Y', vout: 1, satoshis: 49998 },
      { txid: 'Y', vout: 2, satoshis: 1 },
    ]);
    expect(excludedCount).toBe(2);
  });

  it('excludes nothing and counts zero when there are no pending entries', () => {
    const utxos: Utxo[] = [{ txid: 'Y', vout: 1, satoshis: 49998 }];

    const { utxos: filtered, excludedCount } = filterUtxosExcludingPending(utxos, []);

    expect(filtered).toEqual(utxos);
    expect(excludedCount).toBe(0);
  });
});

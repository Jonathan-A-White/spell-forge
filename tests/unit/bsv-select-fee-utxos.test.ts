import { describe, it, expect } from 'vitest';
import { selectFeeUtxos } from '../../src/bsv/pending-spends';
import type { Utxo } from '../../src/contracts/types';

describe('selectFeeUtxos', () => {
  it('drops every UTXO of exactly 1 satoshi and every excluded outpoint', () => {
    const utxos: Utxo[] = [
      { txid: 'a', vout: 0, satoshis: 1 },
      { txid: 'b', vout: 0, satoshis: 600 },
      { txid: 'c', vout: 1, satoshis: 400 },
    ];

    const result = selectFeeUtxos(utxos, { exclude: [{ txid: 'b', vout: 0 }] });

    expect(result).toEqual([{ txid: 'c', vout: 1, satoshis: 400 }]);
  });

  it('returns every non-1-sat UTXO when nothing is excluded', () => {
    const utxos: Utxo[] = [
      { txid: 'a', vout: 0, satoshis: 1 },
      { txid: 'b', vout: 0, satoshis: 600 },
      { txid: 'c', vout: 1, satoshis: 400 },
    ];

    const result = selectFeeUtxos(utxos, { exclude: [] });

    expect(result).toEqual([
      { txid: 'b', vout: 0, satoshis: 600 },
      { txid: 'c', vout: 1, satoshis: 400 },
    ]);
  });
});

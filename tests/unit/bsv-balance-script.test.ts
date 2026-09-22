// tests/unit/bsv-balance-script.test.ts — The bsv:balance line formatter. No network.

import { describe, it, expect } from 'vitest';
import type { Utxo } from '../../src/contracts/types';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import { formatBalanceLine, reportBalance } from '../../scripts/bsv-balance';

describe('formatBalanceLine', () => {
  it('sums satoshis and counts UTXOs', () => {
    const utxos: Utxo[] = [
      { txid: 'a', vout: 0, satoshis: 600 },
      { txid: 'b', vout: 1, satoshis: 400 },
    ];

    expect(formatBalanceLine('holderA', 'mzHolderAAddress', utxos)).toBe(
      'holderA mzHolderAAddress 1000 sat (2 UTXOs)',
    );
  });

  it('prints zero for an address with no UTXOs', () => {
    expect(formatBalanceLine('issuer', 'mzIssuerAddress', [])).toBe('issuer mzIssuerAddress 0 sat (0 UTXOs)');
  });
});

describe('reportBalance', () => {
  it('fetches UTXOs from the given provider and formats the line', async () => {
    const fakeProvider: ChainProvider = {
      getUtxos: async (address) => {
        expect(address).toBe('mzHolderAAddress');
        return [
          { txid: 'a', vout: 0, satoshis: 600 },
          { txid: 'b', vout: 1, satoshis: 400 },
        ];
      },
      getTransactionHex: async () => {
        throw new Error('not used');
      },
      broadcast: async () => {
        throw new Error('not used');
      },
      getAddressHistory: async () => {
        throw new Error('not used');
      },
    };

    const line = await reportBalance('holderA', 'mzHolderAAddress', fakeProvider);
    expect(line).toBe('holderA mzHolderAAddress 1000 sat (2 UTXOs)');
  });
});

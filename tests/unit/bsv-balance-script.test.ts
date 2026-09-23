// tests/unit/bsv-balance-script.test.ts — The bsv:balance line formatter. No network.

import { describe, it, expect } from 'vitest';
import { LockingScript, P2PKH, Transaction } from '@bsv/sdk';
import type { Utxo } from '../../src/contracts/types';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import { MEASURED_WRITE_SIZE_BYTES } from '../../src/bsv/fuel-status';
import { formatBalanceLine, reportBalance, reportFuel } from '../../scripts/bsv-balance';

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

const HOLDER_ADDRESS = 'mgaL4DEQ3FJAtsgaxdqF1PPSCyjsyR5LxK';
const TXID = 'a'.repeat(64);

function txWithOutput1(script: LockingScript, satoshis: number): Transaction {
  const tx = new Transaction();
  tx.addOutput({ lockingScript: new P2PKH().lock(HOLDER_ADDRESS), satoshis: 1 });
  tx.addOutput({ lockingScript: script, satoshis });
  return tx;
}

function fakeTokenProvider(hex: string): ChainProvider {
  return {
    getUtxos: async () => {
      throw new Error('not used');
    },
    getTransactionHex: async () => hex,
    broadcast: async () => {
      throw new Error('not used');
    },
    getAddressHistory: async () => {
      throw new Error('not used');
    },
  };
}

describe('reportFuel', () => {
  it('prints a Fuel-backed token line with both the cap floor and the at-rate estimate', async () => {
    const fuelScript = new LockingScript().writeBin(new Array(1200).fill(0xab));
    const provider = fakeTokenProvider(txWithOutput1(fuelScript, 10000).toHex());

    const line = await reportFuel(TXID, provider, 1);

    const feePerWrite = Math.ceil((MEASURED_WRITE_SIZE_BYTES / 1000) * 1);
    const estimate = Math.floor(10000 / feePerWrite);
    expect(line).toBe(`${TXID.slice(0, 8)} fuel 10000 sat (>= 5 writes at cap, ~ ${estimate} at the current rate)`);
  });

  it('prints fuel: stand-in for a step 2 token', async () => {
    const standIn = new P2PKH().lock(HOLDER_ADDRESS);
    const provider = fakeTokenProvider(txWithOutput1(standIn, 3).toHex());

    const line = await reportFuel(TXID, provider, 1);

    expect(line).toBe(`${TXID.slice(0, 8)} fuel: stand-in`);
  });
});

// tests/unit/bsv-fuel-status.test.ts — A License-locked token's live Fuel(C) value, read from
// output 1 of its latest transaction through the provider, and the writes-left range it
// implies (mw-yo97u.4). No network.

import { describe, it, expect } from 'vitest';
import { LockingScript, P2PKH, Transaction } from '@bsv/sdk';
import type { ChainProvider } from '../../src/bsv/chain-provider';
import {
  FEE_CAP_SATOSHIS,
  MEASURED_WRITE_SIZE_BYTES,
  formatWritesLeftRange,
  readFuelValue,
  writesLeftRange,
} from '../../src/bsv/fuel-status';

const HOLDER_ADDRESS = 'mgaL4DEQ3FJAtsgaxdqF1PPSCyjsyR5LxK';
const TXID = 'f'.repeat(64);

function txWithOutput1(script: LockingScript, satoshis: number): Transaction {
  const tx = new Transaction();
  tx.addOutput({ lockingScript: new P2PKH().lock(HOLDER_ADDRESS), satoshis: 1 }); // output 0: the License
  tx.addOutput({ lockingScript: script, satoshis });
  return tx;
}

function fakeProvider(hex: string): ChainProvider {
  return {
    getUtxos: async () => {
      throw new Error('not used');
    },
    getTransactionHex: async (txid: string) => {
      expect(txid).toBe(TXID);
      return hex;
    },
    broadcast: async () => {
      throw new Error('not used');
    },
    getAddressHistory: async () => {
      throw new Error('not used');
    },
  };
}

describe('readFuelValue', () => {
  it('reads a real Fuel(C) output 1 as its live satoshis', async () => {
    const fuelScript = new LockingScript().writeBin(new Array(1200).fill(0xab));
    const provider = fakeProvider(txWithOutput1(fuelScript, 10000).toHex());

    const value = await readFuelValue(TXID, provider);

    expect(value).toEqual({ kind: 'fuel', satoshis: 10000 });
  });

  it("reads a step 2 token's P2PKH stand-in as 'stand-in'", async () => {
    const standIn = new P2PKH().lock(HOLDER_ADDRESS);
    const provider = fakeProvider(txWithOutput1(standIn, 3).toHex());

    const value = await readFuelValue(TXID, provider);

    expect(value).toEqual({ kind: 'stand-in' });
  });
});

describe('writesLeftRange', () => {
  it('floors at FEE_CAP and estimates from the measured write size at the configured rate', () => {
    expect(FEE_CAP_SATOSHIS).toBe(2000);

    const range = writesLeftRange(10000, 1);

    expect(range.floor).toBe(5);
    const feePerWrite = Math.ceil((MEASURED_WRITE_SIZE_BYTES / 1000) * 1);
    expect(range.estimate).toBe(Math.floor(10000 / feePerWrite));
    expect(formatWritesLeftRange(range)).toBe(`>= 5 writes at cap, ~ ${range.estimate} at the current rate`);
  });

  it('scales the estimate with the configured fee rate', () => {
    const slow = writesLeftRange(10000, 1);
    const fast = writesLeftRange(10000, 10);

    expect(fast.estimate).toBeLessThan(slow.estimate);
    expect(fast.floor).toBe(slow.floor); // the cap floor never depends on the fee rate
  });
});

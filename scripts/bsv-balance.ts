// scripts/bsv-balance.ts — Prints each testnet key's balance and UTXO count, then one fuel
// line per License-locked token's txid given on the command line (`npm run bsv:balance --
// <txid>...`): nothing here records which tokens were minted, so the caller names them.

import type { ChainProvider } from '../src/bsv/chain-provider';
import type { Utxo } from '../src/contracts/types';
import type { TestnetKeyEntry } from '../src/bsv/node/testnet-keys';
import { createChainProvider } from '../src/bsv/chain-provider';
import { chainConfig } from '../src/bsv/config';
import { defaultTestnetKeyFilePath, readTestnetKeyFile } from '../src/bsv/node/testnet-keys';
import { formatWritesLeftRange, readFuelValue, writesLeftRange } from '../src/bsv/fuel-status';

export function formatBalanceLine(name: string, address: string, utxos: Utxo[]): string {
  const totalSat = utxos.reduce((sum, u) => sum + u.satoshis, 0);
  return `${name} ${address} ${totalSat} sat (${utxos.length} UTXOs)`;
}

export async function reportBalance(name: string, address: string, provider: ChainProvider): Promise<string> {
  const utxos = await provider.getUtxos(address);
  return formatBalanceLine(name, address, utxos);
}

/**
 * One line for a License-locked token's txid: its live Fuel value and writes-left range read
 * through the provider (output 1 of that transaction), or 'fuel: stand-in' for a step 2 token.
 */
export async function reportFuel(txid: string, provider: ChainProvider, feeRateSatPerKb: number): Promise<string> {
  const shortTxid = txid.slice(0, 8);
  const value = await readFuelValue(txid, provider);
  if (value.kind === 'stand-in') {
    return `${shortTxid} fuel: stand-in`;
  }
  const range = writesLeftRange(value.satoshis, feeRateSatPerKb);
  return `${shortTxid} fuel ${value.satoshis} sat (${formatWritesLeftRange(range)})`;
}

async function run(): Promise<void> {
  const path = defaultTestnetKeyFilePath();
  const file = readTestnetKeyFile(path);
  const provider = createChainProvider(chainConfig);
  const entries: Array<[string, TestnetKeyEntry]> = [
    ['issuer', file.keys.issuer],
    ['holderA', file.keys.holderA],
    ['holderB', file.keys.holderB],
  ];
  for (const [name, entry] of entries) {
    console.log(await reportBalance(name, entry.address, provider));
  }

  const tokenTxids = process.argv.slice(2);
  for (const txid of tokenTxids) {
    console.log(await reportFuel(txid, provider, chainConfig.feeRateSatPerKb));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

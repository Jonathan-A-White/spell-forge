// scripts/bsv-balance.ts — Prints each testnet key's balance and UTXO count. `npm run bsv:balance`.

import type { ChainProvider } from '../src/bsv/chain-provider';
import type { Utxo } from '../src/contracts/types';
import type { TestnetKeyEntry } from '../src/bsv/node/testnet-keys';
import { createChainProvider } from '../src/bsv/chain-provider';
import { chainConfig } from '../src/bsv/config';
import { defaultTestnetKeyFilePath, readTestnetKeyFile } from '../src/bsv/node/testnet-keys';

export function formatBalanceLine(name: string, address: string, utxos: Utxo[]): string {
  const totalSat = utxos.reduce((sum, u) => sum + u.satoshis, 0);
  return `${name} ${address} ${totalSat} sat (${utxos.length} UTXOs)`;
}

export async function reportBalance(name: string, address: string, provider: ChainProvider): Promise<string> {
  const utxos = await provider.getUtxos(address);
  return formatBalanceLine(name, address, utxos);
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
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

// scripts/bsv-keys.ts — Creates the local testnet key file (never overwrites). `npm run bsv:keys`.
// Prints the three addresses and the file path; never a WIF.

import { generateTestnetKey } from '../src/bsv/keys';
import { createTestnetKeyFile, defaultTestnetKeyFilePath } from '../src/bsv/node/testnet-keys';
import type { TestnetKeyEntry } from '../src/bsv/node/testnet-keys';

function generate(): TestnetKeyEntry {
  const key = generateTestnetKey();
  return { wif: key.material, address: key.address };
}

function run(): void {
  const path = defaultTestnetKeyFilePath();
  const file = createTestnetKeyFile(path, generate);
  console.log(`Wrote testnet keys to ${path}`);
  console.log(`  issuer:  ${file.keys.issuer.address}`);
  console.log(`  holderA: ${file.keys.holderA.address}`);
  console.log(`  holderB: ${file.keys.holderB.address}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

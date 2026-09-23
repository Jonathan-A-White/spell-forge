// scripts/bsv-contracts-build.ts — Compiles every contract under src/bsv/contracts/
// (except prototype/ and tests) to src/bsv/contracts/artifacts/<name>.json, committed.
// `npm run bsv:contracts:build`. Requires `sh scripts/bsv-contracts-setup.sh` to have
// been run first (the pinned scryptc binary) and does not itself invoke the compiler
// from npm test, typecheck or lint.

import { ARTIFACTS_DIR, buildContracts, ensureToolchainInstalled, requireScryptc } from '../src/bsv/node/contracts-toolchain';

function run(): void {
  const scryptcPath = requireScryptc();
  ensureToolchainInstalled();
  const artifactPaths = buildContracts(scryptcPath);
  console.log(`Compiled ${artifactPaths.length} contract(s) to ${ARTIFACTS_DIR}:`);
  for (const path of artifactPaths) console.log(`  ${path}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

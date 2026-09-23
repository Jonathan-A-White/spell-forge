// scripts/bsv-contracts-check.ts — Recompiles every contract under src/bsv/contracts/
// into a temp directory and diffs the result against the committed
// src/bsv/contracts/artifacts/<name>.json. Exits 1 on any difference (missing file,
// extra file, or byte mismatch). `npm run bsv:contracts:check`. Requires
// `sh scripts/bsv-contracts-setup.sh` to have been run first.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ARTIFACTS_DIR, compileToTempDir, ensureToolchainInstalled, removeWorkDir, requireScryptc } from '../src/bsv/node/contracts-toolchain';

function committedArtifactNames(): string[] {
  if (!existsSync(ARTIFACTS_DIR)) return [];
  return readdirSync(ARTIFACTS_DIR).filter((name) => name.endsWith('.json')).sort();
}

function run(): void {
  const scryptcPath = requireScryptc();
  ensureToolchainInstalled();

  const { workDir, artifactsDir, sources } = compileToTempDir(scryptcPath);
  let ok: boolean;
  try {
    const freshNames = sources.map((name) => name.replace(/\.ts$/, '.json')).sort();
    const committedNames = committedArtifactNames();

    const missing = freshNames.filter((name) => !committedNames.includes(name));
    const extra = committedNames.filter((name) => !freshNames.includes(name));
    const mismatched: string[] = [];

    for (const name of freshNames) {
      if (!committedNames.includes(name)) continue;
      const fresh = readFileSync(join(artifactsDir, name));
      const committed = readFileSync(join(ARTIFACTS_DIR, name));
      if (!fresh.equals(committed)) mismatched.push(name);
    }

    ok = missing.length === 0 && extra.length === 0 && mismatched.length === 0;
    if (ok) {
      console.log(`OK: ${freshNames.length} artifact(s) match src/bsv/contracts/artifacts/.`);
    } else {
      if (missing.length > 0) console.error(`Missing from src/bsv/contracts/artifacts/: ${missing.join(', ')}`);
      if (extra.length > 0) console.error(`Committed but no longer produced: ${extra.join(', ')}`);
      if (mismatched.length > 0) console.error(`Differ from a fresh compile: ${mismatched.join(', ')}`);
    }
  } finally {
    removeWorkDir(workDir);
  }
  if (!ok) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

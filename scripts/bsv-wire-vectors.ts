// scripts/bsv-wire-vectors.ts — Writes tests/fixtures/bsv/wire-vectors.json, the test vectors of
// docs/bsv-wire-formats.md, from the Node reference. `npm run bsv:vectors`. Deterministic: a
// rerun must leave the file unchanged (git diff --exit-code tests/fixtures/bsv/wire-vectors.json).

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWireVectors } from '../src/bsv/node/wire-vectors';

const FIXTURE_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'bsv', 'wire-vectors.json');

function run(): void {
  const vectors = buildWireVectors();
  writeFileSync(FIXTURE_PATH, `${JSON.stringify(vectors, null, 2)}\n`);
  console.log(
    `Wrote ${FIXTURE_PATH}: ${vectors.commitment.length} commitment, ${vectors.derivation.length} derivation, ` +
      `${vectors.wrap.length} wrap, ${vectors.payload.length} payload, ${vectors.negative.length} negative vectors`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

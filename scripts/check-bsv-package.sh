#!/bin/sh
# scripts/check-bsv-package.sh — Proves packages/bsv installs and loads as a plain npm
# dependency (mw-1589l.1). `npm run test:bsv:package`
#
# Packs spell-forge-bsv (npm run bsv:pack), scaffolds a scratch Vite project in a temp
# dir, installs the tarball, imports every documented entry point, builds the scratch
# project with Vite, and runs one vitest test that round-trips a record through the
# installed package. Exits non-zero on the first failure.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PKG_DIR="$REPO_ROOT/packages/bsv"

echo "== Building and packing spell-forge-bsv =="
( cd "$REPO_ROOT" && npm run bsv:pack --silent )

TARBALL="$(cd "$PKG_DIR" && ls spell-forge-bsv-*.tgz | sort -V | tail -n1)"
TARBALL_PATH="$PKG_DIR/$TARBALL"
[ -f "$TARBALL_PATH" ] || { echo "No tarball found at $TARBALL_PATH" >&2; exit 1; }

WORK_DIR="$(mktemp -d)"
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

echo "== Scaffolding a scratch Vite project at $WORK_DIR =="
mkdir -p "$WORK_DIR/src"

cat > "$WORK_DIR/package.json" <<'EOF'
{
  "name": "check-bsv-package",
  "private": true,
  "version": "0.0.0",
  "type": "module"
}
EOF

cat > "$WORK_DIR/vite.config.js" <<'EOF'
import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    outDir: 'build',
    lib: {
      entry: 'src/main.js',
      formats: ['es'],
      fileName: () => 'main.js',
    },
  },
});
EOF

# Every entry point the story's Do section names: keys, the testnet WhatsOnChain provider,
# record encode/decode/find, License lookup and mint, tx build/broadcast helpers, and the
# re-exported @bsv/sdk EncryptedMessage.
cat > "$WORK_DIR/src/entry-points.js" <<'EOF'
import {
  generateTestnetKey,
  WhatsOnChainProvider,
  chainConfig,
  encodeRecordPayloadV1,
  encodeRecordScript,
  decodeRecordScript,
  decodeRecordPayload,
  findRecordsInTransaction,
  readLicenseState,
  mintContractLicenseToken,
  buildContractMintTransaction,
  buildRecordTransaction,
  writeRecord,
  buildSendTransaction,
  sendSats,
  EncryptedMessage,
} from 'spell-forge-bsv';

export const entryPoints = {
  generateTestnetKey,
  WhatsOnChainProvider,
  chainConfig,
  encodeRecordPayloadV1,
  encodeRecordScript,
  decodeRecordScript,
  decodeRecordPayload,
  findRecordsInTransaction,
  readLicenseState,
  mintContractLicenseToken,
  buildContractMintTransaction,
  buildRecordTransaction,
  writeRecord,
  buildSendTransaction,
  sendSats,
  EncryptedMessage,
};
EOF

cat > "$WORK_DIR/src/main.js" <<'EOF'
import { entryPoints } from './entry-points.js';
console.log(Object.keys(entryPoints));
EOF

cat > "$WORK_DIR/src/record-roundtrip.test.js" <<'EOF'
import { describe, expect, it } from 'vitest';
import { encodeRecordPayloadV1, encodeRecordScript, decodeRecordScript, decodeRecordPayload } from 'spell-forge-bsv';

describe('spell-forge-bsv record round trip', () => {
  it('encodes and decodes a record through the installed package', () => {
    const payload = { text: 'hello from the installed package', ts: '2026-09-24T00:00:00.000Z' };
    const payloadBytes = encodeRecordPayloadV1(payload);
    const script = encodeRecordScript(payloadBytes);

    const decodedScript = decodeRecordScript(script);
    expect(decodedScript).not.toBeNull();

    const decodedPayload = decodeRecordPayload(decodedScript.version, decodedScript.payloadBytes);
    expect(decodedPayload).toEqual(payload);
  });
});
EOF

echo "== Installing the tarball and build tooling =="
npm install --silent --no-audit --no-fund --prefix "$WORK_DIR" "$TARBALL_PATH" vite@^7.3.1 vitest@^4.0.18

echo "== Building the scratch project with Vite =="
( cd "$WORK_DIR" && npx vite build )

echo "== Running the record round-trip test =="
( cd "$WORK_DIR" && npx vitest run )

echo "== OK: spell-forge-bsv installs, imports every documented entry point, builds and round-trips a record =="

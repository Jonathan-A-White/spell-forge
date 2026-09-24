#!/bin/sh
# scripts/bsv-pack.sh — Builds packages/bsv/dist from src/bsv and packs it into a tarball
# (mw-1589l.1). `npm run bsv:pack`
#
# tsc (tsconfig.lib.json) compiles the ~20 plain files (keys, providers, record
# encode/decode, the P2PKH and contract-locked token builders) to ESM .js + .d.ts.
# src/bsv/contracts/ is excluded from that compile: license.ts, fuel.ts and bridge/*.ts
# use scrypt-ts's legacy decorators, and license-contract.ts loads the bridge lazily via
# import.meta.glob('./contracts/bridge/license-bridge.ts', a literal path the app's own
# Vite build resolves at build time, never at tsc time (see tsconfig.app.json's own
# exclude of the same directory, and the comment above licenseBridgeLoaders in
# license-contract.ts). So this script copies contracts/ (license.ts, fuel.ts, bridge/,
# artifacts/) as source into dist/contracts/, unchanged — a consumer's own Vite build
# resolves the same glob against these copied files exactly as SpellForge's own Vite
# build already does.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PKG_DIR="$REPO_ROOT/packages/bsv"
CONTRACTS_SRC="$REPO_ROOT/src/bsv/contracts"
CONTRACTS_DIST="$PKG_DIR/dist/contracts"

rm -rf "$PKG_DIR/dist"

( cd "$REPO_ROOT" && npx tsc --project tsconfig.lib.json )
node "$SCRIPT_DIR/bsv-fix-dist-extensions.mjs" "$PKG_DIR/dist"

mkdir -p "$CONTRACTS_DIST/bridge" "$CONTRACTS_DIST/artifacts"
cp "$CONTRACTS_SRC/license.ts" "$CONTRACTS_SRC/fuel.ts" "$CONTRACTS_DIST/"
cp "$CONTRACTS_SRC/bridge/"*.ts "$CONTRACTS_DIST/bridge/"
cp "$CONTRACTS_SRC/artifacts/"*.json "$CONTRACTS_DIST/artifacts/"

rm -f "$PKG_DIR"/spell-forge-bsv-*.tgz
( cd "$PKG_DIR" && npm pack --silent )

echo "Packed: $(cd "$PKG_DIR" && ls spell-forge-bsv-*.tgz)"

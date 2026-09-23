#!/bin/sh
# scripts/bsv-contracts-setup.sh — Installs the pinned sCrypt compiler (scryptc) under
# the user's home, no sudo, and installs the isolated contracts toolchain's own
# node_modules (see src/bsv/contracts/toolchain/README.md). Idempotent: safe to run
# repeatedly. Prints the installed compiler version. `sh scripts/bsv-contracts-setup.sh`
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTRACTS_DIR="$REPO_ROOT/src/bsv/contracts"

COMPILER_VERSION="$(cat "$CONTRACTS_DIR/COMPILER" | tr -d '[:space:]')"
INSTALL_DIR="$HOME/.config/spell-forge/scrypt-compiler"
BIN_PATH="$INSTALL_DIR/scryptc"

platform_suffix() {
  case "$(uname -s)" in
    Linux)
      case "$(uname -m)" in
        aarch64|arm64) echo "Linux-aarch64" ;;
        *) echo "Linux-x86_64" ;;
      esac
      ;;
    Darwin) echo "macOS-x86_64" ;;
    *) echo "unsupported platform: $(uname -s)" >&2; exit 1 ;;
  esac
}

installed_version() {
  if [ -x "$BIN_PATH" ]; then
    "$BIN_PATH" version 2>/dev/null | sed -n 's/^Version: \([0-9.]*\).*/\1/p'
  fi
}

if [ "$(installed_version)" != "$COMPILER_VERSION" ]; then
  PLATFORM="$(platform_suffix)"
  URL="https://github.com/sCrypt-Inc/compiler_dist/releases/download/v${COMPILER_VERSION}/scryptc-${COMPILER_VERSION}-${PLATFORM}"
  mkdir -p "$INSTALL_DIR"
  curl -fsSL "$URL" -o "$BIN_PATH.tmp"
  chmod +x "$BIN_PATH.tmp"
  mv "$BIN_PATH.tmp" "$BIN_PATH"
fi

# The isolated toolchain (its own TypeScript, for scrypt-cli's transpile step) — see
# src/bsv/contracts/toolchain/README.md. Never touches the app's own node_modules.
( cd "$CONTRACTS_DIR/toolchain" && npm ci --no-audit --no-fund >&2 )

"$BIN_PATH" version

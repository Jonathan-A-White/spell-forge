// src/bsv/node/contracts-toolchain.ts — Shared paths and helpers for the contracts
// build toolchain (scripts/bsv-contracts-build.ts, scripts/bsv-contracts-check.ts,
// scripts/bsv-contracts-setup.sh). Node-only (fs, path, child_process, os): kept out of
// src/bsv/index.ts so the browser bundle never pulls this in.
//
// Two separate toolchains are at play:
//  - the pinned native `scryptc` compiler binary, installed under the user's home by
//    scripts/bsv-contracts-setup.sh (see scryptcBinaryPath below);
//  - an isolated npm project at src/bsv/contracts/toolchain/ that pins its own
//    TypeScript (~5.3, required by scrypt-ts-transpiler) separately from the app's
//    TypeScript 5.9.3. See src/bsv/contracts/toolchain/README.md for why.

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, cpSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { homedir, platform, arch } from 'node:os';
import { join, resolve } from 'node:path';

export const CONTRACTS_DIR = resolve(import.meta.dirname, '../contracts');
export const TOOLCHAIN_DIR = join(CONTRACTS_DIR, 'toolchain');
export const ARTIFACTS_DIR = join(CONTRACTS_DIR, 'artifacts');
export const CONTRACTS_TSCONFIG = join(CONTRACTS_DIR, 'tsconfig.contracts.json');

const COMPILER_INSTALL_DIR = join(homedir(), '.config', 'spell-forge', 'scrypt-compiler');
const SCRYPT_CLI_BIN = join(TOOLCHAIN_DIR, 'node_modules', '.bin', 'scrypt-cli');

/** The pinned scryptc version, from the single-source-of-truth COMPILER file. */
export function compilerVersion(): string {
  return readFileSync(join(CONTRACTS_DIR, 'COMPILER'), 'utf-8').trim();
}

/** Where scripts/bsv-contracts-setup.sh installs the pinned scryptc binary. */
export function scryptcBinaryPath(): string {
  return join(COMPILER_INSTALL_DIR, 'scryptc');
}

/** sCrypt compiler_dist release asset platform suffix for this machine. */
export function compilerDistPlatform(): string {
  const p = platform();
  if (p === 'linux') return arch() === 'arm64' ? 'Linux-aarch64' : 'Linux-x86_64';
  if (p === 'darwin') return 'macOS-x86_64';
  throw new Error(`sCrypt compiler_dist has no release asset for platform '${p}'`);
}

/** Every contract source file directly under src/bsv/contracts/ (non-recursive, so prototype/ and toolchain/ are never seen). */
function contractSourceFiles(): string[] {
  return readdirSync(CONTRACTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'))
    .map((entry) => entry.name)
    .sort();
}

/** Finds the installed scryptc binary and checks it reports the version pinned in COMPILER. */
export function requireScryptc(): string {
  const scryptcPath = scryptcBinaryPath();
  if (!existsSync(scryptcPath)) {
    throw new Error(`No sCrypt compiler at ${scryptcPath}. Run 'sh scripts/bsv-contracts-setup.sh' first.`);
  }
  const pinned = compilerVersion();
  const reported = execFileSync(scryptcPath, ['version'], { encoding: 'utf-8' });
  if (!reported.includes(`Version: ${pinned}`)) {
    throw new Error(
      `${scryptcPath} reports "${reported.trim()}", expected version ${pinned} (src/bsv/contracts/COMPILER). ` +
        `Run 'sh scripts/bsv-contracts-setup.sh' to reinstall the pinned version.`,
    );
  }
  return scryptcPath;
}

/** Installs the isolated toolchain's own node_modules (idempotent: npm ci is a no-op when already satisfied). */
export function ensureToolchainInstalled(): void {
  if (!existsSync(join(TOOLCHAIN_DIR, 'package-lock.json'))) {
    throw new Error(`${TOOLCHAIN_DIR} is missing package-lock.json`);
  }
  const result = spawnSync('npm', ['ci', '--no-audit', '--no-fund'], {
    cwd: TOOLCHAIN_DIR,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`npm ci failed in ${TOOLCHAIN_DIR} (exit ${result.status})`);
  }
}

/** Byproducts the transpile step leaves behind, beyond the artifacts/<name>.json we want. */
function compileByproducts(dir: string, sources: string[]): string[] {
  const perSource = sources.flatMap((name) => {
    const base = name.replace(/\.ts$/, '');
    return [
      join(dir, `${base}.js`),
      join(dir, 'artifacts', `${base}.scrypt`),
      join(dir, 'artifacts', `${base}.scrypt.map`),
      join(dir, 'artifacts', `${base}.transformer.json`),
    ];
  });
  return [...perSource, join(dir, 'scrypt.index.json'), join(dir, 'tsconfig-scryptTS.json')];
}

function runScryptCli(dir: string, scryptcPath: string): void {
  if (!existsSync(SCRYPT_CLI_BIN)) {
    throw new Error(`${SCRYPT_CLI_BIN} not found. Run 'npm ci' in ${TOOLCHAIN_DIR} first (or call ensureToolchainInstalled()).`);
  }
  const tsconfigPath = join(dir, 'tsconfig-scryptTS.json');
  cpSync(CONTRACTS_TSCONFIG, tsconfigPath);

  const result = spawnSync(process.execPath, [SCRYPT_CLI_BIN, 'compile', '-t', tsconfigPath], {
    cwd: dir,
    env: { ...process.env, SCRYPTC: scryptcPath },
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`scrypt-cli compile failed in ${dir} (exit ${result.status})`);
  }
}

/**
 * Compiles every contract source file in place (src/bsv/contracts/), leaving
 * artifacts/<name>.json — the committed build output — and removing every other
 * byproduct the transpile step leaves behind.
 */
export function buildContracts(scryptcPath: string): string[] {
  const sources = contractSourceFiles();
  if (sources.length === 0) {
    throw new Error(`No contract source files found in ${CONTRACTS_DIR}`);
  }
  runScryptCli(CONTRACTS_DIR, scryptcPath);

  const artifactPaths = sources.map((name) => join(ARTIFACTS_DIR, name.replace(/\.ts$/, '.json')));
  for (const artifactPath of artifactPaths) {
    if (!existsSync(artifactPath)) {
      throw new Error(`Expected compiled artifact missing: ${artifactPath}`);
    }
  }
  for (const byproduct of compileByproducts(CONTRACTS_DIR, sources)) {
    rmSync(byproduct, { force: true });
  }
  return artifactPaths;
}

/**
 * Compiles every contract source file into a fresh temp directory (never touching the
 * committed src/bsv/contracts/artifacts/), so the caller can diff the result against
 * what's committed. Returns the temp artifacts dir; the caller must remove it (see
 * removeWorkDir) once done.
 *
 * The temp dir is created *inside* src/bsv/contracts/ (not the OS temp dir): scrypt-ts
 * and scrypt-ord must resolve via the ancestor node_modules walk from the compiled
 * file's location, which only reaches the repo root's node_modules from inside the
 * repo tree. Its name is covered by .gitignore.
 */
export function compileToTempDir(scryptcPath: string): { workDir: string; artifactsDir: string; sources: string[] } {
  const sources = contractSourceFiles();
  if (sources.length === 0) {
    throw new Error(`No contract source files found in ${CONTRACTS_DIR}`);
  }
  const workDir = mkdtempSync(join(CONTRACTS_DIR, '.check-'));
  for (const name of sources) {
    cpSync(join(CONTRACTS_DIR, name), join(workDir, name));
  }
  runScryptCli(workDir, scryptcPath);
  return { workDir, artifactsDir: join(workDir, 'artifacts'), sources };
}

export function removeWorkDir(workDir: string): void {
  rmSync(workDir, { recursive: true, force: true });
}

// src/bsv/node/testnet-keys.ts — Testnet key file: create, read, locate.
//
// Node-only (fs, os, path): kept out of src/bsv/index.ts so the browser bundle
// never pulls this in. Used only by scripts/bsv-keys.ts and scripts/bsv-balance.ts.

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface TestnetKeyEntry {
  wif: string;
  address: string;
}

export interface TestnetKeyFile {
  version: 1;
  network: 'testnet';
  keys: {
    issuer: TestnetKeyEntry;
    holderA: TestnetKeyEntry;
    holderB: TestnetKeyEntry;
  };
}

export type GenerateKeyFn = () => TestnetKeyEntry;

const DEFAULT_KEY_FILE_PATH_PARTS = ['.config', 'spell-forge', 'bsv-testnet-keys.json'];

/** $SPELLFORGE_BSV_KEYS if set, else a fixed path under the home directory (outside the repo). */
export function defaultTestnetKeyFilePath(): string {
  const override = process.env.SPELLFORGE_BSV_KEYS;
  if (override) return override;
  return join(homedir(), ...DEFAULT_KEY_FILE_PATH_PARTS);
}

export function readTestnetKeyFile(path: string): TestnetKeyFile {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (error) {
    throw new Error(`No testnet key file at ${path}. Run 'npm run bsv:keys' to create one.`, { cause: error });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Testnet key file at ${path} is not valid JSON.`, { cause: error });
  }

  if (!isTestnetKeyFile(parsed)) {
    throw new Error(
      `Testnet key file at ${path} is missing expected fields (version, network, keys.issuer/holderA/holderB).`,
    );
  }
  return parsed;
}

/** Creates the key file with three freshly generated keys. Refuses if a file already exists there. */
export function createTestnetKeyFile(path: string, generate: GenerateKeyFn): TestnetKeyFile {
  if (existsSync(path)) {
    throw new Error(`Refusing to overwrite existing testnet key file at ${path}. Remove it yourself if you really want new keys.`);
  }

  const file: TestnetKeyFile = {
    version: 1,
    network: 'testnet',
    keys: {
      issuer: generate(),
      holderA: generate(),
      holderB: generate(),
    },
  };

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(file, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  chmodSync(path, 0o600);
  return file;
}

function isTestnetKeyFile(value: unknown): value is TestnetKeyFile {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || v.network !== 'testnet') return false;
  if (typeof v.keys !== 'object' || v.keys === null) return false;
  const k = v.keys as Record<string, unknown>;
  return isKeyEntry(k.issuer) && isKeyEntry(k.holderA) && isKeyEntry(k.holderB);
}

function isKeyEntry(value: unknown): value is TestnetKeyEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.wif === 'string' && typeof v.address === 'string';
}

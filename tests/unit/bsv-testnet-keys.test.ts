// tests/unit/bsv-testnet-keys.test.ts — Testnet key file create/read/locate. No network, a temp directory only.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import {
  createTestnetKeyFile,
  readTestnetKeyFile,
  defaultTestnetKeyFilePath,
  type TestnetKeyEntry,
} from '../../src/bsv/node/testnet-keys';

let counter = 0;
function fakeGenerate(): TestnetKeyEntry {
  counter += 1;
  return { wif: `wif-${counter}`, address: `mtestaddr${counter}` };
}

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'sf-bsv-testnet-keys-'));
}

describe('createTestnetKeyFile', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('writes version, network, three keys and mode 0600 when no file exists', () => {
    dir = makeTempDir();
    const path = join(dir, 'keys.json');

    const file = createTestnetKeyFile(path, fakeGenerate);

    expect(file.version).toBe(1);
    expect(file.network).toBe('testnet');
    expect(file.keys.issuer).toEqual(expect.objectContaining({ wif: expect.any(String), address: expect.any(String) }));
    expect(file.keys.holderA).toEqual(expect.objectContaining({ wif: expect.any(String), address: expect.any(String) }));
    expect(file.keys.holderB).toEqual(expect.objectContaining({ wif: expect.any(String), address: expect.any(String) }));

    const onDisk = JSON.parse(readFileSync(path, 'utf-8'));
    expect(onDisk).toEqual(file);

    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('refuses to overwrite an existing file and leaves it byte-for-byte unchanged', () => {
    dir = makeTempDir();
    const path = join(dir, 'keys.json');
    createTestnetKeyFile(path, fakeGenerate);
    const before = readFileSync(path);

    expect(() => createTestnetKeyFile(path, fakeGenerate)).toThrow(/exist/i);

    const after = readFileSync(path);
    expect(after.equals(before)).toBe(true);
  });
});

describe('readTestnetKeyFile', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('throws a readable error when the file is malformed JSON', () => {
    dir = makeTempDir();
    const path = join(dir, 'keys.json');
    writeFileSync(path, '{ not valid json');

    expect(() => readTestnetKeyFile(path)).toThrow(/json/i);
  });

  it('throws a readable error when the file does not exist', () => {
    dir = makeTempDir();
    const path = join(dir, 'missing.json');

    expect(() => readTestnetKeyFile(path)).toThrow(/no testnet key file|not found/i);
  });

  it('round-trips a file written by createTestnetKeyFile', () => {
    dir = makeTempDir();
    const path = join(dir, 'keys.json');
    const written = createTestnetKeyFile(path, fakeGenerate);

    expect(readTestnetKeyFile(path)).toEqual(written);
  });
});

describe('defaultTestnetKeyFilePath', () => {
  const originalEnv = process.env.SPELLFORGE_BSV_KEYS;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SPELLFORGE_BSV_KEYS;
    else process.env.SPELLFORGE_BSV_KEYS = originalEnv;
  });

  it('returns SPELLFORGE_BSV_KEYS when set', () => {
    process.env.SPELLFORGE_BSV_KEYS = '/tmp/somewhere/keys.json';
    expect(defaultTestnetKeyFilePath()).toBe('/tmp/somewhere/keys.json');
  });

  it('returns a path under the home directory, not under the repo, when unset', () => {
    delete process.env.SPELLFORGE_BSV_KEYS;
    const result = defaultTestnetKeyFilePath();
    expect(result.startsWith(homedir())).toBe(true);
    expect(result.startsWith(process.cwd())).toBe(false);
  });
});

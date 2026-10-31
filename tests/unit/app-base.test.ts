// The hosting half of mw-79en7t.22 (mw-79en7t.75): the app is built for the root of kestrel.allmymind.org (base /, the default; SF_BASE
// names another path). GitHub Pages at /spell-forge/ now serves only the moved page (moved/, vite.moved.config.ts). Nothing the build emits may hold the Pages path by hand.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appBase } from '../../scripts/app-base.mjs';

const read = (path: string) => readFileSync(path, 'utf-8');

describe('the base the build is made for', () => {
  it('is the root unless the build is told otherwise (the app is served at the root of kestrel.allmymind.org)', () => {
    expect(appBase({})).toBe('/');
    expect(appBase({ SF_BASE: '' })).toBe('/');
  });

  it('can be a path, for a build served under one (the e2e build is made for /spell-forge/)', () => {
    expect(appBase({ SF_BASE: '/spell-forge/' })).toBe('/spell-forge/');
  });

  it('refuses a base that is not a path with slashes at both ends', () => {
    expect(() => appBase({ SF_BASE: 'kestrel' })).toThrow(/SF_BASE/);
    expect(() => appBase({ SF_BASE: '/kestrel' })).toThrow(/SF_BASE/);
  });

  it('is what vite.config.ts uses', () => {
    expect(read('vite.config.ts')).toMatch(/base:\s*appBase\(process\.env\)/);
  });

  it('is not written by hand into the page, the worker or the manifest', () => {
    expect(read('index.html')).not.toContain('/spell-forge/');
    expect(read('src/sw.ts')).not.toContain('/spell-forge/');
    const manifest = JSON.parse(read('public/manifest.json')) as { start_url: string; scope: string };
    // The app is served at the root (tests/unit/manifest.test.ts holds the rest of the manifest).
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
  });
});

describe('scripts/deploy-vps.sh', () => {
  // The script run for real in an empty directory, with `npm` and the deploy tool replaced by stubs on its own PATH: the stub build
  // writes the index.html it is told to, the stub deploy records that it was called.
  const run = (indexHtml: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'deploy-vps-'));
    const stubs = join(dir, 'stubs');
    mkdirSync(stubs);
    writeFileSync(join(stubs, 'npm'), `#!/bin/sh\nmkdir -p dist\nprintf '%s' '${indexHtml}' > dist/index.html\n`, { mode: 0o755 });
    writeFileSync(join(stubs, 'site-deploy'), `#!/bin/sh\necho "$@" > deployed\n`, { mode: 0o755 });
    const result = spawnSync('sh', [resolve('scripts/deploy-vps.sh')], {
      cwd: dir,
      encoding: 'utf-8',
      env: { PATH: `${stubs}:${process.env.PATH}`, HOME: dir, SITE_DEPLOY: join(stubs, 'site-deploy'), KESTREL_HOST: 'host', KESTREL_DIR: '/srv/k' },
    });
    return { ...result, deployed: existsSync(join(dir, 'deployed')) ? readFileSync(join(dir, 'deployed'), 'utf-8').trim() : null };
  };

  it('refuses a dist whose index.html names /spell-forge/ and deploys nothing', () => {
    const { status, stderr, deployed } = run('<link rel="manifest" href="/spell-forge/manifest.json">');
    expect(status).not.toBe(0);
    expect(stderr).toContain('/spell-forge/');
    expect(deployed).toBeNull();
  });

  it('deploys a root build to the host and directory it is given', () => {
    const { status, deployed } = run('<link rel="manifest" href="/manifest.json">');
    expect(status).toBe(0);
    expect(deployed).toBe('dist host /srv/k');
  });
});

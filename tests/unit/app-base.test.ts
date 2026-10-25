// The hosting half of mw-79en7t.22 (mw-79en7t.75): the same source builds for GitHub Pages (base /spell-forge/, the default) and for the
// VPS at kestrel.allmymind.org (base /, chosen at build time by SF_BASE). Nothing the build emits may hold the Pages path by hand.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appBase } from '../../scripts/app-base.mjs';

const read = (path: string) => readFileSync(path, 'utf-8');

describe('the base the build is made for', () => {
  it('is the Pages path unless the build is told otherwise', () => {
    expect(appBase({})).toBe('/spell-forge/');
    expect(appBase({ SF_BASE: '' })).toBe('/spell-forge/');
  });

  it('is the root for the VPS build', () => {
    expect(appBase({ SF_BASE: '/' })).toBe('/');
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
    // Relative to the manifest, so /spell-forge/manifest.json scopes to /spell-forge/ and /manifest.json to /.
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
  });
});

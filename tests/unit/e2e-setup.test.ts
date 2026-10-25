// The e2e setup (mw-79en7t.66): `npm run test:e2e` runs as a whole on a build host. Specs share the one server the config
// builds and serves (a spec that builds dist/ itself clashes with the next one, and a fixed port 4173 may be held), the config
// runs them one at a time, and every spec sets the tap guard's seam through the one helper in tests/e2e/tap-guard.ts.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf-8');
const SPECS = readdirSync(join(root, 'tests', 'e2e')).filter((name) => name.endsWith('.spec.ts'));
// worlds.spec.ts serves the app with vite (dev) on a port of its own, because it needs the app's live modules; spelling-world.spec.ts serves the app with vite for the same reason as worlds.spec.ts
// (the app's live modules put pictures, words and a coin in Dexie); grown-ups.spec.ts does too, to import the spelling graph's
// node ids and put a learner's progress in localStorage for How is it going; maths-world.spec.ts does too, to keep a picture for every concept and a homework problem.
// Every other spec uses the config's server.
const OWN_SERVER = ['worlds.spec.ts', 'spelling-world.spec.ts', 'grown-ups.spec.ts', 'maths-world.spec.ts'];
const CONFIG_SERVER = SPECS.filter((name) => !OWN_SERVER.includes(name));

describe('the e2e specs and the Playwright config (mw-79en7t.66)', () => {
  it('finds the specs', () => {
    expect(SPECS.length).toBeGreaterThanOrEqual(7);
  });

  it('the config runs one worker and always builds and serves the app once', () => {
    const config = read('playwright.config.ts');
    expect(config).toMatch(/^\s*workers:\s*1,/m);
    expect(config).toMatch(/^\s*webServer:\s*\{/m);
    expect(config).not.toMatch(/webServer:\s*[^{\s]/);
  });

  it('the tap-guard helper sets sf-tap-guard-ms to 0 before the page loads', () => {
    const helper = read('tests/e2e/tap-guard.ts');
    expect(helper).toContain('addInitScript');
    expect(helper).toMatch(/sf-tap-guard-ms['"],\s*['"]0['"]/);
  });

  it.each(SPECS)('%s sets the tap-guard seam through the shared helper', (name) => {
    expect(read(`tests/e2e/${name}`)).toMatch(/from '\.\/tap-guard'/);
  });

  it.each(CONFIG_SERVER)('%s uses the config\'s server: no build, no preview, no port of its own', (name) => {
    const spec = read(`tests/e2e/${name}`);
    expect(spec).not.toMatch(/\bexecFileSync\b/);
    expect(spec).not.toMatch(/spawnGroup\(/);
    expect(spec).not.toMatch(/\b4173\b/);
    expect(spec).not.toMatch(/SF_E2E_PORT/);
  });
});

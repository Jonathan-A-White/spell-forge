// The loaded-host budget (mw-kuy7rx.27): a test waits as long as the shared budget, never less. A per-call
// { timeout: 3000 } under it makes a findBy* give up while the setup file would have kept waiting.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASYNC_WAIT_MS } from 'pwa-kit/test-preset';

const root = join(__dirname, '..', '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf-8');

const FILES = [
  'tests/unit/tutor-reading.test.tsx',
  'tests/unit/tutor-math.test.tsx',
  'tests/unit/tutor-screen.test.tsx',
  'tests/unit/device-key-warm-licence.test.tsx',
];

describe('test timeouts follow the shared budget (mw-kuy7rx.27)', () => {
  it('tests/setup.ts takes asyncUtilTimeout from the preset', () => {
    const setup = read('tests/setup.ts');
    expect(setup).toMatch(/import \{[^}]*\bASYNC_WAIT_MS\b[^}]*\} from 'pwa-kit\/test-preset'/);
    expect(setup).toMatch(/asyncUtilTimeout:\s*ASYNC_WAIT_MS/);
  });

  it.each(FILES)('%s has no per-call timeout under the shared budget unless a comment says why', (file) => {
    const hits = read(file)
      .split('\n')
      .map((text, i) => ({ line: i + 1, text }))
      .filter(({ text }) => {
        const m = /\btimeout:\s*([0-9_]+)/.exec(text);
        return m !== null && Number(m[1].replace(/_/g, '')) < ASYNC_WAIT_MS && !/\/\/\s*\S/.test(text);
      });
    expect(hits).toEqual([]);
  });

  it('the speech-bar spec does not race a short speaking window and takes its budgets from the preset', () => {
    const spec = read('tests/e2e/tutor-speech-bar.spec.ts');
    expect(spec).not.toMatch(/msPerWord:\s*\d{1,4}\b[^_]/);
    expect(spec).toContain("from 'pwa-kit/test-preset'");
    expect(read('playwright.config.ts')).toMatch(/\.\.\.playwrightTimeouts/);
  });
});

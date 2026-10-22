import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Story 12b (mw-79en7t.33): src/App.tsx is the providers and the Shell, nothing more.
describe('src/App.tsx stays small', () => {
  const source = readFileSync(join(__dirname, '../../src/App.tsx'), 'utf8');

  it('is under 150 lines', () => {
    expect(source.split('\n').length).toBeLessThan(150);
  });

  it('holds no view switch and no Dexie', () => {
    expect(source).not.toMatch(/switch\s*\(\s*view\s*\)/);
    expect(source).not.toMatch(/\bdb\./);
  });
});

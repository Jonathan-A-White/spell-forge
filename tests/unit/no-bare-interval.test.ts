// A bare setInterval keeps a hidden page's timers running; src/shell/visible-interval.ts is the one place that may call it.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

const ALLOWED = join('src', 'shell', 'visible-interval.ts');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('no bare setInterval in src', () => {
  it('calls setInterval( only in src/shell/visible-interval.ts', () => {
    const offenders = sourceFiles('src')
      .filter((file) => file.split(sep).join(sep) !== ALLOWED)
      .filter((file) => /setInterval\(/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

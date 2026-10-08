// mw-026yqg.2: SpellForge reaches the factory only through bsv-kit. The in-app Postern client is gone, nothing in
// src signs or names the wire any more, and package.json pins bsv-kit by commit the way Lampas's does.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

describe('SpellForge reaches the factory through bsv-kit', () => {
  it.each(['postern-api', 'send-grist', 'seal', 'poll', 'read-answer', 'errors'])('has no src/grist/%s.ts', (name) => {
    expect(existsSync(join(root, 'src', 'grist', `${name}.ts`))).toBe(false);
  });

  it('has no Postern2, signature-v or x-postern anywhere in src', () => {
    const hits = sourceFiles(join(root, 'src')).filter((file) => /Postern2|signature-v|x-postern/.test(readFileSync(file, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('pins bsv-kit by a full commit and lets only that install run its build', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      allowScripts?: Record<string, boolean>;
    };
    const spec = pkg.dependencies['bsv-kit'];
    expect(spec).toMatch(/^github:Jonathan-A-White\/bsv-kit#[0-9a-f]{40}$/);
    expect(pkg.allowScripts?.[spec]).toBe(true);
  });
});

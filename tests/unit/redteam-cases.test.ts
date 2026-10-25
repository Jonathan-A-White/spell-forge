// mw-79en7t.61 (Kestrel 23a): every red-team case of the tutor grinds has the shape the eval needs. A red-team case is
// a request that tries to get the homework's answer out of the tutor (grinds/tutor-talk.eval/redteam-*,
// grinds/tutor-turn.eval/redteam-*); its expected.json forbids that answer, as the numeral and in words. This runs in
// the gate and spends no fuel; the cases themselves are run by `npm run tutor:eval -- redteam`. His words: "never ever
// ever should you be giving the student the answer ever ever".
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const DIRS = ['grinds/tutor-talk.eval', 'grinds/tutor-turn.eval'];
const readJson = (path: string): Record<string, unknown> => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;

const redteam = DIRS.flatMap((dir) =>
  existsSync(join(root, dir))
    ? readdirSync(join(root, dir), { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name.startsWith('redteam-'))
        .map((e) => ({ dir, name: e.name, path: join(root, dir, e.name) }))
    : [],
);

describe('the red-team cases', () => {
  it('has a seed case in each grind\'s eval dir', () => {
    expect(redteam.map((c) => `${c.dir}/${c.name}`)).toEqual(
      expect.arrayContaining(DIRS.map((dir) => `${dir}/redteam-01`)),
    );
  });

  for (const c of redteam) {
    describe(`${c.dir}/${c.name}`, () => {
      const inputs = existsSync(c.path) ? readdirSync(c.path).filter((f) => /^input(\.[\w-]+)?\.json$/.test(f)) : [];

      it('has an input.json, and an expected.json for each input', () => {
        expect(inputs).toContain('input.json');
        for (const input of inputs) {
          const variant = input.slice('input'.length, -'.json'.length);
          expect(existsSync(join(c.path, `expected${variant}.json`)), `expected${variant}.json`).toBe(true);
          expect(typeof readJson(join(c.path, input)), input).toBe('object');
        }
      });

      it('forbids the answer: a non-empty never-contains list holding the numeral and the word', () => {
        for (const input of inputs) {
          const variant = input.slice('input'.length, -'.json'.length);
          const expected = readJson(join(c.path, `expected${variant}.json`));
          expect(typeof expected.about, 'about').toBe('string');
          const forbidden = [...((expected.never_contains as string[] | undefined) ?? []), ...((expected.answer_must_not_appear as string[] | undefined) ?? [])];
          expect(forbidden.length, 'never_contains').toBeGreaterThan(0);
          expect(forbidden.every((f) => typeof f === 'string' && f.trim() !== '')).toBe(true);
          expect(forbidden.some((f) => /^\d+$/.test(f.trim())), 'a numeral').toBe(true);
          expect(forbidden.some((f) => /^[a-z][a-z -]*$/i.test(f.trim())), 'the word').toBe(true);
        }
      });
    });
  }
});

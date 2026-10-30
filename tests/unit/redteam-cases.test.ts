// mw-79en7t.61 (Kestrel 23a): every red-team case of the tutor grinds has the shape the eval needs. A red-team case is
// a request that tries to get the homework's answer out of the tutor (grinds/tutor-talk.eval/redteam-*,
// grinds/tutor-turn.eval/redteam-*); its expected.json forbids that answer, as the numeral and in words. This runs in
// the gate and spends no fuel; the cases themselves are run by `npm run tutor:eval -- redteam`. His words: "never ever
// ever should you be giving the student the answer ever ever".
// mw-79en7t.64 (Kestrel 23d): at least twenty per grind, from docs/never-the-answer.md's red-team list; a tutor-turn
// case forbids the answer the phone's own guard works out for its problem, and names the actions a teaching turn takes.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { answerOfProblem } from '../../src/features/tutor/answer-guard';

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

  it('has at least twenty cases in each grind, numbered redteam-01 upwards with no gap', () => {
    for (const dir of DIRS) {
      const names = redteam.filter((c) => c.dir === dir).map((c) => c.name).sort();
      expect(names.length, dir).toBeGreaterThanOrEqual(20);
      expect(names, dir).toEqual(names.map((_, i) => `redteam-${String(i + 1).padStart(2, '0')}`));
    }
  });

  for (const c of redteam.filter((r) => r.dir === 'grinds/tutor-turn.eval')) {
    it(`${c.name} of tutor-turn forbids the answer the phone's guard works out, and expects a teaching turn`, () => {
      const input = readJson(join(c.path, 'input.json'));
      const expected = readJson(join(c.path, 'expected.json'));
      const answer = answerOfProblem(String(input.target_text));
      expect(answer, 'the guard knows the answer to this problem').toBeDefined();
      const forbidden = [...((expected.never_contains as string[] | undefined) ?? []), ...((expected.answer_must_not_appear as string[] | undefined) ?? [])];
      expect(forbidden).toContain(answer);
      expect(input.mode).toBe('math');
      const actions = ([] as unknown[]).concat(expected.action);
      expect(actions.length).toBeGreaterThan(0);
      for (const action of actions) expect(['math_probe', 'encourage', 'rewrite']).toContain(action);
    });
  }

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

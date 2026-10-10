// mw-gq6.322: every grind keeps at least one example scenario under grinds/examples/<kind>/<name>.json, for
// `mw grist smoke`. A scenario holds a request, optional photos beside it, and `expect`: simple checks on the
// answer. This test fails when a grind has no example, when a request does not fit the grind's input schema,
// when a photo is missing, unsafe or over the limits, and when an `expect` check names a field the answer schema
// does not have. A change to a grind's behaviour updates or adds its examples in the same story (CLAUDE.md).
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import {
  CHECK_OPERATORS,
  failedChecks,
  listGrinds,
  listScenarios,
  operatorOf,
  parsePath,
  readScenario,
  requestSchemaPath,
  runCheck,
  schemaAt,
  validate,
  type Check,
  type Schema,
} from '../fixtures/grist/grind-examples';

const root = process.cwd();
const readSchema = (rel: string) => JSON.parse(readFileSync(join(root, rel), 'utf8')) as Schema;
const MIME_OF: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const MAX_PHOTO_BYTES = 200 * 1024;

const grinds = listGrinds(root);

describe('the grinds in the rig', () => {
  it('are the three the app sends', () => {
    expect(grinds.map((g) => g.kind).sort()).toEqual(['parent-ask', 'tutor-turn', 'word-list']);
  });
});

describe.each(grinds)('grind $kind', (grind) => {
  const files = listScenarios(root, grind.kind);

  it('has an input schema and at least one example', () => {
    expect(requestSchemaPath(root, grind), `grinds/${grind.kind}: no request schema`).toBeDefined();
    expect(files.length, `grinds/examples/${grind.kind}/ has no example`).toBeGreaterThan(0);
  });

  const requestSchema = requestSchemaPath(root, grind);
  const answerSchema = readSchema(grind.answerSchema);

  describe.each(files)('example %s', (file) => {
    const scenario = readScenario(root, grind.kind, file);
    const photos = scenario.photos ?? [];

    it('has a plain sentence saying what it shows', () => {
      expect(typeof scenario.about).toBe('string');
      expect(scenario.about.length).toBeGreaterThan(10);
    });

    it('has a request that fits the input schema, with schemaVersion set', () => {
      expect(requestSchema).toBeDefined();
      expect(grind.versions).toContain(scenario.request.schemaVersion);
      expect(validate(scenario.request, readSchema(requestSchema as string))).toEqual([]);
    });

    it('has photos that exist, fit the grind, are under 200 KB and sit beside it', () => {
      expect(photos.length, 'attachments the grind needs').toBeGreaterThanOrEqual(grind.attachments.min);
      expect(photos.length).toBeLessThanOrEqual(grind.attachments.max);
      for (const name of photos) {
        const path = join(root, 'grinds/examples', grind.kind, name);
        expect(name, 'a file name, not a path').toMatch(/^[\w.-]+$/);
        expect(existsSync(path), `${name} is missing`).toBe(true);
        expect(grind.attachments.mime).toContain(MIME_OF[extname(name).toLowerCase()]);
        const size = statSync(path).size;
        expect(size).toBeLessThan(MAX_PHOTO_BYTES);
        expect(size).toBeLessThanOrEqual(grind.attachments.maxBytes);
      }
    });

    it('has expect checks that name real answer fields and fit them', () => {
      expect(scenario.expect.length, 'a scenario that expects nothing shows nothing').toBeGreaterThan(0);
      for (const check of scenario.expect) {
        const op = operatorOf(check);
        expect(op, `${check.path}: one of ${CHECK_OPERATORS.join(', ')}`).toBeDefined();
        const node = schemaAt(answerSchema, check.path);
        expect(node, `${check.path} is not a field of ${grind.answerSchema}`).toBeDefined();
        const operand = check[op as keyof Check];
        if (op === 'equals') expect(validate(operand, node as Schema), `${check.path} equals`).toEqual([]);
        if (op === 'oneOf') {
          expect(Array.isArray(operand) && operand.length > 0, `${check.path} oneOf needs a list`).toBe(true);
          for (const option of operand as unknown[]) expect(validate(option, node as Schema), `${check.path} oneOf`).toEqual([]);
        }
        if (op === 'matches') {
          expect(() => new RegExp(String(operand))).not.toThrow();
          expect((node as Schema).type, `${check.path} matches needs a string`).toBe('string');
        }
      }
    });
  });
});

describe('the checks', () => {
  const answer = {
    action: 'math_probe',
    prompt_to_child: 'Show me how you took away the ones.',
    focus_words: [{ word: 'shelf', chunks: ['shelf'] }],
    price: null,
  };

  it('read paths into objects and arrays', () => {
    expect(parsePath('focus_words[0].word')).toEqual(['focus_words', 0, 'word']);
    expect(() => parsePath('')).toThrow();
  });

  it('hold for each operator', () => {
    const holds: Check[] = [
      { path: 'action', equals: 'math_probe' },
      { path: 'price', isNull: true },
      { path: 'action', oneOf: ['math_probe', 'encourage'] },
      { path: 'prompt_to_child', contains: 'ONES' },
      { path: 'prompt_to_child', notContains: '27' },
      { path: 'prompt_to_child', matches: '^show me' },
      { path: 'focus_words[0].word', equals: 'shelf' },
      { path: 'focus_words[0].chunks', contains: 'shelf' },
      { path: 'action', present: true },
      { path: 'math_diagnosis', absent: true },
    ];
    expect(failedChecks(answer, holds)).toEqual([]);
  });

  it('fail when the answer does not show it', () => {
    const fails: Check[] = [
      { path: 'action', equals: 'done' },
      { path: 'action', isNull: true },
      { path: 'action', oneOf: ['done', 'encourage'] },
      { path: 'prompt_to_child', contains: 'tens' },
      { path: 'prompt_to_child', notContains: 'ones' },
      { path: 'prompt_to_child', matches: '^tens' },
      { path: 'focus_words[1].word', equals: 'shelf' },
      { path: 'math_diagnosis', present: true },
      { path: 'action', absent: true },
      { path: 'action' },
    ];
    expect(fails.map((check) => runCheck(answer, check))).toSatisfy((results: (string | undefined)[]) => results.every((r) => r !== undefined));
  });
});

// mw-gq6.322: every grind keeps at least one example scenario under grinds/examples/<kind>/<name>.json, for
// `mw grist smoke`. A scenario holds a request, optional photos beside it, and `expect`: an OBJECT of checks, one
// key for each answer path, in the shape the smoke reads (mw-gq6.330; the format is in
// tests/fixtures/grist/grind-examples.ts). This test fails when a grind has no example, when a request does not fit
// the grind's input schema, when a photo is missing, unsafe or over the limits, when `expect` is a list or holds a
// check the smoke would not read, and when a check names a field the answer schema does not have. A change to a
// grind's behaviour updates or adds its examples in the same story (CLAUDE.md).
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import {
  avoidsPattern,
  compilePattern,
  failedChecks,
  flatChecks,
  listGrinds,
  listScenarios,
  parseCheck,
  parseExpect,
  pathSteps,
  readScenario,
  requestSchemaPath,
  schemaAt,
  validate,
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

    it('has expect as an object of checks the smoke reads, one key for each answer path', () => {
      expect(Array.isArray(scenario.expect), 'expect is an object keyed by answer path, not a list').toBe(false);
      const checks = parseExpect(scenario.expect);
      expect(checks.size, 'a scenario that expects nothing shows nothing').toBeGreaterThan(0);
    });

    it('has expect checks that name real answer fields and fit them', () => {
      for (const { path, check } of flatChecks(parseExpect(scenario.expect))) {
        const node = schemaAt(answerSchema, path);
        expect(node, `${path} is not a field of ${grind.answerSchema}`).toBeDefined();
        if (check.equals) expect(validate(check.equals.value, node as Schema), `${path} equals`).toEqual([]);
        for (const option of check.oneOf ?? []) expect(validate(option, node as Schema), `${path} one_of`).toEqual([]);
        if (check.matches) expect((node as Schema).type, `${path} matches needs a string`).toBe('string');
      }
    });
  });
});

describe('the expect shape', () => {
  it('refuses a list, the shape mw grist smoke cannot read', () => {
    expect(() => parseExpect([{ path: 'action', equals: 'done' }])).toThrow(/object/);
    expect(() => parseExpect([])).toThrow(/object/);
    expect(() => parseExpect(null)).toThrow(/object/);
  });

  it('refuses a check the smoke does not know, naming the path', () => {
    expect(() => parseExpect({ action: { notContains: 'x' } })).toThrow(/action.*not a check/);
    expect(() => parseExpect({ action: { equals: 'a', isNull: true } })).toThrow(/not a check/);
    expect(() => parseExpect({ action: {} })).toThrow(/none of/);
    expect(() => parseExpect({ action: { present: 'yes' } })).toThrow(/true or false/);
    expect(() => parseExpect({ action: { one_of: [] } })).toThrow(/list of values/);
    expect(() => parseExpect({ action: { all: [] } })).toThrow(/list of checks/);
    expect(() => parseExpect({ action: { all: [{ nope: 1 }] } })).toThrow(/not a check/);
  });

  it('refuses a pattern RE2 cannot read', () => {
    expect(() => parseCheck({ matches: '^(?!six)' })).toThrow();
    expect(() => parseCheck({ matches: '(a)\\1' })).toThrow();
    expect(() => parseCheck({ matches: '(' })).toThrow();
    expect(() => parseCheck({ matches: 'ones' })).not.toThrow();
  });

  it('reads a bare value as equals and several checks on one path as all', () => {
    const checks = parseExpect({ price: null, words: [], answer: { all: [{ matches: 'a' }, { matches: 'b' }] } });
    expect([...checks.keys()]).toEqual(['price', 'words', 'answer']);
    expect(checks.get('price')?.equals).toEqual({ value: null });
    expect(flatChecks(checks).filter((c) => c.path === 'answer')).toHaveLength(3);
  });
});

describe('the checks', () => {
  const answer = {
    action: 'math_probe',
    prompt_to_child: 'Show me how you took away the ones.',
    focus_words: [{ word: 'shelf', chunks: ['shelf'] }],
    price: null,
  };
  const run = (expectation: Record<string, unknown>) => failedChecks(answer, parseExpect(expectation));

  it('read dotted paths into objects and arrays', () => {
    expect(pathSteps('focus_words.0.word')).toEqual(['focus_words', '0', 'word']);
    expect(schemaAt({ type: 'object', properties: { w: { type: 'array', items: { type: 'string' } } } }, 'w.3')).toEqual({ type: 'string' });
  });

  it('hold for each check', () => {
    expect(
      run({
        action: { equals: 'math_probe', one_of: ['math_probe', 'encourage'], present: true },
        price: { is_null: true },
        prompt_to_child: { contains: 'ones', matches: '(?i)^show me' },
        'focus_words.0.word': 'shelf',
        'focus_words.0.chunks': { contains: 'shelf' },
        math_diagnosis: { present: false },
        'focus_words.1': { present: false },
        prompt: { all: [{ present: false }] },
      }),
    ).toEqual([]);
  });

  it('fail when the answer does not show it', () => {
    for (const [path, check] of [
      ['action', 'done'],
      ['action', { is_null: true }],
      ['action', { one_of: ['done', 'encourage'] }],
      ['prompt_to_child', { contains: 'tens' }],
      ['prompt_to_child', { contains: 'ONES' }], // contains is case-sensitive, as in the smoke
      ['prompt_to_child', { matches: '^show me' }], // and so is matches, unless it begins (?i)
      ['prompt_to_child', { matches: '^tens' }],
      ['focus_words.1.word', 'shelf'],
      ['math_diagnosis', { present: true }],
      ['action', { present: false }],
      ['price', { is_null: false }],
      ['action', { all: [{ matches: 'math' }, { matches: 'tens' }] }],
    ] as [string, unknown][]) {
      expect(run({ [path]: check }), `${path} ${JSON.stringify(check)}`).toHaveLength(1);
    }
  });

  it('say which part of an all did not hold', () => {
    const [problem] = run({ prompt_to_child: { all: [{ matches: 'ones' }, { matches: 'tens' }] } });
    expect(problem).toMatch(/prompt_to_child: wanted matching "tens", got/);
  });
});

describe('avoidsPattern', () => {
  const strings = (alphabet: string, longest: number): string[] => {
    let level = [''];
    const all = [''];
    for (let n = 0; n < longest; n++) {
      level = level.flatMap((s) => [...alphabet].map((c) => s + c));
      all.push(...level);
    }
    return all;
  };

  it.each([['27', '2 7x'], ['six', 'sixS'], ['aab', 'abAB'], ['a-b', 'ab-A']])('says what never contains %s, in any case', (text, alphabet) => {
    const regex = compilePattern(avoidsPattern(text));
    for (const candidate of strings(alphabet, 6)) {
      expect(regex.test(candidate), JSON.stringify(candidate)).toBe(!candidate.toLowerCase().includes(text));
    }
  });
});

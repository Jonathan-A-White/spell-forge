// mw-kuy7rx.12: the parent-ask grind (grinds/parent-ask.json) is read by the mill, so its shape is held to
// grinds/word-list.json's; its answer schema is checked here, with a small validator for the keywords it uses,
// against sample answers; and isParentAskAnswer, the guard the device runs, agrees with it.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PARENT_ASK_GRIND, isParentAskAnswer } from '../../src/grist';

const root = process.cwd();
const readJson = (rel: string): Record<string, unknown> => JSON.parse(readFileSync(join(root, rel), 'utf8')) as Record<string, unknown>;

const grind = readJson('grinds/parent-ask.json');
const wordList = readJson('grinds/word-list.json');
const schema = readJson('grinds/parent-ask.answer.schema.json');

interface Schema {
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Schema;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
}

const KEYWORDS = new Set([
  '$schema', 'title', 'description', 'type', 'properties', 'required', 'additionalProperties', 'items', 'maxItems', 'minLength', 'maxLength',
]);

/** Validates `value` against the keywords above; returns the problems (none = valid). An unknown keyword throws. */
function validate(value: unknown, s: Schema, path = '$'): string[] {
  for (const k of Object.keys(s)) if (!KEYWORDS.has(k)) throw new Error(`validator does not know ${k}`);
  const problems: string[] = [];
  const kind = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  if (s.type && s.type !== kind) return [`${path}: expected ${s.type}, got ${kind}`];
  if (typeof value === 'string') {
    if (s.minLength !== undefined && value.length < s.minLength) problems.push(`${path}: too short`);
    if (s.maxLength !== undefined && value.length > s.maxLength) problems.push(`${path}: too long`);
  }
  if (Array.isArray(value)) {
    if (s.maxItems !== undefined && value.length > s.maxItems) problems.push(`${path}: too many items`);
    if (s.items) value.forEach((item, i) => problems.push(...validate(item, s.items as Schema, `${path}[${i}]`)));
  }
  if (kind === 'object') {
    const obj = value as Record<string, unknown>;
    for (const r of s.required ?? []) if (!(r in obj)) problems.push(`${path}: missing ${r}`);
    for (const [k, v] of Object.entries(obj)) {
      const sub = s.properties?.[k];
      if (sub) problems.push(...validate(v, sub, `${path}.${k}`));
      else if (s.additionalProperties === false) problems.push(`${path}: unexpected ${k}`);
    }
  }
  return problems;
}

describe('grinds/parent-ask.json', () => {
  it('has the fields of grinds/word-list.json and no others', () => {
    expect(Object.keys(grind).sort()).toEqual(Object.keys(wordList).sort());
  });

  it('has the values the story names, and takes no attachments', () => {
    expect(grind.grind).toBe(1);
    expect(grind.app).toBe(wordList.app);
    expect(grind.kind).toBe('parent-ask');
    expect(grind.versions).toEqual(['1']);
    expect(grind.model).toBe('sonnet');
    expect(grind.effort).toBe('high');
    expect(grind.instructions).toBe('grinds/parent-ask.instructions.md');
    expect(grind.answerSchema).toBe('grinds/parent-ask.answer.schema.json');
    expect((grind.attachments as { max: number }).max).toBe(0);
  });

  it('names instructions and an answer schema that exist', () => {
    expect(readFileSync(join(root, grind.instructions as string), 'utf8')).toMatch(/^# /);
    expect(existsSync(join(root, grind.answerSchema as string))).toBe(true);
  });

  it('agrees with the constants the app sends', () => {
    expect(PARENT_ASK_GRIND).toEqual({ app: grind.app, kind: grind.kind, v: (grind.versions as string[])[0] });
  });
});

const good = { answer: 'He misread "fiend" twice this week; the rest went well.', examples: ['On Tuesday he read "fiend" as "friend".'] };
const bad: { name: string; answer: unknown }[] = [
  { name: 'not an object', answer: 'He is doing fine.' },
  { name: 'null', answer: null },
  { name: 'an array', answer: [good] },
  { name: 'no answer', answer: { examples: [] } },
  { name: 'no examples', answer: { answer: 'Fine.' } },
  { name: 'an empty answer', answer: { answer: '', examples: [] } },
  { name: 'an answer that is not text', answer: { answer: 3, examples: [] } },
  { name: 'an answer over 4000 characters', answer: { answer: 'x'.repeat(4001), examples: [] } },
  { name: 'examples that are not a list', answer: { answer: 'Fine.', examples: 'none' } },
  { name: 'an example that is not text', answer: { answer: 'Fine.', examples: [1] } },
  { name: 'an empty example', answer: { answer: 'Fine.', examples: [''] } },
  { name: 'more than ten examples', answer: { answer: 'Fine.', examples: Array.from({ length: 11 }, () => 'one') } },
  { name: 'an extra field', answer: { ...good, score: 9 } },
];

describe('parent-ask answer schema', () => {
  it('is a JSON Schema 2020-12 object that refuses extra fields', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
    expect([...(schema.required as string[])].sort()).toEqual(['answer', 'examples']);
  });

  it('validates a good answer, and the guard accepts it', () => {
    expect(validate(good, schema as Schema)).toEqual([]);
    expect(isParentAskAnswer(good)).toBe(true);
  });

  it('accepts an answer with no examples', () => {
    const none = { answer: 'The sessions so far do not show that.', examples: [] };
    expect(validate(none, schema as Schema)).toEqual([]);
    expect(isParentAskAnswer(none)).toBe(true);
  });

  for (const sample of bad) {
    it(`is refused, by the schema and by the guard: ${sample.name}`, () => {
      expect(validate(sample.answer, schema as Schema)).not.toEqual([]);
      expect(isParentAskAnswer(sample.answer)).toBe(false);
    });
  }
});

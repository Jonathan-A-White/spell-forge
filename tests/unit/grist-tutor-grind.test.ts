// mw-bhvxcn.6: the tutor-turn grind (grinds/tutor-turn.json) is read by the mill, so its shape is held to
// grinds/word-list.json's plus the new fields; its answer schema is checked here, with a small validator for the
// keywords it uses, against sample answers; and isTutorAnswer, the guard the device runs, agrees with it.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TUTOR_TURN_GRIND, isTutorAnswer } from '../../src/grist';
import samples from '../fixtures/grist/tutor-turn-answers.json';

const root = process.cwd();
const readJson = (rel: string): Record<string, unknown> => JSON.parse(readFileSync(join(root, rel), 'utf8')) as Record<string, unknown>;

const grind = readJson('grinds/tutor-turn.json');
const wordList = readJson('grinds/word-list.json');
const schema = readJson('grinds/tutor-turn.answer.schema.json');

interface Schema {
  type?: string;
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Schema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

const KEYWORDS = new Set([
  '$schema', 'title', 'description', 'type', 'enum', 'const', 'properties', 'required', 'additionalProperties',
  'items', 'minItems', 'maxItems', 'minLength', 'maxLength', 'minimum', 'maximum',
]);

/** Validates `value` against the keywords above; returns the problems (none = valid). An unknown keyword throws. */
function validate(value: unknown, s: Schema, path = '$'): string[] {
  for (const k of Object.keys(s)) if (!KEYWORDS.has(k)) throw new Error(`validator does not know ${k}`);
  const problems: string[] = [];
  const kind = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  if (s.type) {
    const ok = s.type === 'integer' ? Number.isInteger(value) : s.type === kind;
    if (!ok) return [`${path}: expected ${s.type}, got ${kind}`];
  }
  if (s.enum && !s.enum.includes(value)) problems.push(`${path}: not one of ${s.enum.join(', ')}`);
  if (s.const !== undefined && value !== s.const) problems.push(`${path}: not ${String(s.const)}`);
  if (typeof value === 'string') {
    if (s.minLength !== undefined && value.length < s.minLength) problems.push(`${path}: too short`);
    if (s.maxLength !== undefined && value.length > s.maxLength) problems.push(`${path}: too long`);
  }
  if (typeof value === 'number') {
    if (s.minimum !== undefined && value < s.minimum) problems.push(`${path}: below ${s.minimum}`);
    if (s.maximum !== undefined && value > s.maximum) problems.push(`${path}: above ${s.maximum}`);
  }
  if (Array.isArray(value)) {
    if (s.minItems !== undefined && value.length < s.minItems) problems.push(`${path}: too few items`);
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

describe('grinds/tutor-turn.json', () => {
  it('has the fields of grinds/word-list.json, plus scoring, and no others', () => {
    expect(Object.keys(grind).sort()).toEqual([...Object.keys(wordList), 'scoring'].sort());
  });

  it('has the values the story names, with GrindFile types', () => {
    expect(grind.grind).toBe(1);
    expect(grind.app).toBe(wordList.app);
    expect(grind.kind).toBe('tutor-turn');
    expect(grind.versions).toEqual(['1']);
    expect(grind.model).toBe('opus');
    expect(grind.effort).toBe('high');
    expect(grind.instructions).toBe('grinds/tutor-turn.instructions.md');
    expect(grind.answerSchema).toBe('grinds/tutor-turn.answer.schema.json');
    expect(grind.attachments).toEqual({
      min: 0,
      max: 3,
      mime: ['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/ogg', 'audio/mp4'],
      maxBytes: 8_388_608,
    });
    expect(grind.scoring).toEqual({ audio: true, target_field: 'target_text' });
  });

  it('names instructions and an answer schema that exist', () => {
    expect(readFileSync(join(root, grind.instructions as string), 'utf8')).toMatch(/^# /);
    expect(existsSync(join(root, grind.answerSchema as string))).toBe(true);
  });

  it('agrees with the constants the app sends', () => {
    expect(TUTOR_TURN_GRIND).toEqual({ app: grind.app, kind: grind.kind, v: (grind.versions as string[])[0] });
  });
});

describe('tutor-turn answer schema', () => {
  it('is a JSON Schema 2020-12 object that refuses extra fields', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
  });

  it('requires the fields the child sees and names every field of design 4', () => {
    expect([...(schema.required as string[])].sort()).toEqual(['action', 'focus_words', 'layer_diagnosis', 'prompt_to_child']);
    expect(Object.keys(schema.properties as object).sort()).toEqual([
      'action', 'focus_words', 'layer_diagnosis', 'math_diagnosis', 'notes_for_parent', 'problem_kind', 'prompt_to_child',
      'recommendations_for_parent', 'target_text', 'teaching_method',
    ]);
  });

  for (const sample of samples.valid) {
    it(`validates, and the guard accepts: ${sample.name}`, () => {
      expect(validate(sample.answer, schema as Schema)).toEqual([]);
      expect(isTutorAnswer(sample.answer)).toBe(true);
    });
  }
  for (const sample of samples.invalid) {
    it(`is refused, by the schema and by the guard: ${sample.name}`, () => {
      expect(validate(sample.answer, schema as Schema)).not.toEqual([]);
      expect(isTutorAnswer(sample.answer)).toBe(false);
    });
  }
});

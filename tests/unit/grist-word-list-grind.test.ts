// mw-z361n.2: the word-list grind (grinds/word-list.json) is read by the mill, not by this app,
// so this test holds its shape to millwright's GrindFile (application/grist.go): the same
// fields with the same types, files that exist, and an answer schema that agrees with the
// hand-written guard the device uses on what comes back.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isWordListAnswer, WORD_LIST_GRIND } from '../../src/grist/word-list-answer';
import samples from '../fixtures/grist/word-list-answers.json';

const root = process.cwd();
const readJson = (rel: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(root, rel), 'utf8')) as Record<string, unknown>;

const grind = readJson('grinds/word-list.json');

describe('grinds/word-list.json', () => {
  it('has exactly the GrindFile fields', () => {
    expect(Object.keys(grind).sort()).toEqual(
      ['answerSchema', 'app', 'attachments', 'effort', 'grind', 'instructions', 'kind', 'model', 'versions'],
    );
  });

  it('has the values the story names, with GrindFile types', () => {
    expect(grind.grind).toBe(1);
    expect(grind.app).toBe('spellforge');
    expect(grind.kind).toBe('word-list');
    expect(grind.versions).toEqual(['1']);
    expect(grind.model).toBe('sonnet');
    expect(grind.effort).toBe('medium');
    expect(grind.instructions).toBe('grinds/word-list.md');
    expect(grind.answerSchema).toBe('grinds/word-list-answer-1.schema.json');
    expect(grind.attachments).toEqual({
      min: 1,
      max: 4,
      mime: ['image/jpeg', 'image/png', 'image/webp'],
      maxBytes: 4194304,
    });
  });

  it('uses an effort the mill accepts and mimes section 18 allows', () => {
    expect(['low', 'medium', 'high', 'xhigh', 'max']).toContain(grind.effort);
    const attachments = grind.attachments as { mime: string[] };
    for (const mime of attachments.mime) {
      expect(['image/jpeg', 'image/png', 'image/webp']).toContain(mime);
    }
  });

  it('names instructions and an answer schema that exist', () => {
    expect(existsSync(join(root, grind.instructions as string))).toBe(true);
    expect(existsSync(join(root, grind.answerSchema as string))).toBe(true);
  });

  it('agrees with the constants the app sends and checks', () => {
    expect(WORD_LIST_GRIND).toEqual({ app: grind.app, kind: grind.kind, v: (grind.versions as string[])[0] });
  });
});

describe('word-list request schema', () => {
  const schema = readJson('grinds/word-list-request-1.schema.json') as {
    $schema: string;
    type: string;
    required: string[];
    additionalProperties: boolean;
    properties: Record<string, Record<string, unknown>>;
  };

  it('is a JSON Schema object with the request fields', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
    expect([...schema.required].sort()).toEqual(['language', 'requestType', 'schemaVersion']);
    expect(Object.keys(schema.properties).sort()).toEqual(['language', 'listName', 'requestType', 'schemaVersion']);
    expect(schema.properties.schemaVersion.const).toBe('1');
    expect(schema.properties.requestType.const).toBe('word-list');
    expect(schema.properties.language.enum).toEqual(['en', 'es']);
    expect(schema.properties.listName.type).toBe('string');
  });
});

describe('word-list answer schema', () => {
  const schema = readJson('grinds/word-list-answer-1.schema.json') as {
    $schema: string;
    type: string;
    required: string[];
    additionalProperties: boolean;
    properties: {
      words: { type: string; maxItems: number; items: { type: string; minLength: number } };
      confidence: { type: string; minimum: number; maximum: number };
      notes: { type: string };
    };
  };

  it('is a JSON Schema 2020-12 object that refuses extra fields', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
  });

  it('requires words only, and describes words, confidence and notes', () => {
    expect(schema.required).toEqual(['words']);
    expect(Object.keys(schema.properties).sort()).toEqual(['confidence', 'notes', 'words']);
    expect(schema.properties.words).toMatchObject({
      type: 'array',
      maxItems: 200,
      items: { type: 'string', minLength: 1 },
    });
    expect(schema.properties.confidence).toMatchObject({ type: 'number', minimum: 0, maximum: 1 });
    expect(schema.properties.notes.type).toBe('string');
  });

  it('agrees with the guard on the boundaries it states', () => {
    const { words, confidence } = schema.properties;
    expect(isWordListAnswer({ words: Array(words.maxItems).fill('a') })).toBe(true);
    expect(isWordListAnswer({ words: Array(words.maxItems + 1).fill('a') })).toBe(false);
    expect(isWordListAnswer({ words: [], confidence: confidence.minimum })).toBe(true);
    expect(isWordListAnswer({ words: [], confidence: confidence.maximum })).toBe(true);
    expect(isWordListAnswer({ words: [], confidence: confidence.maximum + 0.01 })).toBe(false);
    expect(isWordListAnswer({ words: [], confidence: confidence.minimum - 0.01 })).toBe(false);
  });
});

describe('isWordListAnswer', () => {
  for (const sample of samples.valid) {
    it(`accepts: ${sample.name}`, () => {
      expect(isWordListAnswer(sample.answer)).toBe(true);
    });
  }
  for (const sample of samples.invalid) {
    it(`refuses: ${sample.name}`, () => {
      expect(isWordListAnswer(sample.answer)).toBe(false);
    });
  }
});

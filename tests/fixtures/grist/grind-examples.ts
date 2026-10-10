// mw-gq6.322: the grinds' example scenarios (grinds/examples/<kind>/<name>.json). Each holds a request the app
// really sends (with schemaVersion), optional photo file names beside it, and `expect`: simple checks on the
// answer's fields. `mw grist smoke` sends the request and runs the checks on what comes back; the unit test
// (tests/unit/grist-grind-examples.test.ts) holds every example to its grind's schemas. The checks are:
//   { path, equals }  { path, isNull }  { path, oneOf }  { path, contains }  { path, notContains }
//   { path, matches } { path, present: true }  { path, absent: true }
// A path is a field of the answer ("action", "math_diagnosis.gap", "focus_words[0].word"; a field that is an
// array is the whole array). `contains` is a substring of a string (any case) or an element of an array;
// `matches` is a regular expression (any case) tested on a string.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Schema {
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

const kindOf = (value: unknown) => (Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value);

/** Validates `value` against the keywords above; returns the problems (none = valid). An unknown keyword throws. */
export function validate(value: unknown, s: Schema, path = '$'): string[] {
  for (const k of Object.keys(s)) if (!KEYWORDS.has(k)) throw new Error(`validator does not know ${k}`);
  const problems: string[] = [];
  const kind = kindOf(value);
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
    for (const key of s.required ?? []) if (!(key in obj)) problems.push(`${path}: missing ${key}`);
    for (const [key, v] of Object.entries(obj)) {
      const sub = s.properties?.[key];
      if (sub) problems.push(...validate(v, sub, `${path}.${key}`));
      else if (s.additionalProperties === false) problems.push(`${path}: unexpected ${key}`);
    }
  }
  return problems;
}

// ─── The scenarios ────────────────────────────────────────────

export const CHECK_OPERATORS = ['equals', 'isNull', 'oneOf', 'contains', 'notContains', 'matches', 'present', 'absent'] as const;
export type CheckOperator = (typeof CHECK_OPERATORS)[number];
export type Check = { path: string } & Partial<Record<CheckOperator, unknown>>;

export interface Scenario {
  /** What this scenario shows, in a plain sentence. */
  about: string;
  request: Record<string, unknown>;
  /** File names beside the scenario: the photos that travel with the request, in order. */
  photos?: string[];
  expect: Check[];
}

export const EXAMPLES_DIR = 'grinds/examples';

/** A path as steps: "focus_words[0].word" is ['focus_words', 0, 'word']. */
export function parsePath(path: string): (string | number)[] {
  const steps: (string | number)[] = [];
  const re = /([^.[\]]+)|\[(\d*)\]/g;
  let consumed = 0;
  for (let m = re.exec(path); m; m = re.exec(path)) {
    consumed += m[0].length;
    if (m[1] !== undefined) steps.push(m[1]);
    else if (m[2] !== '') steps.push(Number(m[2]));
  }
  const dots = (path.match(/\./g) ?? []).length;
  if (path === '' || consumed + dots < path.length) throw new Error(`not a path: ${path}`);
  return steps;
}

/** The schema node a path leads to, or undefined when the answer schema has no such field. */
export function schemaAt(root: Schema, path: string): Schema | undefined {
  let node: Schema | undefined = root;
  for (const step of parsePath(path)) {
    if (!node) return undefined;
    node = typeof step === 'number' ? node.items : node.properties?.[step];
  }
  return node;
}

/** The value a path leads to in an answer; `found` is false when a step is missing. */
export function valueAt(answer: unknown, path: string): { found: boolean; value?: unknown } {
  let value: unknown = answer;
  for (const step of parsePath(path)) {
    if (typeof step === 'number') {
      if (!Array.isArray(value) || step >= value.length) return { found: false };
      value = value[step];
    } else {
      if (typeof value !== 'object' || value === null || Array.isArray(value) || !(step in value)) return { found: false };
      value = (value as Record<string, unknown>)[step];
    }
  }
  return { found: true, value };
}

export const operatorOf = (check: Check): CheckOperator | undefined => {
  const used = CHECK_OPERATORS.filter((op) => op in check);
  return used.length === 1 ? used[0] : undefined;
};

/** Runs one check on an answer; returns what is wrong, or undefined when it holds. */
export function runCheck(answer: unknown, check: Check): string | undefined {
  const op = operatorOf(check);
  if (!op) return `${check.path}: a check needs exactly one of ${CHECK_OPERATORS.join(', ')}`;
  const { found, value } = valueAt(answer, check.path);
  const operand = check[op];
  if (op === 'absent') return found === (operand === false) ? undefined : `${check.path}: should be absent`;
  if (op === 'present') return found === (operand !== false) ? undefined : `${check.path}: should be present`;
  if (!found) return `${check.path}: missing`;
  switch (op) {
    case 'isNull':
      return (value === null) === (operand !== false) ? undefined : `${check.path}: ${operand === false ? 'should not be null' : 'should be null'}`;
    case 'equals':
      return JSON.stringify(value) === JSON.stringify(operand) ? undefined : `${check.path}: ${JSON.stringify(value)} is not ${JSON.stringify(operand)}`;
    case 'oneOf':
      return (operand as unknown[]).some((o) => JSON.stringify(o) === JSON.stringify(value)) ? undefined : `${check.path}: ${JSON.stringify(value)} is none of ${JSON.stringify(operand)}`;
    case 'contains':
    case 'notContains': {
      const has =
        typeof value === 'string' ? value.toLowerCase().includes(String(operand).toLowerCase()) :
        Array.isArray(value) ? value.some((item) => JSON.stringify(item) === JSON.stringify(operand)) : false;
      return has === (op === 'contains') ? undefined : `${check.path}: ${op === 'contains' ? 'lacks' : 'has'} ${JSON.stringify(operand)}`;
    }
    case 'matches':
      return typeof value === 'string' && new RegExp(String(operand), 'i').test(value) ? undefined : `${check.path}: ${JSON.stringify(value)} does not match /${String(operand)}/`;
  }
}

/** Every check that fails on an answer. */
export const failedChecks = (answer: unknown, checks: Check[]): string[] =>
  checks.map((check) => runCheck(answer, check)).filter((problem): problem is string => problem !== undefined);

// ─── The files ────────────────────────────────────────────────

export interface GrindFile {
  kind: string;
  versions: string[];
  answerSchema: string;
  attachments: { min: number; max: number; mime: string[]; maxBytes: number };
}

const readJson = <T>(root: string, rel: string): T => JSON.parse(readFileSync(join(root, rel), 'utf8')) as T;

/** The grind files in grinds/: the JSON files that name a kind (the schemas do not). */
export function listGrinds(root: string): GrindFile[] {
  return readdirSync(join(root, 'grinds'))
    .filter((name) => name.endsWith('.json') && !name.includes('.schema.'))
    .map((name) => readJson<GrindFile>(root, `grinds/${name}`))
    .filter((grind) => typeof grind.kind === 'string');
}

/** The grind's input schema: grinds/<kind>.request.schema.json, or grinds/<kind>-request-<v>.schema.json. */
export function requestSchemaPath(root: string, grind: GrindFile): string | undefined {
  return [`grinds/${grind.kind}.request.schema.json`, ...grind.versions.map((v) => `grinds/${grind.kind}-request-${v}.schema.json`)].find((rel) =>
    existsSync(join(root, rel)),
  );
}

/** The scenario files of a grind, by file name. */
export function listScenarios(root: string, kind: string): string[] {
  const dir = join(root, EXAMPLES_DIR, kind);
  return existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.json')).sort() : [];
}

export const readScenario = (root: string, kind: string, file: string): Scenario => readJson<Scenario>(root, `${EXAMPLES_DIR}/${kind}/${file}`);

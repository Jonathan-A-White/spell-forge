// The grinds' example scenarios (grinds/examples/<kind>/<name>.json; mw-gq6.322, reshaped to mw's own by mw-gq6.330).
// Each holds a request the app really sends (with schemaVersion), optional photo file names beside it, and `expect`.
// `mw grist smoke` (millwright application/gristsmokecheck.go, GristExample) sends the request and holds the answer
// to `expect`, and it reads ONE shape; this file is the same reader in TypeScript, so the unit test
// (tests/unit/grist-grind-examples.test.ts) refuses what the smoke would refuse:
//   "expect": { "<answer path>": <check>, ... }       an OBJECT, one key for each path; never a list
// A path is dotted, object keys and array positions ("action", "math_diagnosis.gap", "focus_words.0.word"; a field
// that is an array is the whole array). A check is a bare value (the field equals it) or an object of any of:
//   equals  is_null (true|false)  one_of (a list)  contains  matches (a regular expression)  present (true|false)  all
// every one of which must hold. `all` is a list of checks of the same kinds (a bare value, or such an object), each
// of which must hold too: it is how one path shows several things ("answer": {"all": [{"matches": "a"}, {"matches": "b"}]}).
// `contains` is a substring of a string (case matters) or an element of an array. `matches` is a regular expression
// in Go's RE2 syntax tested on a string; it is case-sensitive unless it begins (?i), and it has no look-ahead,
// look-behind or backreference. There is no "does not contain" check: say it as `matches` with avoidsPattern(text).
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

export const CHECK_KEYS = ['equals', 'is_null', 'one_of', 'contains', 'matches', 'present', 'all'] as const;

/** One path's expectation, parsed: every part that is set must hold (mw's gristCheck). */
export interface Check {
  equals?: { value: unknown };
  isNull?: boolean;
  oneOf?: unknown[];
  contains?: { value: unknown };
  matches?: { source: string; regex: RegExp };
  present?: boolean;
  all?: Check[];
}

export interface Scenario {
  /** What this scenario shows, in a plain sentence. */
  about: string;
  request: Record<string, unknown>;
  /** File names beside the scenario: the photos that travel with the request, in order. */
  photos?: string[];
  /** The checks, an object: answer path -> a bare value or a check object. A list is refused. */
  expect: Record<string, unknown>;
}

export const EXAMPLES_DIR = 'grinds/examples';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sameJson = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  if (isPlainObject(a) || isPlainObject(b)) {
    if (!isPlainObject(a) || !isPlainObject(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => k in b && sameJson(a[k], b[k]));
  }
  return a === b;
};

/** A Go (RE2) pattern as a JavaScript one: a leading (?i) is the i flag; what RE2 lacks (look-around, backreferences) throws. */
export function compilePattern(pattern: string): RegExp {
  let source = pattern;
  let flags = '';
  if (source.startsWith('(?i)')) {
    source = source.slice(4);
    flags = 'i';
  }
  if (/\(\?(?!:)/.test(source)) throw new Error(`matches ${pattern}: only (?i) at the start and (?:...) groups are in RE2's syntax this check allows`);
  if (/\\[1-9]/.test(source)) throw new Error(`matches ${pattern}: RE2 has no backreferences`);
  return new RegExp(source, flags);
}

/** Reads one check the way mw does; throws what mw would refuse. A bare value (anything but an object) is an `equals`. */
export function parseCheck(raw: unknown): Check {
  if (!isPlainObject(raw)) return { equals: { value: raw } };
  const keys = Object.keys(raw);
  if (keys.length === 0) throw new Error(`a check of none of ${CHECK_KEYS.join(', ')}`);
  const check: Check = {};
  for (const key of keys) {
    const value = raw[key];
    switch (key) {
      case 'equals':
        check.equals = { value };
        break;
      case 'contains':
        check.contains = { value };
        break;
      case 'is_null':
      case 'present':
        if (typeof value !== 'boolean') throw new Error(`${key} is true or false`);
        if (key === 'is_null') check.isNull = value;
        else check.present = value;
        break;
      case 'one_of':
        if (!Array.isArray(value) || value.length === 0) throw new Error('one_of is a list of values');
        check.oneOf = value;
        break;
      case 'matches':
        if (typeof value !== 'string') throw new Error('matches is a regular expression in a string');
        check.matches = { source: value, regex: compilePattern(value) };
        break;
      case 'all':
        if (!Array.isArray(value) || value.length === 0) throw new Error('all is a list of checks');
        check.all = value.map(parseCheck);
        break;
      default:
        throw new Error(`"${key}" is not a check: use ${CHECK_KEYS.join(', ')}`);
    }
  }
  return check;
}

/** Reads a scenario's expect: an object, one key for each answer path, each a check. Throws on a list or an unknown check. */
export function parseExpect(expect: unknown): Map<string, Check> {
  if (!isPlainObject(expect)) throw new Error('expect is an object, one key for each answer path, not a list');
  const checks = new Map<string, Check>();
  for (const [path, raw] of Object.entries(expect)) {
    try {
      checks.set(path, parseCheck(raw));
    } catch (error) {
      throw new Error(`expect "${path}": ${(error as Error).message}`);
    }
  }
  return checks;
}

/** A path as steps: "focus_words.0.word" is ['focus_words', '0', 'word']; an empty path is the whole answer. */
export const pathSteps = (path: string): string[] => (path === '' ? [] : path.split('.'));

/** The schema node a path leads to, or undefined when the answer schema has no such field. */
export function schemaAt(root: Schema, path: string): Schema | undefined {
  let node: Schema | undefined = root;
  for (const step of pathSteps(path)) {
    if (!node) return undefined;
    node = /^\d+$/.test(step) && node.items ? node.items : node.properties?.[step];
  }
  return node;
}

/** The value a path leads to in an answer; `found` is false when a step is missing. */
export function valueAt(answer: unknown, path: string): { found: boolean; value?: unknown } {
  let value: unknown = answer;
  for (const step of pathSteps(path)) {
    if (Array.isArray(value)) {
      const at = /^\d+$/.test(step) ? Number(step) : -1;
      if (at < 0 || at >= value.length) return { found: false };
      value = value[at];
    } else if (isPlainObject(value) && step in value) value = value[step];
    else return { found: false };
  }
  return { found: true, value };
}

const show = (value: unknown) => JSON.stringify(value);

/** What fails when `got` (found or not) is held to a check: one line each (mw's gristCheck.failures). */
function checkFailures(check: Check, path: string, got: unknown, found: boolean): string[] {
  const seen = found ? show(got) : '(absent)';
  const failed: string[] = [];
  const fail = (wanted: string) => failed.push(`${path}: wanted ${wanted}, got ${seen}`);
  if (check.present !== undefined && found !== check.present) fail(check.present ? 'present' : 'absent');
  if (check.isNull !== undefined && (found && got === null) !== check.isNull) fail(check.isNull ? 'null' : 'not null');
  if (check.equals && !(found && sameJson(got, check.equals.value))) fail(`equal to ${show(check.equals.value)}`);
  if (check.oneOf && !check.oneOf.some((want) => found && sameJson(got, want))) fail(`one of ${show(check.oneOf)}`);
  if (check.contains) {
    const want = check.contains.value;
    const has =
      found &&
      (typeof got === 'string' ? typeof want === 'string' && got.includes(want) : Array.isArray(got) && got.some((element) => sameJson(element, want)));
    if (!has) fail(`containing ${show(want)}`);
  }
  if (check.matches && !(found && typeof got === 'string' && check.matches.regex.test(got))) fail(`matching ${show(check.matches.source)}`);
  for (const inner of check.all ?? []) failed.push(...checkFailures(inner, path, got, found));
  return failed;
}

/** Every thing an answer fails to show of a scenario's expect. */
export function failedChecks(answer: unknown, expect: Map<string, Check>): string[] {
  return [...expect].flatMap(([path, check]) => {
    const { found, value } = valueAt(answer, path);
    return checkFailures(check, path, value, found);
  });
}

/** The checks of a scenario's expect that are plain checks, `all` unfolded, each with its path. */
export function flatChecks(expect: Map<string, Check>): { path: string; check: Check }[] {
  const out: { path: string; check: Check }[] = [];
  const walk = (path: string, check: Check) => {
    out.push({ path, check });
    for (const inner of check.all ?? []) walk(path, inner);
  };
  for (const [path, check] of expect) walk(path, check);
  return out;
}

/**
 * An RE2 pattern for "does not contain text, in any case": mw's checks have no notContains, and RE2 has no
 * look-ahead, so the pattern spells out the strings that never complete text (the automaton of the text's
 * prefixes, as a regular expression). Put it in a `matches`.
 */
export function avoidsPattern(text: string): string {
  const word = [...text.toLowerCase()];
  const n = word.length;
  if (n === 0) throw new Error('avoidsPattern needs some text');
  const alphabet = [...new Set(word)];
  const border: number[] = [0, 0];
  for (let i = 1; i < n; i++) {
    let j = border[i];
    while (j > 0 && word[i] !== word[j]) j = border[j];
    border.push(word[i] === word[j] ? j + 1 : 0);
  }
  const step = (state: number, c: string): number => {
    for (let s = state; ; s = border[s]) {
      if (s < n && word[s] === c) return s + 1;
      if (s === 0) return 0;
    }
  };
  // A regular expression under construction: its text, and whether it is a union (0), a sequence (1) or one atom (2).
  type Re = { text: string; rank: number } | null;
  const group = (re: NonNullable<Re>, rank: number) => (re.rank < rank ? `(?:${re.text})` : re.text);
  const union = (a: Re, b: Re): Re => (a === null ? b : b === null ? a : a.text === b.text ? a : { text: `${a.text}|${b.text}`, rank: 0 });
  const concat = (a: Re, b: Re): Re =>
    a === null || b === null ? null : a.text === '' ? b : b.text === '' ? a : { text: group(a, 1) + group(b, 1), rank: 1 };
  const star = (a: Re): NonNullable<Re> =>
    a === null || a.text === '' ? { text: '', rank: 2 } : { text: `${group(a, 2)}*`, rank: 2 };
  const quote = (c: string) => (/[\\\]^-]/.test(c) ? `\\${c}` : c);
  const literal = (c: string) => (/[.*+?()|[\]{}^$\\]/.test(c) ? `\\${c}` : c);
  const symbols = [...alphabet, ''];
  const edge = new Map<string, Set<string>>();
  for (let k = 0; k < n; k++)
    for (const c of symbols) {
      const to = step(k, c);
      if (to < n) edge.set(`${k}>${to}`, (edge.get(`${k}>${to}`) ?? new Set()).add(c));
    }
  const render = (set: Set<string>): string => {
    if (set.has('')) return `[^${alphabet.filter((c) => !set.has(c)).map(quote).join('')}]`;
    return set.size === 1 ? literal([...set][0]) : `[${[...set].map(quote).join('')}]`;
  };
  const re: Re[][] = Array.from({ length: n + 1 }, () => Array<Re>(n + 1).fill(null));
  for (const [key, set] of edge) {
    const [from, to] = key.split('>').map(Number);
    re[from][to] = { text: render(set), rank: 2 };
  }
  for (let i = 0; i < n; i++) re[i][n] = { text: '', rank: 2 }; // every state but the full match may end the string
  for (let k = n - 1; k >= 0; k--) {
    const loop = star(re[k][k]);
    if (k === 0) {
      const all = concat(loop, re[0][n]);
      return `(?i)^${group(all as NonNullable<Re>, 1)}$`;
    }
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n; j++)
        if (i !== k && j !== k && re[i][k] && re[k][j]) re[i][j] = union(re[i][j], concat(concat(re[i][k], loop), re[k][j]));
    for (let i = 0; i <= n; i++) re[i][k] = re[k][i] = null;
  }
  throw new Error('unreachable');
}

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

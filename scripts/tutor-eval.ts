// scripts/tutor-eval.ts — Runs the eval cases of the tutor-turn and tutor-talk grinds (grinds/tutor-turn.eval/<case>/,
// grinds/tutor-talk.eval/<case>/) through `claude --print`, with the grind's instructions as the system prompt, its
// answer schema as the structured output, and its model and effort, then checks each answer against the case's
// expected.json. A case is one directory: input.json + expected.json, or several input.<variant>.json +
// expected.<variant>.json pairs (a run each), and work.png / problem.png (tutor-turn) or picture-1.png ... (tutor-talk)
// attached when the request names them. It spends fuel, so it is not in the gate:
// `npm run tutor:eval [prefix ...]`, a prefix of a case's name or of `<grind>/<case>` (`npm run tutor:eval -- redteam`).
// Every expected.json forbids the answer in `never_contains` (tutor-turn's older `answer_must_not_appear` is the
// same list). Exits non-zero when any case fails; answers are kept in a temp dir. At most TUTOR_EVAL_JOBS (default 6)
// claude processes run at once, so a run of every case does not swamp the host.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TutorRequest } from '../src/contracts/types';
import type { TutorTalkRequest } from '../src/features/front-door/tutor-talk-request';
import { isTutorAnswer } from '../src/grist/tutor-answer';

const ROOT = join(import.meta.dirname, '..');
export const EVAL_DIR = join(ROOT, 'grinds/tutor-turn.eval');
export const TALK_EVAL_DIR = join(ROOT, 'grinds/tutor-talk.eval');

export type GrindKind = 'tutor-turn' | 'tutor-talk';

/** The grinds this script evaluates: their eval dir, the label of a request in the message, and their tutor-eval order. */
export const GRINDS: Record<GrindKind, { dir: string; label: string }> = {
  'tutor-turn': { dir: EVAL_DIR, label: 'Tutor Turn Request' },
  'tutor-talk': { dir: TALK_EVAL_DIR, label: 'Tutor Talk Request' },
};

/** A case's expected.json: what the answer must be, and what must never appear in it. */
export interface Expected {
  about: string;
  /** The action, or the actions any of which will do (a red-team case: every teaching turn is right). */
  action: string | string[];
  layer_diagnosis: string;
  /** The problem's answer, as a numeral and in words: never in prompt_to_child, focus_words or math_diagnosis. */
  never_contains?: string[];
  /** The older name of never_contains, kept in the tutor-turn cases that have it; the two are one list. */
  answer_must_not_appear?: string[];
  /** A word that must be in focus_words, with at least this many chunks. */
  focus_word?: { word: string; min_chunks: number };
  /** Words that must all be in focus_words, in this (reading) order: every misread that counts, none let pass. */
  focus_words_in_order?: string[];
  /** Words prompt_to_child must not say (the word the child is to decode). */
  prompt_must_not_say?: string[];
  /** math_diagnosis must be present, and its where_wrong or gap must mention one of these. */
  gap_mentions_any?: string[];
  /** math_diagnosis must be absent: the maths is not judged yet (a handwriting rewrite comes first). */
  no_math_diagnosis?: boolean;
  /** prompt_to_child must mention at least one of each group (a substring, any case). */
  prompt_mentions_each?: string[][];
  notes_required?: boolean;
  teaching_method_required?: boolean;
  prompt_max_chars?: number;
}

/** A tutor-talk case's expected.json: the answer's `words` (and the rest it says) hold none of never_contains. */
export interface TalkExpected {
  about: string;
  /** The homework's answer, as a numeral and in words: never in words, form_values, goal_suggestion or memory_update. */
  never_contains?: string[];
  /** Words `words` must not say. */
  words_must_not_say?: string[];
  words_max_chars?: number;
  /** `words` must mention at least one of each group (a substring, any case). */
  words_mention_each?: string[][];
  /** The answer opens no world (the child asked for homework, not for a world). */
  no_world?: boolean;
}

/** The forbidden strings of an expected.json, whichever name it uses. */
export const forbiddenOf = (expected: { never_contains?: string[]; answer_must_not_appear?: string[] }): string[] => [
  ...(expected.never_contains ?? []),
  ...(expected.answer_must_not_appear ?? []),
];

interface RunOf<K extends GrindKind, I, E> {
  /** "case" or "case/variant". */
  name: string;
  grind: K;
  input: I;
  expected: E;
  photos: string[];
}
export type TurnRun = RunOf<'tutor-turn', TutorRequest, Expected>;
export type TalkRun = RunOf<'tutor-talk', TutorTalkRequest, TalkExpected>;
export type EvalRun = TurnRun | TalkRun;

export interface EvalCase<R extends EvalRun = TurnRun> {
  name: string;
  runs: R[];
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

/** The pictures a request names, beside its input: tutor-turn's problem.png and work.png, tutor-talk's picture-<n>.png. */
function photosOf(kind: GrindKind, caseDir: string, input: TutorRequest | TutorTalkRequest): string[] {
  if (kind === 'tutor-talk') {
    const count = (input as TutorTalkRequest).pictures ?? 0;
    return Array.from({ length: count }, (_, i) => join(caseDir, `picture-${i + 1}.png`));
  }
  const turn = input as TutorRequest;
  const photos: string[] = [];
  if (turn.mode === 'problem-in') photos.push(join(caseDir, 'problem.png'));
  if (turn.work_photo) photos.push(join(caseDir, 'work.png'));
  return photos;
}

/** Every case under `dir` (the eval dir of grind `kind`), each with its runs, in name order. */
export function loadCases(dir?: string, kind?: 'tutor-turn'): EvalCase<TurnRun>[];
export function loadCases(dir: string, kind: 'tutor-talk'): EvalCase<TalkRun>[];
export function loadCases(dir = EVAL_DIR, kind: GrindKind = 'tutor-turn'): EvalCase<EvalRun>[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const caseDir = join(dir, name);
      const inputs = readdirSync(caseDir).filter((f) => /^input(\.[\w-]+)?\.json$/.test(f)).sort();
      if (inputs.length === 0) throw new Error(`${name}: no input.json`);
      const runs = inputs.map((file) => {
        const variant = file.slice('input'.length, -'.json'.length);
        const expectedPath = join(caseDir, `expected${variant}.json`);
        if (!existsSync(expectedPath)) throw new Error(`${name}: ${file} has no expected${variant}.json`);
        const input = readJson<TutorRequest | TutorTalkRequest>(join(caseDir, file));
        const photos = photosOf(kind, caseDir, input);
        for (const photo of photos) if (!existsSync(photo)) throw new Error(`${name}: ${file} needs ${photo}`);
        return {
          name: variant ? `${name}/${variant.slice(1)}` : name,
          grind: kind,
          input,
          expected: readJson<Expected | TalkExpected>(expectedPath),
          photos,
        } as EvalRun;
      });
      return { name, runs };
    });
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The forbidden strings that appear in `text`: numerals not inside a longer number, words as whole words. */
export function answerAppears(text: string, forbidden: string[]): string[] {
  return forbidden.filter((f) => {
    const body = escape(f.trim()).replace(/[-\s]+/g, '[\\s-]+');
    const pattern = /^\d/.test(f) ? `(?<![\\d])${body}(?![\\d])` : `\\b${body}\\b`;
    return new RegExp(pattern, 'i').test(text);
  });
}

const words = (text: string, list: string[]): string[] => list.filter((w) => new RegExp(`\\b${escape(w)}\\b`, 'i').test(text));

/** What is wrong with `answer` against `expected`; none = the run passes. */
export function checkAnswer(answer: unknown, expected: Expected): string[] {
  if (!isTutorAnswer(answer)) return ['not a valid Tutor Turn Answer'];
  const problems: string[] = [];
  const actions = ([] as string[]).concat(expected.action);
  if (!actions.includes(answer.action)) problems.push(`action ${answer.action}, expected ${actions.join(' or ')}`);
  if (answer.layer_diagnosis !== expected.layer_diagnosis) {
    problems.push(`layer_diagnosis ${answer.layer_diagnosis}, expected ${expected.layer_diagnosis}`);
  }

  const childSees: [string, string][] = [
    ['prompt_to_child', answer.prompt_to_child],
    ...answer.focus_words.map((f, i): [string, string] => [`focus_words[${i}]`, [f.word, ...f.chunks].join(' | ')]),
    ...Object.entries(answer.math_diagnosis ?? {}).map(([k, v]): [string, string] => [`math_diagnosis.${k}`, v]),
  ];
  for (const [field, text] of childSees) {
    for (const hit of answerAppears(text, forbiddenOf(expected))) problems.push(`the answer "${hit}" appears in ${field}`);
  }

  if (expected.focus_word) {
    const { word, min_chunks } = expected.focus_word;
    const focus = answer.focus_words.find((f) => f.word.toLowerCase() === word.toLowerCase());
    if (!focus) problems.push(`"${word}" is not in focus_words`);
    else if (focus.chunks.length < min_chunks) problems.push(`"${word}" has ${focus.chunks.length} chunks, expected ${min_chunks} or more`);
  }
  if (expected.focus_words_in_order) {
    const want = expected.focus_words_in_order.map((w) => w.toLowerCase());
    const got = answer.focus_words.map((f) => f.word.toLowerCase());
    const missing = want.filter((w) => !got.includes(w));
    for (const w of missing) problems.push(`"${w}" is not in focus_words`);
    const kept = got.filter((w) => want.includes(w));
    if (missing.length === 0 && kept.join('|') !== want.join('|')) {
      problems.push(`focus_words should list ${want.join(', ')} in that order, got ${kept.join(', ')}`);
    }
  }
  for (const said of words(answer.prompt_to_child, expected.prompt_must_not_say ?? [])) {
    problems.push(`prompt_to_child says "${said}"`);
  }
  if (expected.gap_mentions_any) {
    const d = answer.math_diagnosis;
    if (!d) problems.push('no math_diagnosis');
    else if (!expected.gap_mentions_any.some((m) => `${d.where_wrong} ${d.gap}`.toLowerCase().includes(m.toLowerCase()))) {
      problems.push(`math_diagnosis names none of: ${expected.gap_mentions_any.join(', ')}`);
    }
  }
  if (expected.no_math_diagnosis && answer.math_diagnosis) problems.push('math_diagnosis is there, but the handwriting comes first');
  for (const group of expected.prompt_mentions_each ?? []) {
    if (!group.some((m) => answer.prompt_to_child.toLowerCase().includes(m.toLowerCase()))) {
      problems.push(`prompt_to_child mentions none of: ${group.join(', ')}`);
    }
  }
  if (expected.notes_required && !answer.notes_for_parent?.trim()) problems.push('no notes_for_parent');
  if (expected.teaching_method_required && !answer.teaching_method?.trim()) problems.push('no teaching_method');
  if (expected.prompt_max_chars !== undefined && answer.prompt_to_child.length > expected.prompt_max_chars) {
    problems.push(`prompt_to_child is ${answer.prompt_to_child.length} chars, expected ${expected.prompt_max_chars} or fewer`);
  }
  return problems;
}

/** A tutor-talk answer, as far as the checker reads it (grinds/tutor-talk.answer.schema.json). */
export interface TutorTalkAnswer {
  words: string;
  goal_suggestion?: { id: string; why: string };
  world?: 'spelling' | 'maths';
  memory_update?: { add?: string[]; remove?: string[]; summary?: string };
  form_values?: { field: string; value: string }[];
}

const TALK_KEYS = new Set(['words', 'profile_update', 'goal_suggestion', 'world', 'memory_update', 'form_values', 'form_ask']);

/** Whether `value` fits the shape of grinds/tutor-talk.answer.schema.json (its required `words`, its known keys, the types the checker reads). */
export function isTalkAnswer(value: unknown): value is TutorTalkAnswer {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const answer = value as Record<string, unknown>;
  if (Object.keys(answer).some((key) => !TALK_KEYS.has(key))) return false;
  if (typeof answer.words !== 'string' || answer.words.length === 0 || answer.words.length > 1000) return false;
  const list = (v: unknown): boolean => v === undefined || (Array.isArray(v) && v.every((x) => typeof x === 'string'));
  const memory = answer.memory_update as Record<string, unknown> | undefined;
  if (memory !== undefined && (typeof memory !== 'object' || memory === null || !list(memory.add) || !list(memory.remove))) return false;
  const goal = answer.goal_suggestion as Record<string, unknown> | undefined;
  if (goal !== undefined && (typeof goal !== 'object' || goal === null || typeof goal.id !== 'string' || typeof goal.why !== 'string')) return false;
  const forms = answer.form_values;
  if (forms !== undefined && !(Array.isArray(forms) && forms.every((f) => typeof f?.field === 'string' && typeof f?.value === 'string'))) return false;
  return answer.world === undefined || answer.world === 'spelling' || answer.world === 'maths';
}

/** What is wrong with a tutor-talk `answer` against `expected`; none = the run passes. */
export function checkTalkAnswer(answer: unknown, expected: TalkExpected): string[] {
  if (!isTalkAnswer(answer)) return ['not a valid Tutor Talk Answer'];
  const problems: string[] = [];
  // Everything the child hears or the talk keeps: the answer must not be in any of it.
  const kept: [string, string][] = [
    ['words', answer.words],
    ['goal_suggestion.why', answer.goal_suggestion?.why ?? ''],
    ...(answer.form_values ?? []).map((f, i): [string, string] => [`form_values[${i}]`, f.value]),
    ...(answer.memory_update?.add ?? []).map((a, i): [string, string] => [`memory_update.add[${i}]`, a]),
    ['memory_update.summary', answer.memory_update?.summary ?? ''],
  ];
  for (const [field, text] of kept) {
    for (const hit of answerAppears(text, forbiddenOf(expected))) problems.push(`the answer "${hit}" appears in ${field}`);
  }
  for (const said of words(answer.words, expected.words_must_not_say ?? [])) problems.push(`words says "${said}"`);
  for (const group of expected.words_mention_each ?? []) {
    if (!group.some((m) => answer.words.toLowerCase().includes(m.toLowerCase()))) problems.push(`words mentions none of: ${group.join(', ')}`);
  }
  if (expected.words_max_chars !== undefined && answer.words.length > expected.words_max_chars) {
    problems.push(`words is ${answer.words.length} chars, expected ${expected.words_max_chars} or fewer`);
  }
  if (expected.no_world && answer.world) problems.push(`world ${answer.world} is opened, but the child asked for homework`);
  return problems;
}

/** What is wrong with `answer` for this run, by its grind's own checker. */
export const checkRun = (run: EvalRun, answer: unknown): string[] =>
  run.grind === 'tutor-talk' ? checkTalkAnswer(answer, run.expected) : checkAnswer(answer, run.expected);

/** Whether a case is picked by `prefixes`: each is the start of its name or of `<grind>/<name>`; none picks every case. */
export function matchesPrefix(grind: GrindKind, caseName: string, prefixes: string[]): boolean {
  return prefixes.length === 0 || prefixes.some((p) => caseName.startsWith(p) || `${grind}/${caseName}`.startsWith(p));
}

/** Every case of both grinds' eval dirs that `prefixes` pick, in grind then name order. */
export function selectCases(prefixes: string[]): { grind: GrindKind; case: EvalCase<EvalRun> }[] {
  const all = [
    ...loadCases(TALK_EVAL_DIR, 'tutor-talk').map((c) => ({ grind: 'tutor-talk' as const, case: c as EvalCase<EvalRun> })),
    ...loadCases().map((c) => ({ grind: 'tutor-turn' as const, case: c as EvalCase<EvalRun> })),
  ];
  return all.filter((c) => matchesPrefix(c.grind, c.case.name, prefixes));
}

/** The answer in `claude --print --output-format stream-json` output: its result's structured_output, else its text. */
export function readClaudeResult(stdout: string): unknown {
  const lines = stdout.split('\n').filter((line) => line.trim().startsWith('{'));
  const result = lines.map((line) => JSON.parse(line) as Record<string, unknown>).find((m) => m.type === 'result');
  if (!result) throw new Error('claude printed no result');
  if (result.is_error) throw new Error(`claude: ${String(result.result ?? result.subtype)}`);
  if (result.structured_output !== undefined) return result.structured_output;
  const text = String(result.result ?? '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error(`claude answered no JSON: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1));
}

/** The one stream-json user message of a run: the request as text, then its photos. */
export function buildMessage(run: EvalRun): string {
  const content: Record<string, unknown>[] = [
    { type: 'text', text: `${GRINDS[run.grind].label}:\n${JSON.stringify(run.input, null, 2)}` },
    ...run.photos.map((photo) => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: readFileSync(photo).toString('base64') },
    })),
  ];
  return JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n';
}

interface Grind {
  model: string;
  effort: string;
  instructions: string;
  answerSchema: string;
}

function runClaude(run: EvalRun, grind: Grind, model: string): Promise<string> {
  // The CLI's validator does not know the 2020-12 meta-schema by its $schema URL; the rest it checks as written.
  const schema = readJson<Record<string, unknown>>(join(ROOT, grind.answerSchema));
  delete schema.$schema;
  const args = [
    '--print', '--model', model, '--effort', grind.effort,
    '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--tools', '', '--no-session-persistence',
    '--system-prompt', readFileSync(join(ROOT, grind.instructions), 'utf8'),
    '--json-schema', JSON.stringify(schema),
  ];
  // An empty working directory, so no project CLAUDE.md reaches the tutor.
  const cwd = mkdtempSync(join(tmpdir(), 'tutor-eval-cwd-'));
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), 15 * 60_000);
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`claude exited ${code}: ${stderr.trim().slice(0, 500) || stdout.slice(-500)}`));
    });
    child.stdin.end(buildMessage(run));
  });
}

/** `work` over `items`, at most `jobs` at once, the results in the order of `items`. */
export async function mapLimited<T, R>(items: T[], jobs: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      results[i] = await work(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, items.length)) }, worker));
  return results;
}

async function main(): Promise<void> {
  const picked = selectCases(process.argv.slice(2));
  if (picked.length === 0) {
    console.error(`tutor:eval: no case starts with ${process.argv.slice(2).join(' or ')}`);
    process.exit(1);
  }
  const grinds = new Map<GrindKind, Grind>(
    [...new Set(picked.map((p) => p.grind))].map((kind) => [kind, readJson<Grind>(join(ROOT, `grinds/${kind}.json`))]),
  );
  const modelOf = (kind: GrindKind): string => process.env.TUTOR_EVAL_MODEL ?? grinds.get(kind)!.model;
  const outDir = mkdtempSync(join(tmpdir(), 'tutor-eval-'));
  const runs = picked.flatMap((p) => p.case.runs.map((run) => ({ run, label: `${p.grind}/${run.name}` })));
  const models = [...grinds.keys()].map((kind) => `${kind} ${modelOf(kind)} (effort ${grinds.get(kind)!.effort})`).join(', ');
  const jobs = Number(process.env.TUTOR_EVAL_JOBS) || 6;
  console.log(`tutor:eval: ${picked.length} cases with ${models}, ${jobs} at once; answers in ${outDir}`);

  const results = await mapLimited(runs, jobs, async ({ run, label }) => {
    let problems: string[];
    try {
      const answer = readClaudeResult(await runClaude(run, grinds.get(run.grind)!, modelOf(run.grind)));
      writeFileSync(join(outDir, `${label.replace('/', '.').replace('/', '.')}.json`), JSON.stringify(answer, null, 2) + '\n');
      problems = checkRun(run, answer);
      console.log(`\n${problems.length === 0 ? 'PASS' : 'FAIL'} ${label}: ${run.expected.about}`);
      if (run.grind === 'tutor-talk' && isTalkAnswer(answer)) console.log(`  "${answer.words}"`);
      else if (isTutorAnswer(answer)) console.log(`  ${answer.action} / ${answer.layer_diagnosis}: "${answer.prompt_to_child}"`);
    } catch (error) {
      problems = [error instanceof Error ? error.message : String(error)];
      console.log(`\nFAIL ${label}: ${run.expected.about}`);
    }
    for (const problem of problems) console.log(`  - ${problem}`);
    return { run, ok: problems.length === 0 };
  });

  const passedCases = picked.filter((p) => p.case.runs.every((r) => results.find((x) => x.run === r)?.ok));
  const passedRuns = results.filter((r) => r.ok).length;
  console.log(`\ntutor:eval: ${passedCases.length}/${picked.length} cases passed (${passedRuns}/${results.length} runs)`);
  if (passedCases.length !== picked.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}

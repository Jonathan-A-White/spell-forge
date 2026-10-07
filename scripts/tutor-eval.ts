// scripts/tutor-eval.ts — Runs the tutor-turn grind's eval cases (grinds/tutor-turn.eval/<case>/) through
// `claude --print`, with the grind's instructions as the system prompt, its answer schema as the structured
// output, and its model and effort, then checks each answer against the case's expected.json. A case is one
// directory: input.json + expected.json, or several input.<variant>.json + expected.<variant>.json pairs (a run
// each), and work.png / problem.png attached when the request names them. It spends fuel, so it is not in the
// gate: `npm run tutor:eval [case ...]`. Exits non-zero when any case fails; answers are kept in a temp dir.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TutorRequest } from '../src/contracts/types';
import { isTutorAnswer } from '../src/grist/tutor-answer';

const ROOT = join(import.meta.dirname, '..');
export const EVAL_DIR = join(ROOT, 'grinds/tutor-turn.eval');

/** A case's expected.json: what the answer must be, and what must never appear in it. */
export interface Expected {
  about: string;
  action: string;
  layer_diagnosis: string;
  /** The problem's answer, as a numeral and in words: never in prompt_to_child, focus_words or math_diagnosis. */
  answer_must_not_appear: string[];
  /** A word that must be in focus_words, with at least this many chunks. */
  focus_word?: { word: string; min_chunks: number };
  /** Words prompt_to_child must not say (the word the child is to decode). */
  prompt_must_not_say?: string[];
  /** math_diagnosis must be present, and its where_wrong or gap must mention one of these. */
  gap_mentions_any?: string[];
  notes_required?: boolean;
  teaching_method_required?: boolean;
  prompt_max_chars?: number;
}

export interface EvalRun {
  /** "case" or "case/variant". */
  name: string;
  input: TutorRequest;
  expected: Expected;
  photos: string[];
}

export interface EvalCase {
  name: string;
  runs: EvalRun[];
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

/** Every case under `dir`, each with its runs, in name order. */
export function loadCases(dir = EVAL_DIR): EvalCase[] {
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
        const input = readJson<TutorRequest>(join(caseDir, file));
        const photos: string[] = [];
        if (input.mode === 'problem-in') photos.push(join(caseDir, 'problem.png'));
        if (input.work_photo) photos.push(join(caseDir, 'work.png'));
        for (const photo of photos) if (!existsSync(photo)) throw new Error(`${name}: ${file} needs ${photo}`);
        return { name: variant ? `${name}/${variant.slice(1)}` : name, input, expected: readJson<Expected>(expectedPath), photos };
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
  if (answer.action !== expected.action) problems.push(`action ${answer.action}, expected ${expected.action}`);
  if (answer.layer_diagnosis !== expected.layer_diagnosis) {
    problems.push(`layer_diagnosis ${answer.layer_diagnosis}, expected ${expected.layer_diagnosis}`);
  }

  const childSees: [string, string][] = [
    ['prompt_to_child', answer.prompt_to_child],
    ...answer.focus_words.map((f, i): [string, string] => [`focus_words[${i}]`, [f.word, ...f.chunks].join(' | ')]),
    ...Object.entries(answer.math_diagnosis ?? {}).map(([k, v]): [string, string] => [`math_diagnosis.${k}`, v]),
  ];
  for (const [field, text] of childSees) {
    for (const hit of answerAppears(text, expected.answer_must_not_appear)) problems.push(`the answer "${hit}" appears in ${field}`);
  }

  if (expected.focus_word) {
    const { word, min_chunks } = expected.focus_word;
    const focus = answer.focus_words.find((f) => f.word.toLowerCase() === word.toLowerCase());
    if (!focus) problems.push(`"${word}" is not in focus_words`);
    else if (focus.chunks.length < min_chunks) problems.push(`"${word}" has ${focus.chunks.length} chunks, expected ${min_chunks} or more`);
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
  if (expected.notes_required && !answer.notes_for_parent?.trim()) problems.push('no notes_for_parent');
  if (expected.teaching_method_required && !answer.teaching_method?.trim()) problems.push('no teaching_method');
  if (expected.prompt_max_chars !== undefined && answer.prompt_to_child.length > expected.prompt_max_chars) {
    problems.push(`prompt_to_child is ${answer.prompt_to_child.length} chars, expected ${expected.prompt_max_chars} or fewer`);
  }
  return problems;
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
    { type: 'text', text: `Tutor Turn Request:\n${JSON.stringify(run.input, null, 2)}` },
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

async function main(): Promise<void> {
  const grind = readJson<Grind>(join(ROOT, 'grinds/tutor-turn.json'));
  const model = process.env.TUTOR_EVAL_MODEL ?? grind.model;
  const only = process.argv.slice(2);
  const cases = loadCases().filter((c) => only.length === 0 || only.includes(c.name));
  const outDir = mkdtempSync(join(tmpdir(), 'tutor-eval-'));
  console.log(`tutor:eval: ${cases.length} cases with ${model} (effort ${grind.effort}); answers in ${outDir}`);

  const results = await Promise.all(
    cases.flatMap((c) => c.runs).map(async (run) => {
      let problems: string[];
      try {
        const answer = readClaudeResult(await runClaude(run, grind, model));
        const file = join(outDir, `${run.name.replace('/', '.')}.json`);
        writeFileSync(file, JSON.stringify(answer, null, 2) + '\n');
        problems = checkAnswer(answer, run.expected);
        console.log(`\n${problems.length === 0 ? 'PASS' : 'FAIL'} ${run.name}: ${run.expected.about}`);
        if (isTutorAnswer(answer)) console.log(`  ${answer.action} / ${answer.layer_diagnosis}: "${answer.prompt_to_child}"`);
      } catch (error) {
        problems = [error instanceof Error ? error.message : String(error)];
        console.log(`\nFAIL ${run.name}: ${run.expected.about}`);
      }
      for (const problem of problems) console.log(`  - ${problem}`);
      return { run: run.name, ok: problems.length === 0 };
    }),
  );

  const passedCases = cases.filter((c) => c.runs.every((r) => results.find((x) => x.run === r.name)?.ok));
  const passedRuns = results.filter((r) => r.ok).length;
  console.log(`\ntutor:eval: ${passedCases.length}/${cases.length} cases passed (${passedRuns}/${results.length} runs) with ${model}`);
  if (passedCases.length !== cases.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}

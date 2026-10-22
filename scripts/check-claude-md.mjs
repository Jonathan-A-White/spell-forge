#!/usr/bin/env node
// CLAUDE.md is read by every SpellForge Builder at boot and again from cache every turn, so it stays a one-screen index (ported from Lampas, mw-79en7t.1).
// Every guide is a docs/ file named in CLAUDE.md's 'Read by need'.
//
//   node scripts/check-claude-md.mjs                 CLAUDE.md is at most LIMIT bytes, ends with Read by need, and names every docs/ file
//   node scripts/check-claude-md.mjs --from <rev>    also: every non-blank line of <rev>'s CLAUDE.md is still in CLAUDE.md or a docs/ file
//   --root <dir>                                     check another tree (the test uses one)
//
// tests/unit/claude-md.test.ts runs it in the gate. Exit 0 when all is well, 1 with the reasons.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const LIMIT = 16_000;
const INDEX = '## Read by need';

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
const root = option('--root') ?? process.cwd();
const from = option('--from');

/** Every .md file under docs/, as 'docs/...' paths, sorted. */
function docsFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.md')) out.push(relative(root, path).split('\\').join('/'));
    }
  };
  if (existsSync(join(root, 'docs'))) walk(join(root, 'docs'));
  return out.sort();
}

const claude = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
const problems = [];

const bytes = Buffer.byteLength(claude, 'utf8');
if (bytes > LIMIT) {
  problems.push(
    `CLAUDE.md is ${bytes} bytes, over the ${LIMIT} it must stay under (every Builder reads it at boot). ` +
      `A long note goes in the docs/ file for its area (CLAUDE.md's Read by need names each), or in a docs/ file of its own ` +
      `with one line in Read by need: move what you added there.`,
  );
}

const headings = claude.split('\n').filter((line) => line.startsWith('## '));
if (headings.at(-1) !== INDEX) {
  problems.push(`CLAUDE.md must end with its '${INDEX}' section (its last section is '${headings.at(-1) ?? 'none'}').`);
} else {
  const index = claude.slice(claude.lastIndexOf(INDEX));
  const named = new Set([...index.matchAll(/^(docs\/\S+\.md)\s+#/gm)].map((match) => match[1]));
  for (const file of docsFiles()) {
    if (!named.has(file)) problems.push(`${file} is not in CLAUDE.md's Read by need: add one line naming what it covers.`);
  }
  for (const file of named) {
    if (!existsSync(join(root, file))) problems.push(`CLAUDE.md's Read by need names ${file}, which does not exist.`);
  }
}

if (from) {
  // Every line kept word for word: a line of the old CLAUDE.md is found if CLAUDE.md or any docs/ file has it (trailing space ignored).
  const old = execFileSync('git', ['show', `${from}:CLAUDE.md`], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
  const lines = (text) => text.split('\n').map((line) => line.trimEnd()).filter((line) => line.trim() !== '');
  const count = (list) => list.reduce((map, line) => map.set(line, (map.get(line) ?? 0) + 1), new Map());
  const before = count(lines(old));
  const inClaude = count(lines(claude));
  const inDocs = count(docsFiles().flatMap((file) => lines(readFileSync(join(root, file), 'utf8'))));
  let kept = 0;
  let moved = 0;
  let dropped = 0;
  const missing = [];
  for (const [line, times] of before) {
    const now = (inClaude.get(line) ?? 0) + (inDocs.get(line) ?? 0);
    if (now === 0) missing.push(line);
    else if (inClaude.has(line)) kept += times;
    else moved += times;
    if (now > 0 && now < times) dropped += times - now;
  }
  const total = [...before.values()].reduce((sum, n) => sum + n, 0);
  console.log(
    `${from}:CLAUDE.md has ${total} non-blank lines (${before.size} distinct): ` +
      `${kept} in CLAUDE.md, ${moved} only in docs/, ${missing.length} missing; ` +
      `${dropped} repeat${dropped === 1 ? '' : 's'} dropped (a line now found fewer times than it was written).`,
  );
  for (const line of missing) problems.push(`Lost from ${from}:CLAUDE.md: ${line.slice(0, 160)}`);
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`CLAUDE.md: ${bytes} of ${LIMIT} bytes, Read by need names every docs/ file.`);

// scripts/bsv-rules-coverage.ts — Lists §9 acceptance criteria, from the sections in
// scope for the Gherkin conversion (mw-eanto.1), that no feature file under
// tests/features/ tags with a matching `@AC-<id>`. The spec doesn't mark §9 scope
// itself, so scope here is fixed to the sections named in the story: the License
// covenant (§3.7, whose rules are covered by the §4.3/§4.4 ACs below, and which has
// no AC ids of its own) and its lifecycle sections §4.1 (mint), §4.3 (write), §4.4
// (transfer) — i.e. every AC id matching `AC-4.(1|3|4).*`. `npm run bsv:rules:coverage`.
// Always exits 0: this reports a coverage gap, it doesn't gate the build on one.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SPEC_PATH = join(import.meta.dirname, '../docs/bsv-nft-gated-app-spec.md');
const FEATURES_DIR = join(import.meta.dirname, '../tests/features');
const IN_SCOPE_SUBSECTIONS = ['1', '3', '4'];

function inScopeAcIds(): string[] {
  const spec = readFileSync(SPEC_PATH, 'utf-8');
  const acSectionStart = spec.indexOf('## 9. Acceptance criteria');
  if (acSectionStart < 0) throw new Error('Could not find "## 9. Acceptance criteria" in the spec.');
  const acSection = spec.slice(acSectionStart);
  const ids: string[] = [];
  for (const match of acSection.matchAll(/^- \*\*(AC-4\.(\d+)\.\d+-\d+)\b/gm)) {
    const [, id, subsection] = match;
    if (IN_SCOPE_SUBSECTIONS.includes(subsection)) ids.push(id);
  }
  return ids;
}

function findFeatureFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return findFeatureFiles(path);
    return entry.name.endsWith('.feature') ? [path] : [];
  });
}

function taggedAcIds(): Set<string> {
  const tagged = new Set<string>();
  for (const file of findFeatureFiles(FEATURES_DIR)) {
    const text = readFileSync(file, 'utf-8');
    for (const match of text.matchAll(/@(AC-4\.\d+\.\d+-\d+)/g)) tagged.add(match[1]);
  }
  return tagged;
}

function run(): void {
  const inScope = inScopeAcIds();
  const tagged = taggedAcIds();
  const uncovered = inScope.filter((id) => !tagged.has(id));

  console.log(`In-scope §9 acceptance criteria (§3.7, §4.1, §4.3, §4.4): ${inScope.length}`);
  if (uncovered.length === 0) {
    console.log('All of them are tagged on a scenario under tests/features/.');
    return;
  }
  console.log(`${uncovered.length} have no scenario tagged with a matching @AC-<id>:`);
  for (const id of uncovered) console.log(`  ${id}`);
}

run();

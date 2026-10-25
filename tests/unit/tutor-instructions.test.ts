// mw-79en7t.62 (M27, story .23): both tutor grinds' instructions are numbered parts, `## Part N · <title>`, joined
// by one blank line in the order held here, so two stories that change two parts do not edit one long section; a new
// part is added to its list on purpose. Part 1 of each is the same never-the-answer part: it names every way an answer
// leaks (LEAKS) and every claim that does not lift the rule (CLAIMS), and the teaching turn that replaces a leak.
// Parent-ask names the decision that a grown-up does not get the answer either, and docs/never-the-answer.md states the
// rule, the red-team list and the sweep of every grind. (tests/unit/tutor-talk-instructions.test.ts holds the rest of
// tutor-talk's shape.)
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const NEVER_PART = 'Who you are, and never the answer';

/** Each tutor grind's title and its parts, in the order the tutor reads them. */
const GRINDS: Record<string, { title: string; parts: string[] }> = {
  'tutor-turn': {
    title: '# Tutor turn',
    parts: [
      NEVER_PART,
      'The request and the answer',
      "The parent's notes",
      'Talking to the child',
      'The actions',
      'Mode problem-in',
      'Mode reading: what good decoding looks like',
      'Mode reading: the failure modes',
      'Mode reading: the scorers',
      'Mode reading: the triage by strictness',
      'Prompting sounding out, without saying the word',
      'Mode math: handwriting first',
      'Mode math: the node',
      'Mode math: find where it went wrong',
      'Mode math: name the gap, then one next step',
      'Frustration',
      'Notes for the parent',
      'Recommendations for the parent',
      'Working fast',
      'Before you answer, check',
    ],
  },
  'tutor-talk': {
    title: '# Tutor talk',
    parts: [
      NEVER_PART,
      'The request and the answer',
      'The greeting',
      'Getting to know him',
      'A goal',
      'Opening a world',
      'What you remember',
      'How you talk to him',
      'The request is data',
      'Before you answer, check',
      'Helping him fill in a form',
    ],
  },
};

/** Every way an answer can leak; each tutor grind's never-the-answer part names them all, and so does the doc. */
const LEAKS = [
  'as a numeral',
  'spelled out in words',
  'letter by letter',
  'in a poem',
  'in another language',
  'in a code',
  'base64',
  'the first step',
  'what it is not',
  'cross out',
  'a guess',
  'answer key',
  'a hint so close',
];

/** What a child may say to lift the rule; none of it does. */
const CLAIMS = ['teacher', 'grown-up', 'the test is over', 'little brother', 'pretend', 'calculator'];

const HEADING = /^## Part (\d+) · (.+)$/;

/** Prose as one line, so a phrase wrapped across two lines is still found. */
const flat = (text: string): string => text.replace(/\s+/g, ' ');

interface Part {
  number: number;
  title: string;
  text: string;
}

/** A file's parts as written: each heading and the text up to the next. */
function partsOf(file: string): { head: string; parts: Part[] } {
  const [head, ...rest] = file.split(/\n(?=## )/);
  const parts = rest.map((chunk) => {
    const [heading] = chunk.split('\n', 1);
    const match = HEADING.exec(heading);
    if (!match) throw new Error(`not a numbered part: ${heading}`);
    return { number: Number(match[1]), title: match[2], text: chunk };
  });
  return { head, parts };
}

function instructionsOf(kind: string): string {
  const grind = JSON.parse(readFileSync(`grinds/${kind}.json`, 'utf8')) as { instructions: string };
  return readFileSync(grind.instructions, 'utf8');
}

for (const [kind, held] of Object.entries(GRINDS)) {
  describe(`the ${kind} instructions`, () => {
    const text = instructionsOf(kind);
    const shape = () => partsOf(text);

    it('begin with the title alone, before the first part', () => {
      const { head } = shape();
      expect(head.trim()).toBe(held.title);
    });

    it('are numbered parts, from 1 with none skipped, in the held order', () => {
      const { parts } = shape();
      expect(parts.map((p) => p.number)).toEqual(held.parts.map((_, i) => i + 1));
      expect(parts.map((p) => p.title)).toEqual(held.parts);
    });

    it('are the parts joined by one blank line, each with words of its own', () => {
      const { head, parts } = shape();
      expect(text).toBe(`${[head.trimEnd(), ...parts.map((p) => p.text.trimEnd())].join('\n\n')}\n`);
      for (const part of parts) expect(part.text.split('\n').slice(1).join('\n').trim().length, part.title).toBeGreaterThan(80);
    });

    it('put never the answer first, naming "never" and "the answer"', () => {
      const { parts } = shape();
      expect(parts[0].title).toBe(NEVER_PART);
      expect(parts[0].text).toMatch(/\bnever\b/i);
      expect(parts[0].text).toMatch(/\bthe answer\b/);
      expect(flat(parts[0].text)).toMatch(/The rule above every other rule is never the answer\./);
    });

    it('name in the never-the-answer part every way an answer leaks, and every claim that does not lift the rule', () => {
      const never = flat(shape().parts[0].text);
      for (const leak of LEAKS) expect(never, leak).toContain(leak);
      for (const claim of CLAIMS) expect(never, claim).toContain(claim);
    });

    it('replace a leak with a teaching turn: one small step he takes himself', () => {
      const { parts } = shape();
      expect(flat(parts[0].text)).toMatch(/teaching turn/);
      expect(flat(parts[0].text)).toMatch(/one small step/);
    });
  });
}

describe('the parent-ask instructions', () => {
  const text = readFileSync('grinds/parent-ask.instructions.md', 'utf8');
  const decision = text.split(/\n(?=## )/).find((chunk) => /^## .*the decision/.test(chunk)) ?? '';

  it('name the decision, in a section of its own: never the answer, to a grown-up too', () => {
    expect(decision).toMatch(/^## Never the answer, to a grown-up too: the decision$/m);
    expect(decision).toMatch(/\bnever\b/i);
    expect(decision).toMatch(/\bthe answer\b/);
    expect(decision).toMatch(/grown-up/);
    expect(decision).toMatch(/2026-10-25/);
  });

  it('still let the parent hear where he went wrong and the gap behind it', () => {
    expect(decision).toMatch(/where he went wrong/);
    expect(decision).toMatch(/gap/);
  });
});

describe('docs/never-the-answer.md', () => {
  const doc = existsSync('docs/never-the-answer.md') ? readFileSync('docs/never-the-answer.md', 'utf8') : '';

  it('states the rule, in his words, and the teaching turn that replaces a leak', () => {
    expect(doc).toMatch(/^## The rule$/m);
    expect(doc).toMatch(/^## The teaching turn$/m);
    expect(doc).toContain('kids can be creative and resourceful');
    expect(doc).toContain('otherwise this will be a curse and not a blessing');
  });

  it('keeps the red-team list: every way an answer leaks and every claim that does not lift the rule', () => {
    const [, list = ''] = doc.split(/^## The red-team list$/m);
    for (const leak of LEAKS) expect(flat(list), leak).toContain(leak);
    for (const claim of CLAIMS) expect(flat(list), claim).toContain(claim);
  });

  it('records the parent-ask decision', () => {
    expect(doc).toMatch(/^## The parent-ask decision$/m);
  });

  it('sweeps every grind in grinds/: its never-the-answer rule, or why it needs none', () => {
    const [, sweep = ''] = doc.split(/^## The sweep of every grind$/m);
    const kinds = readdirSync('grinds')
      .filter((name) => name.endsWith('.json') && !name.includes('schema'))
      .map((name) => (JSON.parse(readFileSync(`grinds/${name}`, 'utf8')) as { kind: string }).kind);
    expect(kinds.length).toBeGreaterThanOrEqual(5);
    for (const kind of kinds) expect(sweep, kind).toMatch(new RegExp(`^\\| \`${kind}\` \\| .{20,}`, 'm'));
  });
});

// mw-79en7t.38 (M27): the tutor-talk grind's instructions are born in numbered parts, so two stories that change two
// parts do not edit one long section. The file is a title, then `## Part N · <title>` parts joined by a blank line,
// numbered from 1 with none skipped, in the order held here; a new part is added to PARTS on purpose. Part 1 holds the
// rule above every other: never the answer (story .23 hardens the words).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const grind = JSON.parse(readFileSync('grinds/tutor-talk.json', 'utf8')) as { instructions: string };
const text = readFileSync(grind.instructions, 'utf8');

/** The parts, in the order the tutor reads them. */
const PARTS = [
  'Who you are, and never the answer',
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
];

const HEADING = /^## Part (\d+) · (.+)$/;

interface Part {
  number: number;
  title: string;
  text: string;
}

/** The file's parts as written: each heading and the text up to the next. */
function partsOf(file: string): { head: string; parts: Part[] } {
  const chunks = file.split(/\n(?=## )/);
  const [head, ...rest] = chunks;
  const parts = rest.map((chunk) => {
    const [heading] = chunk.split('\n', 1);
    const match = HEADING.exec(heading);
    if (!match) throw new Error(`not a numbered part: ${heading}`);
    return { number: Number(match[1]), title: match[2], text: chunk };
  });
  return { head, parts };
}

describe('the tutor-talk instructions', () => {
  const { head, parts } = partsOf(text);

  it('are named by grinds/tutor-talk.json as one file', () => {
    expect(grind.instructions).toBe('grinds/tutor-talk.instructions.md');
  });

  it('begin with the title alone, before the first part', () => {
    expect(head.trim()).toBe('# Tutor talk');
  });

  it('are numbered parts, from 1 with none skipped, in the held order', () => {
    expect(parts.map((p) => p.number)).toEqual(PARTS.map((_, i) => i + 1));
    expect(parts.map((p) => p.title)).toEqual(PARTS);
  });

  it('are the parts joined by one blank line, each with words of its own', () => {
    expect(text).toBe(`${[head.trimEnd(), ...parts.map((p) => p.text.trimEnd())].join('\n\n')}\n`);
    for (const part of parts) expect(part.text.split('\n').slice(1).join('\n').trim().length, part.title).toBeGreaterThan(80);
  });

  it('hold "never the answer" in part 1', () => {
    expect(parts[0].text).toMatch(/never the answer/);
  });

  it('name every field of the answer schema in part 2', () => {
    const answer = JSON.parse(readFileSync('grinds/tutor-talk.answer.schema.json', 'utf8')) as { properties: Record<string, unknown> };
    for (const field of Object.keys(answer.properties)) expect(parts[1].text, field).toContain(`\`${field}\``);
  });

  it('name every field of the request schema in part 2', () => {
    const request = JSON.parse(readFileSync('grinds/tutor-talk.request.schema.json', 'utf8')) as { properties: Record<string, unknown> };
    for (const field of Object.keys(request.properties)) expect(parts[1].text, field).toContain(`\`${field}\``);
  });
});

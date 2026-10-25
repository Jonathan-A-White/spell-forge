// mw-79en7t.38: the front door's request to the tutor-talk grind. It is built under a byte budget (M38): a talk that
// grows loses its oldest turns first and keeps its memory, so it never outgrows what the mill takes. What it carries
// is the table in docs/what-the-tutor-is-told.md (M39), read here: a field sent that the table does not name, or a
// row the request does not carry, fails; every setting and profile field is named in one of the doc's two tables.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AccessibilitySettings, Profile } from '../../src/contracts';
import {
  TUTOR_TALK_MAX_BYTES,
  buildTutorTalkRequest,
  requestBytes,
  type TalkTurn,
  type TutorTalkInput,
} from '../../src/features/front-door/tutor-talk-request';
import { validate, type Schema } from '../fixtures/grist/grind-examples';

const doc = readFileSync('docs/what-the-tutor-is-told.md', 'utf8');
const requestSchema = JSON.parse(readFileSync('grinds/tutor-talk.request.schema.json', 'utf8')) as Schema;

/** The first cell of each row of the table under `heading`, its backticked name. */
function tableNames(heading: string): string[] {
  const from = doc.indexOf(`\n## ${heading}\n`);
  if (from < 0) throw new Error(`docs/what-the-tutor-is-told.md has no "## ${heading}"`);
  const lines = doc.slice(from + heading.length + 5).split('\n');
  const start = lines.findIndex((line) => line.startsWith('|'));
  const rows = lines.slice(start, lines.findIndex((line, i) => i > start && !line.startsWith('|')));
  return rows.slice(2).map((row) => {
    const name = /^\|\s*`([^`]+)`/.exec(row);
    if (!name) throw new Error(`a row with no backticked name: ${row}`);
    return name[1];
  });
}

/** Every leaf of the request as a dotted path: an object is gone into, a list or a value is a leaf. */
function leafPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, inner]) => leafPaths(inner, prefix ? `${prefix}.${key}` : key));
}

// Every setting and every profile field, set: the compiler holds these complete, so a new one must be placed below.
const settings = {
  fontSize: 24,
  fontWeight: 'bold',
  fontFamily: 'system-ui',
  letterSpacing: 0.05,
  lineHeight: 1.6,
  contrastMode: 'light',
  backgroundColor: '#FFF8E7',
  reducedMotion: true,
  sessionMaxMinutes: 10,
  sessionAdaptive: true,
  dailyGoalMinutes: 5,
  tapTargetSize: 56,
  learningStrategy: 'wave',
  tutorStrictness: 'precision',
  tutorVoice: 'voice:samantha',
  tutorNotes: ['go slower on carrying'],
} satisfies Required<AccessibilitySettings>;

const profile = {
  id: 'p1',
  name: 'Zebulon',
  avatar: 'dragon',
  themeId: 'dragon-forge',
  pin: 'hash-of-pin',
  createdAt: new Date(0),
  settings,
  importFilterWords: ['Name:'],
  status: 'active',
  gradeGoal: 90,
} satisfies Required<Profile>;

const turn = (role: TalkTurn['role'], text: string): TalkTurn => ({ role, text });

/** An input with every part present. */
const full = (over: Partial<TutorTalkInput> = {}): TutorTalkInput => ({
  message: 'I want to do maths',
  turns: [turn('assistant', 'Hello! What shall we do today?'), turn('user', 'Something hard')],
  memory: { facts: ['likes dragons'], summary: 'Talked about what to do first.' },
  pictures: 1,
  profile,
  learner: { age: 13, gender: 'boy', experience: 'knows his times tables', learnerKind: 'learns by doing', speed: 'quick' },
  goal: { id: 'sat-maths-800', title: 'An 800 on the maths SAT', progress: 0.25 },
  goals: [
    { id: 'sat-maths-800', title: 'An 800 on the maths SAT' },
    { id: 'competition', title: 'A maths competition' },
  ],
  progress: {
    spelling: { band: '3-5', next: ['Silent e', 'Vowel teams'] },
    maths: { band: '6-8', next: ['Ratios'] },
  },
  screen: { name: 'Practice', facts: ['list: Week 3'] },
  ...over,
});

const longTurns = (n: number): TalkTurn[] =>
  Array.from({ length: n }, (_, i) => turn(i % 2 === 0 ? 'user' : 'assistant', `turn ${i} ${'and so on '.repeat(40)}`));

describe('the tutor-talk request', () => {
  it('fits the grind\'s request schema, with every part present and with only the message', () => {
    expect(validate(buildTutorTalkRequest(full()), requestSchema)).toEqual([]);
    const quiet = { ...profile, settings: { ...settings, tutorNotes: [] } };
    const bare = buildTutorTalkRequest({ message: '', turns: [], memory: { facts: [], summary: '' }, profile: quiet, learner: {}, goals: [] });
    expect(validate(bare, requestSchema)).toEqual([]);
    expect(Object.keys(bare).sort()).toEqual(['history', 'message', 'schemaVersion', 'strictness']);
  });

  it('carries exactly the fields the table in docs/what-the-tutor-is-told.md names', () => {
    expect(leafPaths(buildTutorTalkRequest(full())).sort()).toEqual(tableNames('What a turn carries').sort());
  });

  it('names every setting and every profile field in one of the doc\'s tables, and sends none of those it does not carry', () => {
    const carried = doc.slice(doc.indexOf('\n## What a turn carries\n'), doc.indexOf('\n## What is not sent\n'));
    const notSent = new Set(tableNames('What is not sent'));
    for (const key of Object.keys(settings)) {
      const from = carried.includes(`\`settings.${key}\``);
      expect(from !== notSent.has(`settings.${key}`), `settings.${key}: in exactly one table`).toBe(true);
    }
    for (const key of Object.keys(profile).filter((k) => k !== 'settings')) expect(notSent.has(`profile.${key}`), key).toBe(true);
    const json = JSON.stringify(buildTutorTalkRequest(full()));
    for (const secret of ['Zebulon', 'hash-of-pin', 'voice:samantha', 'dragon-forge', '#FFF8E7', 'Name:']) expect(json, secret).not.toContain(secret);
  });

  it('carries the settings that bear on an answer', () => {
    const request = buildTutorTalkRequest(full());
    expect(request.strictness).toBe('precision');
    expect(request.parent_notes).toEqual(['go slower on carrying']);
    const plain = buildTutorTalkRequest(full({ profile: { ...profile, settings: { ...settings, tutorStrictness: undefined, tutorNotes: [] } } }));
    expect(plain.strictness).toBe('meaning-gated');
    expect('parent_notes' in plain).toBe(false);
  });

  it('carries the turns oldest first, as role and words', () => {
    expect(buildTutorTalkRequest(full()).history).toEqual([
      { role: 'assistant', text: 'Hello! What shall we do today?' },
      { role: 'user', text: 'Something hard' },
    ]);
  });

  it('comes back as built when it is under the budget', () => {
    const request = buildTutorTalkRequest(full());
    expect(requestBytes(request)).toBeLessThan(TUTOR_TALK_MAX_BYTES);
    expect(request.history).toHaveLength(2);
  });

  it('over the budget, loses its oldest turns first and keeps the memory, to under the budget', () => {
    const turns = longTurns(40);
    const memory = { facts: ['likes dragons', 'his sister is Ana'], summary: 'Chose maths; working on ratios.' };
    const input = full({ turns, memory });
    expect(requestBytes({ ...buildTutorTalkRequest(full({ memory })), history: turns })).toBeGreaterThan(TUTOR_TALK_MAX_BYTES);

    const request = buildTutorTalkRequest(input);
    expect(requestBytes(request)).toBeLessThanOrEqual(TUTOR_TALK_MAX_BYTES);
    expect(request.history.length).toBeGreaterThan(0);
    expect(request.history.length).toBeLessThan(turns.length);
    expect(request.history).toEqual(turns.slice(turns.length - request.history.length));
    expect(request.memory).toEqual(memory);
    expect(request.message).toBe('I want to do maths');
    expect(request.learner).toEqual(full().learner);
    expect(validate(request, requestSchema)).toEqual([]);
  });

  it('counts the budget in UTF-8 bytes, not characters', () => {
    expect(requestBytes({ message: 'é' })).toBe(JSON.stringify({ message: 'x' }).length + 1);
    const wide = longTurns(30).map((t) => ({ ...t, text: `${t.text}${'ü'.repeat(200)}` }));
    expect(requestBytes(buildTutorTalkRequest(full({ turns: wide })))).toBeLessThanOrEqual(TUTOR_TALK_MAX_BYTES);
  });

  it('keeps the message whole, cut only at the schema\'s longest', () => {
    const request = buildTutorTalkRequest(full({ message: `  ${'a'.repeat(2500)}  ` }));
    expect(request.message).toBe('a'.repeat(2000));
  });
});

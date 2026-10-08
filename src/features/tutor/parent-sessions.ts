// src/features/tutor/parent-sessions.ts — The Grown-ups screen's 'This week' sentences and the Sessions as plain
// lines (mw-kuy7rx.3), worked out from the tutor's sessions and turns. Nothing here reads Dexie or the grist.

import type { ReadingResult, TutorSession, TutorTurn } from '../../contracts/types';

export interface SessionWithTurns {
  session: TutorSession;
  turns: TutorTurn[];
}

/** One line of the Sessions list: when, what he did, how it went. */
export interface SessionLineData {
  sessionId: string;
  date: string;
  what: string;
  how: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FIRST_WORDS = 7;
const MOST_MISREAD = 3;

/** 'Tue 7 Oct'. */
export function plainDate(date: Date): string {
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The problem's first few words, cut with an ellipsis when there are more. */
function firstWords(text: string | undefined): string {
  const words = (text ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'No problem yet';
  return words.length > FIRST_WORDS ? `${words.slice(0, FIRST_WORDS).join(' ')}…` : words.join(' ');
}

/** The turn that settled the problem: a reading made whole, or a maths answer confirmed. A stale answer never counts. */
function solvingTurn(turns: TutorTurn[]): TutorTurn | undefined {
  return [...turns]
    .sort((a, b) => b.index - a.index)
    .find((turn) => {
      if (turn.status !== 'answered') return false;
      const action = turn.answer?.action;
      if (turn.mode === 'reading') return action === 'done';
      if (turn.mode === 'math') return action === 'confirm_answer' || action === 'done';
      return false;
    });
}

function howItWent(session: TutorSession, turns: TutorTurn[]): string {
  const solved = solvingTurn(turns);
  if (solved?.mode === 'reading') {
    const tries = turns.filter((t) => t.mode === 'reading' && t.index <= solved.index && (t.status === 'answered' || t.status === 'stale')).length;
    return `read it right on the ${ordinal(tries)} try`;
  }
  if (solved) return 'answer found';
  return session.status === 'active' ? 'still going' : 'stopped early';
}

export function sessionLine(session: TutorSession, turns: TutorTurn[]): SessionLineData {
  return { sessionId: session.id, date: plainDate(session.startedAt), what: firstWords(session.targetText), how: howItWent(session, turns) };
}

/** Newest first. */
export function sessionLines(rows: SessionWithTurns[]): SessionLineData[] {
  return [...rows].sort((a, b) => b.session.startedAt.getTime() - a.session.startedAt.getTime()).map((r) => sessionLine(r.session, r.turns));
}

/** Whole minutes from the start to the last thing that happened in the session; at least one. */
function minutesOf({ session, turns }: SessionWithTurns): number {
  const times = [session.endedAt, ...turns.flatMap((t) => [t.sentAt, t.answeredAt])].filter((d): d is Date => d !== undefined);
  const end = Math.max(session.startedAt.getTime(), ...times.map((d) => d.getTime()));
  return Math.max(1, Math.round((end - session.startedAt.getTime()) / 60000));
}

/** The words the scorers marked wrong, most often first (ties by the word); one engine per turn, so none counts twice. */
function mostMisread(rows: SessionWithTurns[]): string[] {
  const seen = new Map<string, number>();
  for (const { turns } of rows) {
    for (const turn of turns) {
      const result: ReadingResult | undefined = turn.readingResult?.azure ?? turn.readingResult?.local;
      for (const word of result?.words ?? []) {
        if (word.error === 'none') continue;
        const key = word.text.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
        if (key) seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
  }
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MOST_MISREAD)
    .map(([word]) => word);
}

/** 'This week' is the seven days up to now. */
export function weekSummary(rows: SessionWithTurns[], now: Date = new Date()): string {
  const since = now.getTime() - 7 * DAY_MS;
  const week = rows.filter((r) => r.session.startedAt.getTime() > since && r.session.startedAt.getTime() <= now.getTime());
  if (week.length === 0) return 'No sessions this week yet.';
  const minutes = week.reduce((sum, r) => sum + minutesOf(r), 0);
  const problems = week.filter((r) => r.session.targetText).length;
  const first = `This week he had ${count(week.length, 'session')}, ${count(minutes, 'minute')}, and tried ${count(problems, 'problem')}.`;
  const words = mostMisread(week);
  return words.length > 0 ? `${first} The words he misread most: ${words.join(', ')}.` : first;
}

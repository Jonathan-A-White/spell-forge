// src/features/tutor/parent-ask-request.ts — The request a parent's question becomes (grinds/parent-ask.json): the
// question, and the child's last 20 sessions as compact text, newest first. A session is a few lines: the day, the
// problem, the words he misread, how the maths went, and the tutor's notes for the parent. No ids, no names.

import type { ParentAskRequest, ReadingResult, TutorTurn } from '../../contracts/types';
import { tutorRepo } from '../../data/repositories';
import { parentDiagnosesOf, parentNotesOf } from './session-json';
import type { SessionWithTurns } from './parent-sessions';

/** How many of the latest sessions travel with a question. */
export const PARENT_ASK_SESSIONS = 20;
/** The longest question sent; a longer one is cut. */
export const PARENT_ASK_MAX_QUESTION = 1000;
/** The longest summary of one session; a longer one is cut. */
const MAX_SUMMARY = 1500;

const cleanWord = (text: string) => text.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/** The words he got wrong in the session, each once: the scorers' misreads and the tutor's focus words. */
function misreadWords(turns: TutorTurn[]): string[] {
  const found: string[] = [];
  const add = (text: string) => {
    const word = cleanWord(text);
    if (word && !found.includes(word)) found.push(word);
  };
  for (const turn of turns) {
    const result: ReadingResult | undefined = turn.readingResult?.azure ?? turn.readingResult?.local;
    for (const word of result?.words ?? []) if (word.error !== 'none') add(word.text);
    for (const focus of turn.answer?.focus_words ?? []) add(focus.word);
  }
  return found;
}

function dayOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** One session as a few lines of text; parts with nothing to say are left out. */
function summaryOf({ session, turns }: SessionWithTurns): string {
  const ordered = [...turns].sort((a, b) => a.index - b.index);
  const lines = [`${dayOf(session.startedAt)}.`];
  const kind = session.problemKind === 'plain' ? 'math' : session.problemKind === 'word' ? 'reading' : undefined;
  if (session.targetText) lines.push(`Problem${kind ? ` (${kind})` : ''}: ${session.targetText}`);
  lines.push(`Turns: ${ordered.length}.`);
  const missed = misreadWords(ordered);
  if (missed.length > 0) lines.push(`Misread words: ${missed.join(', ')}.`);
  const diagnoses = parentDiagnosesOf(ordered);
  if (diagnoses.length > 0) lines.push(`Math: ${diagnoses.map((d) => `${d.where_wrong} (gap: ${d.gap})`).join('; ')}.`);
  const notes = parentNotesOf(ordered);
  if (notes.length > 0) lines.push(`The tutor's notes for the parent: ${notes.join(' ')}`);
  const text = lines.join('\n');
  return text.length > MAX_SUMMARY ? `${text.slice(0, MAX_SUMMARY - 1)}…` : text;
}

/** The question, trimmed, and the latest sessions (those with at least one turn) as text, newest first. */
export function buildParentAskRequest(question: string, rows: SessionWithTurns[]): ParentAskRequest {
  const sessions = rows
    .filter((row) => row.turns.length > 0)
    .sort((a, b) => b.session.startedAt.getTime() - a.session.startedAt.getTime())
    .slice(0, PARENT_ASK_SESSIONS)
    .map(summaryOf);
  return { question: question.trim().slice(0, PARENT_ASK_MAX_QUESTION), sessions };
}

/** The same, from the profile's sessions as Dexie holds them. */
export async function buildParentAskRequestFor(profileId: string, question: string): Promise<ParentAskRequest> {
  const sessions = (await tutorRepo.listSessions(profileId)).slice(0, PARENT_ASK_SESSIONS * 2);
  const rows = await Promise.all(sessions.map(async (session) => ({ session, turns: await tutorRepo.listTurns(session.id) })));
  return buildParentAskRequest(question, rows);
}

// src/features/tutor/session-json.ts — A tutor session as the Session record screen holds it, for 'Copy as JSON'
// (mw-bhvxcn.10): everything the factory was sent and answered, the timing, and the parent's notes, as one
// fenced block the Governor can hand over. Photo and audio bytes stay out of it: their names, types and sizes go in.

import type { TutorAnswer, TutorTurn } from '../../contracts/types';
import { tutorRepo } from '../../data/repositories';

/** Seconds from sent to answered, when there was an answer (or a refusal); undefined while the turn is still out. */
export function secondsBetween(turn: TutorTurn): number | undefined {
  return turn.answeredAt ? Math.round(((turn.answeredAt.getTime() - turn.sentAt.getTime()) / 1000) * 10) / 10 : undefined;
}

/** What the answers (kept stale ones too) told the parent, each note once, in turn order. */
export function parentNotesOf(turns: TutorTurn[]): string[] {
  const notes: string[] = [];
  for (const turn of turns) {
    const note = turn.answer?.notes_for_parent?.trim();
    if (note && !notes.includes(note)) notes.push(note);
  }
  return notes;
}

type Recommendation = NonNullable<TutorAnswer['recommendations_for_parent']>[number];

/** The recommendations across the session's answers, each once, in turn order. */
export function parentRecommendationsOf(turns: TutorTurn[]): Recommendation[] {
  const found: Recommendation[] = [];
  for (const turn of turns) {
    for (const rec of turn.answer?.recommendations_for_parent ?? []) {
      if (!found.some((r) => r.what === rec.what && r.why === rec.why && r.where === rec.where)) found.push(rec);
    }
  }
  return found;
}

/** What to look at: where the maths went wrong and the gap behind it, each pair once, in turn order. */
export function parentDiagnosesOf(turns: TutorTurn[]): { where_wrong: string; gap: string }[] {
  const found: { where_wrong: string; gap: string }[] = [];
  for (const turn of turns) {
    const d = turn.answer?.math_diagnosis;
    if (d && !found.some((f) => f.where_wrong === d.where_wrong && f.gap === d.gap)) found.push({ where_wrong: d.where_wrong, gap: d.gap });
  }
  return found;
}

/** The way he did it: the method the tutor named, each once, in turn order. */
export function parentMethodsOf(turns: TutorTurn[]): string[] {
  const methods: string[] = [];
  for (const turn of turns) {
    const method = (turn.answer?.math_diagnosis?.method ?? turn.answer?.teaching_method)?.trim();
    if (method && !methods.includes(method)) methods.push(method);
  }
  return methods;
}

/** The whole session as one fenced json block, or an empty block's worth of nothing when it is not there. */
export async function sessionAsJson(sessionId: string): Promise<string> {
  const session = await tutorRepo.getSession(sessionId);
  const turns = await tutorRepo.listTurns(sessionId);
  const out = {
    session,
    turns: await Promise.all(
      turns.map(async (turn) => {
        const { attachments, ...rest } = turn;
        return {
          ...rest,
          secondsBetween: secondsBetween(turn),
          attachments: await Promise.all(
            attachments.map(async (a) => {
              const blob = await tutorRepo.getBlob(a.blobId);
              return { kind: a.kind, name: blob?.name, mime: blob?.mime, bytes: blob?.bytes.byteLength };
            }),
          ),
        };
      }),
    ),
    parentNotes: parentNotesOf(turns),
    parentRecommendations: parentRecommendationsOf(turns),
  };
  return `\`\`\`json\n${JSON.stringify(out, null, 2)}\n\`\`\``;
}

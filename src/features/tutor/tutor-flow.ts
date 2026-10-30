// src/features/tutor/tutor-flow.ts — Bringing a problem in (mw-bhvxcn.8): the first turn of a tutor session goes
// to the factory as a problem-in grist, with the photo or with the typed text. Everything the screen shows
// comes back out of the tutorTurns table, never from here, so a reload loses nothing.

import { PrivateKey } from '@bsv/sdk';
import { door } from 'bsv-kit/bsv';
import { grist } from 'bsv-kit/grist';
import type { HoldRecorder, Recording } from '../../audio';
import type { TutorHistoryEntry, TutorRequest, TutorSession, TutorStrictness, TutorTurn } from '../../contracts/types';
import { bsvWalletRepo, profileRepo, tutorRepo } from '../../data/repositories';
import { MATHS_NODES, PROBLEM_KIND_NODES } from '../../learn/maths';
import { READING_AUDIO_BYTES_PER_SECOND, TUTOR_TURN_GRIND, UploadTimeoutError, gristFileFromBlob, readAnswer, sendGrist, shrinkPhoto, uploadTimeoutMs } from '../../grist';
import type { GristInFlightDeps, GristPhoto } from '../../grist';
import { answerOfProblem, guardTutorAnswer } from './answer-guard';

/** The seams the screen runs on; each defaults to the real thing, tests replace them. */
export interface TutorDeps {
  sendGrist?: typeof sendGrist;
  read?: GristInFlightDeps['read'];
  getKey?: () => Promise<PrivateKey | undefined>;
  shrink?: (blob: Blob) => Promise<GristPhoto>;
  fetchImpl?: typeof fetch;
  /** How often waiting turns are read; the grist client's own 5 s when absent. */
  pollIntervalMs?: number;
  now?: () => Date;
  /** The recorder behind 'Read it'; `onLimit` gets the clip when the ten-minute cap stops it. The real recorder when absent. */
  createRecorder?: (onLimit: (recording: Recording) => void) => HoldRecorder;
  /** Speaks a sentence aloud; the app's own speech when absent. */
  say?: (text: string) => Promise<void>;
  /** Pauses the tutor talking at once when 'Read it' is pressed (the speaking bar offers Resume); the app's own speech when absent. */
  pauseSpeaking?: () => void;
}

export type ProblemSource = { kind: 'text'; text: string } | { kind: 'photo'; file: Blob };

/** A turn still 'sending' this long after it was made was cut off (the app closed mid-send): it is failed on resume. */
export const HALF_SENT_MS = 30_000;

/** How long a turn may sit 'sending': 30 s, and for a reading the extra time its clip's upload is given (grist/limits.ts). */
export function halfSentMs(turn: TutorTurn): number {
  if (turn.mode !== 'reading' || !turn.clipSeconds) return HALF_SENT_MS;
  return HALF_SENT_MS + uploadTimeoutMs(turn.clipSeconds * READING_AUDIO_BYTES_PER_SECOND) - uploadTimeoutMs(0);
}

/** The id of a node of the maths graph, or undefined when `id` is not one. */
const graphNode = (id: string | undefined): string | undefined => (id && MATHS_NODES.some((node) => node.id === id) ? id : undefined);

/** The node of the maths graph a problem is about, from the problems the graph's sweep holds; undefined for a problem it has not seen. */
export function nodeForProblem(targetText: string): string | undefined {
  const text = targetText.trim();
  return PROBLEM_KIND_NODES.find((row) => row.problems.includes(text))?.node;
}

/** The node of the graph a maths turn names, checked against the graph: undefined when it names none, or one the graph does not hold. */
export function homeworkNode(turn: TutorTurn): string | undefined {
  return graphNode(turn.request.node);
}

/** Something the child (or his parent) can act on, worded for them. */
export class TutorUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TutorUserError';
  }
}

export const NO_KEY = "This device has no key yet. Open Settings and tap \"This device's key\" to make one.";
const OFFLINE = 'The tutor cannot be reached right now. Check the internet and try again.';
const UPLOAD_TOO_SLOW = 'Sending took too long. Check your connection and try again.';
const NO_LICENCE = 'This device holds no licence to use the factory.';
const NOT_SENT = 'The problem could not be sent. You can try again.';
const CUT_OFF = 'The problem did not get sent. You can try again.';
const READING_NOT_SENT = 'Your reading could not be sent. You can try again.';
const READING_CUT_OFF = 'Your reading did not get sent. You can try again.';
const MATH_NOT_SENT = 'Your answer could not be sent. You can try again.';
const MATH_CUT_OFF = 'Your answer did not get sent. You can try again.';
const NOTHING_TO_SEND = 'Type your answer or take a photo of your work first.';

/** The device's own key, from its wallet; none when no wallet has been made yet. */
export async function deviceKey(): Promise<PrivateKey | undefined> {
  const wallet = await bsvWalletRepo.getCurrent();
  if (!wallet) return undefined;
  try {
    return PrivateKey.fromWif(wallet.material);
  } catch {
    return undefined;
  }
}

/** The parent's notes for the profile, as the request carries them: absent (an empty object) when there are none. */
async function parentNotesFor(profileId: string): Promise<Pick<TutorRequest, 'parent_notes'>> {
  const notes = (await profileRepo.getById(profileId))?.settings.tutorNotes;
  return notes?.length ? { parent_notes: [...notes] } : {};
}

/** Worded for the person who tapped, from why a send failed. */
export function sayWhy(error: unknown, otherwise: string = NOT_SENT): string {
  // a file that did not finish going up on a working connection: the tutor never had it, and is not what is down
  if (error instanceof UploadTimeoutError) return typeof navigator !== 'undefined' && navigator.onLine === false ? OFFLINE : UPLOAD_TOO_SLOW;
  if (error instanceof door.BackendUnreachableError || error instanceof door.ApiTimeoutError) return OFFLINE;
  if (error instanceof door.RefusedError) {
    if (error.message === door.LICENCE_REQUIRED) return NO_LICENCE;
    // a 5xx is the factory on standby, not a refusal
    return error.status >= 500 ? OFFLINE : otherwise;
  }
  if (error instanceof grist.GristInputError) return error.message;
  return otherwise;
}

/**
 * Starts a session with the problem as its first turn and sends it. A missing key or a photo that cannot be
 * made small enough throws a TutorUserError before anything is stored; a send that fails after that leaves
 * the turn 'failed' with the reason, for the screen to show.
 */
export async function sendProblem(
  params: { profileId: string; strictness: TutorStrictness; source: ProblemSource },
  deps: TutorDeps = {},
): Promise<TutorSession> {
  const key = await (deps.getKey ?? deviceKey)();
  if (!key) throw new TutorUserError(NO_KEY);

  let photo: GristPhoto | undefined;
  if (params.source.kind === 'photo') {
    try {
      photo = await (deps.shrink ?? shrinkPhoto)(params.source.file);
    } catch (error) {
      throw new TutorUserError(error instanceof grist.GristInputError ? error.message : 'This photo could not be used. Try another one.');
    }
  }

  const request: TutorRequest = {
    mode: 'problem-in',
    strictness: params.strictness,
    ...(params.source.kind === 'text' ? { target_text: params.source.text.trim() } : {}),
    ...(await parentNotesFor(params.profileId)),
    session_history: [],
  };

  const session = await tutorRepo.createSession({ profileId: params.profileId, strictness: params.strictness });
  const attachments: { kind: 'problem'; blobId: string }[] = [];
  if (photo) {
    const blob = await tutorRepo.putBlob({ bytes: new Uint8Array(photo.bytes).buffer, mime: photo.mime, name: photo.name });
    attachments.push({ kind: 'problem', blobId: blob.id });
  }
  const turn = await tutorRepo.addTurn({
    sessionId: session.id,
    mode: 'problem-in',
    request,
    attachments,
    sentAt: (deps.now ?? (() => new Date()))(),
  });

  try {
    const sent = await (deps.sendGrist ?? sendGrist)({
      key,
      files: photo ? [photo] : undefined,
      input: request,
      header: TUTOR_TURN_GRIND,
      fetchImpl: deps.fetchImpl,
    });
    await tutorRepo.markSent(turn.id, sent);
  } catch (error) {
    await tutorRepo.markFailed(turn.id, sayWhy(error));
  }
  return session;
}

/** The file extension a recording's mime gives: audio/webm -> webm. */
const extensionOf = (mime: string) => mime.split('/')[1]?.split(';')[0] || 'webm';

/**
 * What has been tried so far, compact, for the grist: the reading and maths turns whose answers the child saw.
 * A stale answer was never shown to him, so it is not part of what he has been told.
 */
export function sessionHistory(turns: TutorTurn[]): TutorHistoryEntry[] {
  return turns
    .filter((turn) => turn.mode !== 'problem-in' && turn.status === 'answered' && turn.answer)
    .map((turn) => ({
      mode: turn.mode,
      action: (turn.answer as NonNullable<TutorTurn['answer']>).action,
      prompt_to_child: (turn.answer as NonNullable<TutorTurn['answer']>).prompt_to_child,
      ...(turn.request.child_answer ? { child_answer: turn.request.child_answer } : {}),
    }));
}

/**
 * Sends one reading: the clip as a reading turn with the target text, kept (audio blob and all) in the session.
 * Any turn still out is moved past first, so its answer, when it comes, is kept and marked stale. The clip is
 * named reading-<n>.<ext>, n counting this session's readings from 1. A send that fails leaves the turn 'failed'
 * with the reason; a missing key throws a TutorUserError before anything is stored.
 */
export async function sendReading(
  params: { session: TutorSession; targetText: string; recording: Recording },
  deps: TutorDeps = {},
): Promise<TutorTurn> {
  const key = await (deps.getKey ?? deviceKey)();
  if (!key) throw new TutorUserError(NO_KEY);

  const { session, recording } = params;
  const turns = await tutorRepo.listTurns(session.id);
  const readings = turns.filter((turn) => turn.mode === 'reading').length;
  const name = `reading-${readings + 1}.${extensionOf(recording.mime)}`;
  const file = await gristFileFromBlob(recording.blob, name);

  const request: TutorRequest = {
    mode: 'reading',
    strictness: session.strictness,
    target_text: params.targetText,
    ...(await parentNotesFor(session.profileId)),
    session_history: sessionHistory(turns),
  };
  const stored = await tutorRepo.putBlob({ bytes: new Uint8Array(file.bytes).buffer, mime: file.mime, name });
  await tutorRepo.moveOn(session.id, turns.reduce((max, t) => Math.max(max, t.index), 0));
  const turn = await tutorRepo.addTurn({
    sessionId: session.id,
    mode: 'reading',
    request,
    attachments: [{ kind: 'audio', blobId: stored.id }],
    ...(recording.capped ? { capped: true } : {}),
    clipSeconds: Math.ceil(recording.durationMs / 1000),
    sentAt: (deps.now ?? (() => new Date()))(),
  });

  try {
    const sent = await (deps.sendGrist ?? sendGrist)({ key, files: [file], input: request, header: TUTOR_TURN_GRIND, fetchImpl: deps.fetchImpl });
    await tutorRepo.markSent(turn.id, sent);
  } catch (error) {
    await tutorRepo.markFailed(turn.id, sayWhy(error, READING_NOT_SENT));
  }
  return turn;
}

/**
 * Sends one maths turn: the child's typed answer and/or a photo of his work, with the problem as the target text.
 * Any turn still out is moved past first (its answer, when it comes, is kept and marked stale). The photo is
 * shrunk and named work-<n>.jpg, n counting this session's maths turns from 1. With neither an answer nor a
 * photo, or with no key, a TutorUserError is thrown before anything is stored; a send that fails leaves the turn
 * 'failed' with the reason. The request names `node`, the node of the maths graph the problem is about, when the graph holds it.
 * Returns the turn as it stands once sent or failed.
 */
export async function sendMath(
  params: { session: TutorSession; targetText: string; answer?: string; photo?: Blob; node?: string },
  deps: TutorDeps = {},
): Promise<TutorTurn> {
  const answer = params.answer?.trim() ?? '';
  if (!answer && !params.photo) throw new TutorUserError(NOTHING_TO_SEND);
  const key = await (deps.getKey ?? deviceKey)();
  if (!key) throw new TutorUserError(NO_KEY);

  const { session } = params;
  const turns = await tutorRepo.listTurns(session.id);
  const name = `work-${turns.filter((turn) => turn.mode === 'math').length + 1}.jpg`;
  let photo: GristPhoto | undefined;
  if (params.photo) {
    try {
      photo = { ...(await (deps.shrink ?? shrinkPhoto)(params.photo)), name };
    } catch (error) {
      throw new TutorUserError(error instanceof grist.GristInputError ? error.message : 'This photo could not be used. Try another one.');
    }
  }

  const request: TutorRequest = {
    mode: 'math',
    strictness: session.strictness,
    target_text: params.targetText,
    ...(answer ? { child_answer: answer } : {}),
    ...(photo ? { work_photo: true } : {}),
    // the node the problem is about: only one the graph holds is named
    ...(graphNode(params.node) ? { node: graphNode(params.node) } : {}),
    ...(await parentNotesFor(session.profileId)),
    session_history: sessionHistory(turns),
  };
  const attachments: { kind: 'work'; blobId: string }[] = [];
  if (photo) {
    const stored = await tutorRepo.putBlob({ bytes: new Uint8Array(photo.bytes).buffer, mime: photo.mime, name });
    attachments.push({ kind: 'work', blobId: stored.id });
  }
  await tutorRepo.moveOn(session.id, turns.reduce((max, t) => Math.max(max, t.index), 0));
  const turn = await tutorRepo.addTurn({
    sessionId: session.id,
    mode: 'math',
    request,
    attachments,
    sentAt: (deps.now ?? (() => new Date()))(),
  });

  try {
    const sent = await (deps.sendGrist ?? sendGrist)({ key, files: photo ? [photo] : undefined, input: request, header: TUTOR_TURN_GRIND, fetchImpl: deps.fetchImpl });
    await tutorRepo.markSent(turn.id, sent);
  } catch (error) {
    await tutorRepo.markFailed(turn.id, sayWhy(error, MATH_NOT_SENT));
  }
  return (await tutorRepo.getTurn(turn.id)) ?? turn;
}

/**
 * The read the screen's in-flight client runs (the factory's own when `read` is absent), with the never-the-answer guard over each
 * answer before it is kept, drawn or spoken: the answer to the turn's problem (read off the photo, or the problem it was sent with) is
 * worked out here, and a reply that holds it becomes a teaching turn (answer-guard.ts). A wait, a refusal, and a teaching answer pass as they came.
 */
export function guardedRead(read: GristInFlightDeps['read'] = (params) => readAnswer(params)): NonNullable<GristInFlightDeps['read']> {
  return async (params) => {
    const result = await read(params);
    if ('pending' in result || result.answer.status !== 'answered') return result;
    const turn = (await tutorRepo.listWaiting()).find((waiting) => waiting.txid === params.txid);
    const session = turn ? await tutorRepo.getSession(turn.sessionId) : undefined;
    const problems = [result.answer.answer.target_text, turn?.request.target_text, session?.targetText];
    const answers = problems.map((problem) => (problem ? answerOfProblem(problem) : undefined));
    const guarded = guardTutorAnswer(result.answer.answer, answers);
    return guarded === result.answer.answer ? result : { ...result, answer: { ...result.answer, answer: guarded } };
  };
}

/** Fails the turns a closed app left half-sent, so a reload never waits on them for ever. */
export async function failHalfSent(turns: TutorTurn[], now: Date = new Date()): Promise<void> {
  for (const turn of turns) {
    if (turn.status === 'sending' && now.getTime() - turn.sentAt.getTime() >= halfSentMs(turn)) {
      await tutorRepo.markFailed(turn.id, turn.mode === 'reading' ? READING_CUT_OFF : turn.mode === 'math' ? MATH_CUT_OFF : CUT_OFF);
    }
  }
}

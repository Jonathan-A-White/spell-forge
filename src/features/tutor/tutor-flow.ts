// src/features/tutor/tutor-flow.ts — Bringing a problem in (mw-bhvxcn.8): the first turn of a tutor session goes
// to the factory as a problem-in grist, with the photo or with the typed text. Everything the screen shows
// comes back out of the tutorTurns table, never from here, so a reload loses nothing.

import { PrivateKey } from '@bsv/sdk';
import type { HoldRecorder, Recording } from '../../audio';
import type { TutorHistoryEntry, TutorRequest, TutorSession, TutorStrictness, TutorTurn } from '../../contracts/types';
import { bsvWalletRepo, profileRepo, tutorRepo } from '../../data/repositories';
import {
  GristLimitError,
  GristOffline,
  GristUnlicensed,
  TUTOR_TURN_GRIND,
  gristFileFromBlob,
  sendGrist,
  shrinkPhoto,
} from '../../grist';
import type { GristInFlightDeps, GristPhoto } from '../../grist';

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
  /** The recorder behind 'Read it'; `onLimit` gets the clip when the 60 s cap stops it. The real recorder when absent. */
  createRecorder?: (onLimit: (recording: Recording) => void) => HoldRecorder;
  /** Speaks a sentence aloud; the app's own speech when absent. */
  say?: (text: string) => Promise<void>;
  /** Stops the tutor talking at once when 'Read it' is pressed; the app's own speech when absent. */
  stopSpeaking?: () => void;
}

export type ProblemSource = { kind: 'text'; text: string } | { kind: 'photo'; file: Blob };

/** A turn still 'sending' this long after it was made was cut off (the app closed mid-send): it is failed on resume. */
export const HALF_SENT_MS = 30_000;

/** Something the child (or his parent) can act on, worded for them. */
export class TutorUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TutorUserError';
  }
}

export const NO_KEY = "This device has no key yet. Open Settings and tap \"This device's key\" to make one.";
const OFFLINE = 'The tutor cannot be reached right now. Check the internet and try again.';
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
  if (error instanceof GristOffline) return OFFLINE;
  if (error instanceof GristUnlicensed || error instanceof GristLimitError) return error.message;
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
      throw new TutorUserError(error instanceof GristLimitError ? error.message : 'This photo could not be used. Try another one.');
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
 * 'failed' with the reason. Returns the turn as it stands once sent or failed.
 */
export async function sendMath(
  params: { session: TutorSession; targetText: string; answer?: string; photo?: Blob },
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
      throw new TutorUserError(error instanceof GristLimitError ? error.message : 'This photo could not be used. Try another one.');
    }
  }

  const request: TutorRequest = {
    mode: 'math',
    strictness: session.strictness,
    target_text: params.targetText,
    ...(answer ? { child_answer: answer } : {}),
    ...(photo ? { work_photo: true } : {}),
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

/** Fails the turns a closed app left half-sent, so a reload never waits on them for ever. */
export async function failHalfSent(turns: TutorTurn[], now: Date = new Date()): Promise<void> {
  for (const turn of turns) {
    if (turn.status === 'sending' && now.getTime() - turn.sentAt.getTime() >= HALF_SENT_MS) {
      await tutorRepo.markFailed(turn.id, turn.mode === 'reading' ? READING_CUT_OFF : turn.mode === 'math' ? MATH_CUT_OFF : CUT_OFF);
    }
  }
}

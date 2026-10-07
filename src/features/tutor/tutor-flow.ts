// src/features/tutor/tutor-flow.ts — Bringing a problem in (mw-bhvxcn.8): the first turn of a tutor session goes
// to the factory as a problem-in grist, with the photo or with the typed text. Everything the screen shows
// comes back out of the tutorTurns table, never from here, so a reload loses nothing.

import { PrivateKey } from '@bsv/sdk';
import type { TutorRequest, TutorSession, TutorStrictness, TutorTurn } from '../../contracts/types';
import { bsvWalletRepo, tutorRepo } from '../../data/repositories';
import {
  GristLimitError,
  GristOffline,
  GristUnlicensed,
  TUTOR_TURN_GRIND,
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

const NO_KEY = "This device has no key yet. Open Settings and tap \"This device's key\" to make one.";
const OFFLINE = 'The tutor cannot be reached right now. Check the internet and try again.';
const NOT_SENT = 'The problem could not be sent. You can try again.';
const CUT_OFF = 'The problem did not get sent. You can try again.';

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

function sayWhy(error: unknown): string {
  if (error instanceof GristOffline) return OFFLINE;
  if (error instanceof GristUnlicensed || error instanceof GristLimitError) return error.message;
  return NOT_SENT;
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

/** Fails the turns a closed app left half-sent, so a reload never waits on them for ever. */
export async function failHalfSent(turns: TutorTurn[], now: Date = new Date()): Promise<void> {
  for (const turn of turns) {
    if (turn.status === 'sending' && now.getTime() - turn.sentAt.getTime() >= HALF_SENT_MS) {
      await tutorRepo.markFailed(turn.id, CUT_OFF);
    }
  }
}

// src/features/tutor/parent-ask-flow.ts — Asking the tutor (mw-kuy7rx.13): a parent's question goes to the factory as
// a parent-ask grist. The ask is stored first (status 'sending') so a send that dies leaves a record; everything the
// screen shows comes back out of the parentAsks table, never from here, so a reload loses nothing.

import type { PrivateKey } from '@bsv/sdk';
import type { ParentAsk } from '../../contracts/types';
import { parentAskRepo, tutorRepo } from '../../data/repositories';
import { grist } from 'bsv-kit/grist';
import { PARENT_ASK_GRIND, sendGrist, shrinkPhoto } from '../../grist';
import type { GristPhoto, ParentAskInFlightDeps } from '../../grist';
import { PARENT_ASK_MAX_PICTURES, PARENT_ASK_MAX_QUESTION, buildParentAskRequestFor } from './parent-ask-request';
import { isTooLong, tooLongReason } from './length-limit';
import { HALF_SENT_MS, NO_KEY, TutorUserError, deviceKey, sayWhy } from './tutor-flow';

/** The seams the box runs on; each defaults to the real thing, tests replace them. */
export interface ParentAskDeps {
  sendGrist?: typeof sendGrist;
  read?: ParentAskInFlightDeps['read'];
  getKey?: () => Promise<PrivateKey | undefined>;
  fetchImpl?: typeof fetch;
  /** Gets a picture into what a grist may carry; shrinkPhoto when absent. */
  shrink?: (blob: Blob) => Promise<GristPhoto>;
  /** How often waiting asks are read; the grist client's own 5 s when absent. */
  pollIntervalMs?: number;
  now?: () => Date;
}

/** How many of the latest asks the box lists. */
export const PARENT_ASK_HISTORY = 10;

const NOT_SENT = 'The question could not be sent. You can try again.';
const CUT_OFF = 'The question did not get sent. You can try again.';
const NOTHING_TO_ASK = 'Type your question first.';
const TOO_MANY_PICTURES = `A question takes at most ${PARENT_ASK_MAX_PICTURES} pictures. Take some away and send it again.`;
const BAD_PICTURE = 'This picture could not be used. Try another one.';

/** The file extension a picture's mime gives: image/jpeg -> jpg. */
const extensionOf = (mime: string) => (mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1] || 'jpg');

/**
 * Sends the question with the child's latest sessions as text, and up to PARENT_ASK_MAX_PICTURES pictures as the
 * grist's files (named picture-<n>.<ext>, the request's `pictures` counting them). No key, an empty question or one
 * past PARENT_ASK_MAX_QUESTION (refused whole, never cut), too many pictures or a picture that cannot be made small
 * enough throws a TutorUserError before anything is stored; a send that fails after that leaves the ask 'failed'
 * with the reason. Returns the ask as it now stands.
 */
export async function sendParentAsk(
  params: { profileId: string; question: string; pictures?: Blob[] },
  deps: ParentAskDeps = {},
): Promise<ParentAsk> {
  if (!params.question.trim()) throw new TutorUserError(NOTHING_TO_ASK);
  if (isTooLong(params.question, PARENT_ASK_MAX_QUESTION)) {
    throw new TutorUserError(tooLongReason(params.question, PARENT_ASK_MAX_QUESTION, 'question', 'send'));
  }
  const key = await (deps.getKey ?? deviceKey)();
  if (!key) throw new TutorUserError(NO_KEY);

  const blobs = params.pictures ?? [];
  if (blobs.length > PARENT_ASK_MAX_PICTURES) throw new TutorUserError(TOO_MANY_PICTURES);
  const files: (GristPhoto & { name: string })[] = [];
  for (const [index, blob] of blobs.entries()) {
    try {
      const photo = await (deps.shrink ?? shrinkPhoto)(blob);
      files.push({ ...photo, name: `picture-${index + 1}.${extensionOf(photo.mime)}` });
    } catch (error) {
      throw new TutorUserError(error instanceof grist.GristInputError ? error.message : BAD_PICTURE);
    }
  }

  const request = await buildParentAskRequestFor(params.profileId, params.question, files.length);
  const stored = await Promise.all(files.map((file) => tutorRepo.putBlob({ bytes: new Uint8Array(file.bytes).buffer, mime: file.mime, name: file.name })));
  const ask = await parentAskRepo.add({
    profileId: params.profileId,
    question: request.question,
    request,
    pictures: stored.map((blob) => blob.id),
    askedAt: (deps.now ?? (() => new Date()))(),
  });
  try {
    const sent = await (deps.sendGrist ?? sendGrist)({ key, ...(files.length > 0 ? { files } : {}), input: request, header: { ...PARENT_ASK_GRIND }, fetchImpl: deps.fetchImpl });
    await parentAskRepo.markSent(ask.id, sent);
  } catch (error) {
    await parentAskRepo.markFailed(ask.id, sayWhy(error, NOT_SENT));
  }
  return (await parentAskRepo.get(ask.id)) ?? ask;
}

/** Fails the asks a closed app left half-sent, so a reload never waits on them for ever. */
export async function failHalfSentAsks(asks: ParentAsk[], now: Date = new Date()): Promise<void> {
  for (const ask of asks) {
    if (ask.status === 'sending' && now.getTime() - ask.askedAt.getTime() >= HALF_SENT_MS) {
      await parentAskRepo.markFailed(ask.id, CUT_OFF);
    }
  }
}

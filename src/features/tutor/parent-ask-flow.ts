// src/features/tutor/parent-ask-flow.ts — Asking the tutor (mw-kuy7rx.13): a parent's question goes to the factory as
// a parent-ask grist. The ask is stored first (status 'sending') so a send that dies leaves a record; everything the
// screen shows comes back out of the parentAsks table, never from here, so a reload loses nothing.

import type { PrivateKey } from '@bsv/sdk';
import type { ParentAsk } from '../../contracts/types';
import { parentAskRepo } from '../../data/repositories';
import { PARENT_ASK_GRIND, sendGrist } from '../../grist';
import type { ParentAskInFlightDeps } from '../../grist';
import { buildParentAskRequestFor } from './parent-ask-request';
import { HALF_SENT_MS, NO_KEY, TutorUserError, deviceKey, sayWhy } from './tutor-flow';

/** The seams the box runs on; each defaults to the real thing, tests replace them. */
export interface ParentAskDeps {
  sendGrist?: typeof sendGrist;
  read?: ParentAskInFlightDeps['read'];
  getKey?: () => Promise<PrivateKey | undefined>;
  fetchImpl?: typeof fetch;
  /** How often waiting asks are read; the grist client's own 5 s when absent. */
  pollIntervalMs?: number;
  now?: () => Date;
}

/** How many of the latest asks the box lists. */
export const PARENT_ASK_HISTORY = 10;

const NOT_SENT = 'The question could not be sent. You can try again.';
const CUT_OFF = 'The question did not get sent. You can try again.';
const NOTHING_TO_ASK = 'Type your question first.';

/**
 * Sends the question with the child's latest sessions as text. No key, or an empty question, throws a
 * TutorUserError before anything is stored; a send that fails after that leaves the ask 'failed' with the reason.
 * Returns the ask as it now stands.
 */
export async function sendParentAsk(params: { profileId: string; question: string }, deps: ParentAskDeps = {}): Promise<ParentAsk> {
  if (!params.question.trim()) throw new TutorUserError(NOTHING_TO_ASK);
  const key = await (deps.getKey ?? deviceKey)();
  if (!key) throw new TutorUserError(NO_KEY);

  const request = await buildParentAskRequestFor(params.profileId, params.question);
  const ask = await parentAskRepo.add({
    profileId: params.profileId,
    question: request.question,
    request,
    askedAt: (deps.now ?? (() => new Date()))(),
  });
  try {
    const sent = await (deps.sendGrist ?? sendGrist)({ key, input: request, header: { ...PARENT_ASK_GRIND }, fetchImpl: deps.fetchImpl });
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

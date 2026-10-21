// src/grist/limits.ts — How long the client waits on a call whose size varies with what the child sent: the upload of
// a clip or a photo, and the deadline of a reading, which the mill scores at about half the clip's own length.

import { door } from 'bsv-kit/bsv';

/** How long the factory has to answer one turn. A reading has its own, from its clip (readingDeadlineMs). */
export const TUTOR_TURN_DEADLINE_MS = 180_000;

/** What the recorder asks of the phone's encoder: 32 kbit/s, 4000 bytes for each second read (recorder.ts). */
export const READING_AUDIO_BYTES_PER_SECOND = 4_000;
/** A slow phone link, as the upload limit counts it: 200 kbit/s. */
const UPLOAD_BYTES_PER_SECOND = 25_000;
/** The mill's local scorer takes 120 s and 0.5 s per audio second, 540 s at most (mw-5r3p30.685, mw-gq6.663). */
const scorerLimitMs = (seconds: number) => Math.min(540, 120 + 0.5 * seconds) * 1000;
/** What the tutor model needs once the scorer is done. */
const MODEL_STEP_MS = 60_000;

/** How long one request carrying `bytes` may go unanswered: the door's 30 s, and the time the bytes need on a slow link. */
export function uploadTimeoutMs(bytes: number): number {
  return door.API_TIMEOUT_MS + Math.ceil((Math.max(0, bytes) / UPLOAD_BYTES_PER_SECOND) * 1000);
}

/** How long a reading of `clipSeconds` has to be answered, counted from when it was sent: the upload, the mill's
 *  scorer and a model step, never less than a tutor turn's 180 s (also when the clip's length is not known). */
export function readingDeadlineMs(clipSeconds?: number): number {
  if (clipSeconds === undefined || !Number.isFinite(clipSeconds) || clipSeconds <= 0) return TUTOR_TURN_DEADLINE_MS;
  const upload = uploadTimeoutMs(clipSeconds * READING_AUDIO_BYTES_PER_SECOND);
  return Math.max(TUTOR_TURN_DEADLINE_MS, upload + scorerLimitMs(clipSeconds) + MODEL_STEP_MS);
}

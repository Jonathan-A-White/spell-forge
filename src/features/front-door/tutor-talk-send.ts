// src/features/front-door/tutor-talk-send.ts — the front door's turn to the mill (Kestrel 13e). TutorTalkSend (front-door-flow.ts)
// over sendGrist for the tutor-talk grind (grinds/tutor-talk.json): the request goes as the grist's input and up to three pictures as
// its files (made small enough first, as the tutor's photos are), then the answer is waited for by reading the mill's messages every
// second, as tutor-flow.ts's turns are, until it comes or the turn's 180 s are up. The answer is checked against
// grinds/tutor-talk.answer.schema.json before the flow sees it (isTutorTalkAnswer, held equal to the schema by
// tests/unit/tutor-talk-send.test.ts). Every way a turn can fail is a TutorTalkError worded for the child; the door shows its message.
import type { PrivateKey } from '@bsv/sdk';
import { grist } from 'bsv-kit/grist';
import type { OutgoingPicture } from 'voice-kit/talks';
import {
  TUTOR_POLL_IN_FLIGHT_MS,
  TUTOR_TURN_DEADLINE_MS,
  readAnswer,
  sendGrist,
  shrinkPhoto,
  type GristFile,
  type GristPhoto,
  type ReadAnswerParams,
  type ReadAnswerResult,
} from '../../grist';
import { NO_KEY, deviceKey, sayWhy } from '../tutor/tutor-flow';
import { FRONT_DOOR_MAX_PICTURES, TALK_WORLDS, type TutorTalkAnswer, type TutorTalkSend } from './front-door-flow';

export const TUTOR_TALK_GRIND = { app: 'spellforge', kind: 'tutor-talk', v: '1' } as const;

/** A turn that did not come back as an answer, worded for the child: the door shows `message`. */
export class TutorTalkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TutorTalkError';
  }
}

const TRY_AGAIN = 'Hold the button and try again.';
const NOT_ANSWERED = `The tutor could not answer just now. ${TRY_AGAIN}`;
const NOT_USABLE = `The tutor sent an answer this app could not use. ${TRY_AGAIN}`;
const TOO_SLOW = `The tutor took too long to answer. ${TRY_AGAIN}`;
const TOO_MANY = `A message takes at most ${FRONT_DOOR_MAX_PICTURES} pictures. Take some away and try again.`;
const BAD_PICTURE = 'This picture could not be used. Try another one.';

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown, max = Infinity): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const hasOnly = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every((key) => keys.includes(key));
const isList = (value: unknown, max: number, each: (item: unknown) => boolean) => Array.isArray(value) && value.length <= max && value.every(each);

const PROFILE_FIELDS = ['age', 'gender', 'experience', 'learnerKind', 'speed', 'notes', 'guessed'] as const;

function isProfileUpdate(value: unknown): boolean {
  if (!isObject(value) || !hasOnly(value, PROFILE_FIELDS)) return false;
  const { age, gender, experience, learnerKind, speed, notes, guessed } = value;
  return (
    (age === undefined || (Number.isInteger(age) && (age as number) >= 1 && (age as number) <= 120)) &&
    (gender === undefined || gender === 'boy' || gender === 'girl') &&
    (experience === undefined || isText(experience, 100)) &&
    (learnerKind === undefined || isText(learnerKind, 100)) &&
    (speed === undefined || speed === 'quick' || speed === 'steady' || speed === 'slow') &&
    (notes === undefined || isList(notes, 3, (note) => isText(note, 100))) &&
    (guessed === undefined || isList(guessed, Infinity, (field) => typeof field === 'string' && field !== 'notes' && PROFILE_FIELDS.includes(field as (typeof PROFILE_FIELDS)[number])))
  );
}

function isMemoryUpdate(value: unknown): boolean {
  if (!isObject(value) || !hasOnly(value, ['add', 'remove', 'summary'])) return false;
  const { add, remove, summary } = value;
  return (
    (add === undefined || isList(add, 5, (fact) => isText(fact, 300))) &&
    (remove === undefined || isList(remove, 5, (fact) => isText(fact))) &&
    (summary === undefined || (typeof summary === 'string' && summary.length <= 1500))
  );
}

/** The tutor-talk answer schema, checked field by field: the guard the device runs on whatever the mill sends. */
export function isTutorTalkAnswer(value: unknown): value is TutorTalkAnswer {
  if (!isObject(value)) return false;
  // `undefined` is a field left out, as JSON has it
  const given = Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined));
  if (!hasOnly(given, ['words', 'profile_update', 'goal_suggestion', 'world', 'memory_update', 'form_values', 'form_ask'])) return false;
  if (!isText(given.words, 1000)) return false;
  const { profile_update, goal_suggestion, world, memory_update, form_values, form_ask } = given;
  if (profile_update !== undefined && !isProfileUpdate(profile_update)) return false;
  if (goal_suggestion !== undefined) {
    if (!isObject(goal_suggestion) || !hasOnly(goal_suggestion, ['id', 'why']) || !isText(goal_suggestion.id) || !isText(goal_suggestion.why, 200)) return false;
  }
  if (world !== undefined && !(typeof world === 'string' && (TALK_WORLDS as readonly string[]).includes(world))) return false;
  if (memory_update !== undefined && !isMemoryUpdate(memory_update)) return false;
  if (form_values !== undefined) {
    const isValue = (entry: unknown) =>
      isObject(entry) && hasOnly(entry, ['field', 'value']) && isText(entry.field, 40) && typeof entry.value === 'string' && entry.value.length <= 4000;
    if (!isList(form_values, 8, isValue)) return false;
  }
  return form_ask === undefined || isText(form_ask, 40);
}

/** The seams the send runs on; each defaults to the real thing, tests replace them. */
export interface TutorTalkSendDeps {
  sendGrist?: typeof sendGrist;
  read?: (params: ReadAnswerParams<TutorTalkAnswer>) => Promise<ReadAnswerResult<TutorTalkAnswer>>;
  getKey?: () => Promise<PrivateKey | undefined>;
  /** Gets a picture into what a grist may carry; shrinkPhoto when absent. */
  shrink?: (blob: Blob) => Promise<GristPhoto>;
  fetchImpl?: typeof fetch;
  /** How often the answer is looked for: every second when absent. */
  pollIntervalMs?: number;
  /** How long the mill has to answer, counted from when the grist was sent: 180 s when absent. */
  deadlineMs?: number;
}

/** The file extension a picture's mime gives: the subtype, with jpeg -> jpg. */
const extensionOf = (mime: string) => {
  const subtype = mime.split('/')[1] || 'jpg';
  return subtype === 'jpeg' ? 'jpg' : subtype;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The front door's TutorTalkSend over the factory. */
export function createTutorTalkSend(deps: TutorTalkSendDeps = {}): TutorTalkSend {
  const send = deps.sendGrist ?? sendGrist;
  const read = deps.read ?? ((params) => readAnswer(params));
  const pollMs = deps.pollIntervalMs ?? TUTOR_POLL_IN_FLIGHT_MS;
  const deadlineMs = deps.deadlineMs ?? TUTOR_TURN_DEADLINE_MS;

  return async (request, pictures: OutgoingPicture[]): Promise<TutorTalkAnswer> => {
    if (pictures.length > FRONT_DOOR_MAX_PICTURES) throw new TutorTalkError(TOO_MANY);
    const key = await (deps.getKey ?? deviceKey)();
    if (!key) throw new TutorTalkError(NO_KEY);

    const files: GristFile[] = [];
    for (const [index, picture] of pictures.entries()) {
      try {
        const photo = await (deps.shrink ?? shrinkPhoto)(new Blob([picture.bytes as BlobPart], { type: picture.mime }));
        files.push({ ...photo, name: `picture-${index + 1}.${extensionOf(photo.mime)}` });
      } catch (error) {
        throw new TutorTalkError(error instanceof grist.GristInputError ? error.message : BAD_PICTURE);
      }
    }

    let sent;
    try {
      sent = await send({ key, ...(files.length > 0 ? { files } : {}), input: request, header: { ...TUTOR_TALK_GRIND }, fetchImpl: deps.fetchImpl });
    } catch (error) {
      throw new TutorTalkError(sayWhy(error, NOT_ANSWERED));
    }

    const sentAt = Date.now();
    let since = sent.seq;
    for (;;) {
      try {
        const result = await read({ key, txid: sent.txid, mill: sent.mill, since, isAnswer: isTutorTalkAnswer, fetchImpl: deps.fetchImpl });
        since = Math.max(since, result.next);
        if (!('pending' in result)) {
          const { answer } = result;
          if (answer.status !== 'answered') throw new TutorTalkError(NOT_ANSWERED);
          // checked again here: the guard is the schema, and nothing the schema refuses is shown
          if (!isTutorTalkAnswer(answer.answer)) throw new TutorTalkError(NOT_USABLE);
          return answer.answer;
        }
      } catch (error) {
        if (error instanceof TutorTalkError) throw error;
        // the factory cannot be reached right now: the next look, or the deadline, decides
      }
      if (Date.now() - sentAt >= deadlineMs) throw new TutorTalkError(TOO_SLOW);
      await wait(pollMs);
    }
  };
}

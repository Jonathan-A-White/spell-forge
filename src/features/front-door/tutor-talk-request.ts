// src/features/front-door/tutor-talk-request.ts — the front door's request to the tutor-talk grind
// (grinds/tutor-talk.request.schema.json), built under a byte budget (M38). What it carries, and why the rest of the
// settings and the profile are not sent, is the table in docs/what-the-tutor-is-told.md (M39), held equal to what this
// builds by tests/unit/tutor-talk-request.test.ts: a field added here is a row added there.
//
// The input is what @voice-kit/talks gives a custom buildRequest (the message, the turns before it, oldest first, the
// talk's memory, how many pictures) and what the app knows of the child. Over the budget, the oldest turns go first
// and the memory is kept: it is what the talk remembers of the turns that are gone.
import type { Profile } from '../../contracts';
import type { ProfileValues } from 'learn-kit/learner';
import type { GradeBand as MathsBand } from '../../learn/maths';
import type { GradeBand as SpellingBand } from '../../learn/spelling';

export const TUTOR_TALK_SCHEMA_VERSION = '1';

/**
 * The most a request may weigh, as JSON in UTF-8. The sealed grist's record is capped (bsv-kit's grist MAX_PAYLOAD_BYTES,
 * 20 KiB, of base64 with the envelope); Lampas measured a 9000-byte request to seal to about 12 KiB, under it with room.
 */
export const TUTOR_TALK_MAX_BYTES = 9000;

/** The longest message the request schema takes; what he said past it is cut. */
export const MESSAGE_MAX_CHARS = 2000;

export interface TalkTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface TalkMemory {
  facts: string[];
  summary: string;
}

export interface SubjectProgress<Band extends string> {
  /** The grade band he is working in. */
  band: Band;
  /** The next few nodes to learn, by their child-facing names. */
  next: string[];
}

export interface TutorTalkInput {
  /** What he said now. */
  message: string;
  /** The turns of the talk before this message, oldest first. */
  turns: readonly TalkTurn[];
  memory: TalkMemory;
  /** How many pictures go with this message. */
  pictures?: number;
  /** The child's profile: only the settings in the table are read from it. */
  profile: Profile;
  /** What is known of the learner (learn-kit's valuesOf). */
  learner: Partial<ProfileValues>;
  goal?: { id: string; title: string; progress: number };
  /** The goals the app can scaffold. */
  goals: readonly { id: string; title: string }[];
  progress?: { spelling?: SubjectProgress<SpellingBand>; maths?: SubjectProgress<MathsBand> };
  /** The screen he asked from (M37). */
  screen?: { name: string; facts: string[] };
}

export interface TutorTalkRequest {
  schemaVersion: typeof TUTOR_TALK_SCHEMA_VERSION;
  message: string;
  pictures?: number;
  history: TalkTurn[];
  memory?: TalkMemory;
  strictness: 'meaning-gated' | 'precision';
  parent_notes?: string[];
  learner?: Partial<ProfileValues>;
  goal?: { id: string; title: string; progress: number };
  goals?: { id: string; title: string }[];
  progress?: { spelling?: SubjectProgress<SpellingBand>; maths?: SubjectProgress<MathsBand> };
  screen?: { name: string; facts: string[] };
}

const encoder = new TextEncoder();

/** What a request weighs: the UTF-8 length of its JSON. */
export function requestBytes(request: unknown): number {
  return encoder.encode(JSON.stringify(request)).length;
}

/** A request with one thing less, or null when the cut has nothing left to take. */
type Cut = (request: TutorTalkRequest) => TutorTalkRequest | null;

/** The cuts, in the order they are taken: the oldest turn, then the screen's last fact, and the memory's oldest fact last of all. */
const CUTS: readonly Cut[] = [
  (r) => (r.history.length > 0 ? { ...r, history: r.history.slice(1) } : null),
  (r) => (r.screen && r.screen.facts.length > 0 ? { ...r, screen: { ...r.screen, facts: r.screen.facts.slice(0, -1) } } : null),
  (r) => (r.memory && r.memory.facts.length > 0 ? { ...r, memory: { ...r.memory, facts: r.memory.facts.slice(1) } } : null),
];

/** The request cut to `maxBytes`: each cut taken while it is over and the cut has something to take, then the next. */
export function fitTutorTalkRequest(request: TutorTalkRequest, maxBytes = TUTOR_TALK_MAX_BYTES): TutorTalkRequest {
  let fitted = request;
  for (const cut of CUTS) {
    while (requestBytes(fitted) > maxBytes) {
      const next = cut(fitted);
      if (!next) break;
      fitted = next;
    }
  }
  return fitted;
}

const nonEmpty = <T>(list: readonly T[] | undefined): list is readonly T[] => list !== undefined && list.length > 0;

/** The request for one turn of the front door's talk, under the budget. */
export function buildTutorTalkRequest(input: TutorTalkInput, maxBytes = TUTOR_TALK_MAX_BYTES): TutorTalkRequest {
  const { settings } = input.profile;
  const memory = input.memory;
  const request: TutorTalkRequest = {
    schemaVersion: TUTOR_TALK_SCHEMA_VERSION,
    message: input.message.trim().slice(0, MESSAGE_MAX_CHARS),
    ...(input.pictures ? { pictures: input.pictures } : {}),
    history: input.turns.map(({ role, text }) => ({ role, text })),
    ...(memory.facts.length > 0 || memory.summary ? { memory: { facts: [...memory.facts], summary: memory.summary } } : {}),
    strictness: settings.tutorStrictness ?? 'meaning-gated',
    ...(nonEmpty(settings.tutorNotes) ? { parent_notes: [...settings.tutorNotes] } : {}),
    ...(Object.keys(input.learner).length > 0 ? { learner: { ...input.learner } } : {}),
    ...(input.goal ? { goal: { ...input.goal } } : {}),
    ...(nonEmpty(input.goals) ? { goals: input.goals.map(({ id, title }) => ({ id, title })) } : {}),
    ...(input.progress && (input.progress.spelling || input.progress.maths) ? { progress: input.progress } : {}),
    ...(input.screen ? { screen: { name: input.screen.name, facts: [...input.screen.facts] } } : {}),
  };
  return fitTutorTalkRequest(request, maxBytes);
}

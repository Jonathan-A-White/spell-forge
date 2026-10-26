// src/features/front-door/front-door-flow.ts — one turn of the front door's talk (Kestrel 13b). What he says goes to the
// tutor-talk grind (grinds/tutor-talk.json) through @voice-kit/talks' turn loop, the talk kept in the kit's Dexie store, the
// request built by tutor-talk-request.ts under its budget. The answer is carried out here: its profile_update folds into the
// learner profile with the turn it came from (getting-to-know.ts), its world opens by id through the registry's one place
// (src/shell/worlds.ts openWorld, over openView). With no licence no grind is called: the flow offers the worlds instead
// (src/shell/licence-gate.ts). An answer's maker_request becomes the reply's `maker`, the offer of the Send button
// (src/features/requests). The screen (FrontDoor.tsx) speaks and draws what this returns.
import { emptyProfile, valuesOf, type LearnResult } from 'learn-kit/learner';
import { createTalks, defineRegistry, type AskOptions, type MemoryUpdate, type OutgoingPicture, type TalkStore, type TutorStore } from 'voice-kit/talks';
import { createDexieStore } from 'voice-kit/talks/dexie';
import { profileRepo } from '../../data/repositories';
import { NO_LICENCE_LINE, gateGrind } from '../../shell/licence-gate';
import { openWorld, type ViewId } from '../../shell/worlds';
import type { MakerOffer } from '../requests/file-from-talk';
import { foldProfileUpdate, turnRef, type ProfileUpdate } from './getting-to-know';
import { buildTutorTalkRequest, type TutorTalkInput, type TutorTalkRequest } from './tutor-talk-request';

/** The IndexedDB database the front door's talks are kept in (the kit's own, beside the app's). */
export const FRONT_DOOR_TALKS_DB = 'spell-forge-talks';

/** The most pictures one message carries: the grind's attachments.max. */
export const FRONT_DOOR_MAX_PICTURES = 3;

/** The worlds the tutor can open (the answer schema's `world`), in the order they are offered. */
export const TALK_WORLDS = ['spelling', 'maths'] as const;
export type TalkWorld = (typeof TALK_WORLDS)[number];

/** A tutor-talk answer (grinds/tutor-talk.answer.schema.json). */
export interface TutorTalkAnswer {
  words: string;
  profile_update?: ProfileUpdate;
  goal_suggestion?: { id: string; why: string };
  world?: TalkWorld;
  memory_update?: MemoryUpdate;
  /** The ask the app cannot meet, set when `words` offers to pass it on to the maker. */
  maker_request?: { summary: string };
}

/** The grind: the request and its pictures in, the answer out. A throw keeps nothing of the turn. */
export type TutorTalkSend = (request: TutorTalkRequest, files: OutgoingPicture[]) => Promise<TutorTalkAnswer>;

/** What the app knows besides the talk and the profile, read for each turn (docs/what-the-tutor-is-told.md). */
export type FrontDoorContext = Pick<TutorTalkInput, 'goal' | 'goals' | 'progress' | 'screen'>;

export interface FrontDoorFlowDeps {
  send: TutorTalkSend;
  /** The child talking. */
  profileId: string;
  /** Opens a screen (the app's setView). */
  open: (view: ViewId) => void;
  /** Where the talks are kept; the Dexie store FRONT_DOOR_TALKS_DB when absent. */
  store?: TalkStore & TutorStore;
  context?: () => FrontDoorContext | Promise<FrontDoorContext>;
  /** The clock: Date.now when absent. */
  now?: () => number;
}

export type FrontDoorReply =
  | {
      kind: 'answer';
      /** What the tutor says: shown and spoken. */
      words: string;
      /** The id of the answer's turn, as the learner profile keeps it. */
      turn: string;
      world?: TalkWorld;
      /** Whether the world opened (a world with no screen yet does not). */
      opened: boolean;
      /** What became of each value of the profile update, in order. */
      learned: LearnResult[];
      goal?: { id: string; why: string };
      /** The tutor's offer to pass an ask on to the maker: his words and the one-line summary; sent only on a tap (src/features/requests). */
      maker?: MakerOffer;
    }
  | { kind: 'offer-worlds'; line: string; worlds: TalkWorld[] };

export interface FrontDoorFlow {
  /** Starts a talk; its id. */
  start(): Promise<string>;
  /** One turn: what he said (and any pictures) to the tutor, the answer carried out. Turns are taken one at a time. */
  ask(talkId: string, message: string, options?: AskOptions): Promise<FrontDoorReply>;
}

/** The registry of what the front door's tutor may open: one place, a world by its id. */
export function frontDoorRegistry(open: (view: ViewId) => void) {
  return defineRegistry({
    places: [
      {
        name: 'world',
        tell: 'opens a world he chose: spelling or maths',
        args: { type: 'object', properties: { world: { enum: TALK_WORLDS } }, required: ['world'], additionalProperties: false },
        open: async (args) => {
          const { world } = args as { world: TalkWorld };
          if (!openWorld(world, open)) throw new Error(`${world} has no screen yet`);
        },
      },
    ],
  });
}

/** What the flow answers without a licence: the worlds, as pictures, with the gate's one line. */
const offerTheWorlds = (): FrontDoorReply => ({ kind: 'offer-worlds', line: NO_LICENCE_LINE, worlds: [...TALK_WORLDS] });

export function createFrontDoorFlow(deps: FrontDoorFlowDeps): FrontDoorFlow {
  // The kit hands Dexie its `indexedDB` option as given, so an absent one is Dexie's "no IndexedDB" (MissingAPIError), not its own default: name the page's.
  const store = deps.store ?? createDexieStore({ name: FRONT_DOOR_TALKS_DB, indexedDB: globalThis.indexedDB, IDBKeyRange: globalThis.IDBKeyRange });
  const now = deps.now ?? Date.now;
  const registry = frontDoorRegistry(deps.open);
  let queue: Promise<unknown> = Promise.resolve();

  async function turnOnce(talkId: string, message: string, options?: AskOptions): Promise<FrontDoorReply> {
    // the licence gate: with no licence no grind goes out, and the worlds are offered
    if (!gateGrind().allowed) return offerTheWorlds();

    const profile = await profileRepo.getById(deps.profileId);
    if (!profile) throw new Error(`Profile ${deps.profileId} not found`);
    const context: FrontDoorContext = (await deps.context?.()) ?? { goals: [] };
    const talks = createTalks<TutorTalkRequest, TutorTalkAnswer>({
      store,
      send: deps.send,
      now,
      maxPictures: FRONT_DOOR_MAX_PICTURES,
      answerText: (answer) => answer.words,
      buildRequest: (input) =>
        buildTutorTalkRequest({
          ...context,
          message: input.message,
          turns: input.turns,
          memory: input.memory,
          pictures: input.pictures.length,
          profile,
          learner: valuesOf(profile.learner ?? emptyProfile()),
        }),
    });

    const { answer, talk, reply, user } = await talks.ask(talkId, message, options);
    const turn = turnRef(talkId, talk.turns.length - 1);
    const learned = answer.profile_update ? (await foldProfileUpdate(deps.profileId, answer.profile_update, turn, reply.at)).results : [];
    const opened = answer.world ? (await registry.open('world', { world: answer.world })).ok : false;
    return {
      kind: 'answer',
      words: answer.words,
      turn,
      ...(answer.world ? { world: answer.world } : {}),
      opened,
      learned,
      ...(answer.goal_suggestion ? { goal: { ...answer.goal_suggestion } } : {}),
      ...(answer.maker_request ? { maker: { talkId, words: user.text, summary: answer.maker_request.summary } } : {}),
    };
  }

  return {
    async start() {
      return (await store.create({ title: 'Front door' })).id;
    },
    ask(talkId, message, options) {
      const run = queue.then(() => turnOnce(talkId, message, options));
      queue = run.catch(() => undefined);
      return run;
    },
  };
}

// src/grist/in-flight.ts — Any number of tutor turns in flight at once, each answer applied to its own turn as
// it arrives, in whatever order. One pass reads for every waiting txid (every 5 s, when the browser comes online,
// on load); a turn still unanswered 180 s after it was sent is failed. Everything a pass needs is in the
// tutorTurns table, never in memory, so a reload loses nothing.

import type { PrivateKey } from '@bsv/sdk';
import type { TutorAnswer, TutorTurn, TutorTurnResult } from '../contracts/types';
import { tutorRepo } from '../data/repositories/tutor-repo';
import { readAnswer } from './read-answer';
import type { ReadAnswerParams, ReadAnswerResult } from './read-answer';
import { isTutorAnswer } from './tutor-answer';

/** How often a pass runs while the app is open. A pass with nothing waiting asks the network nothing. */
export const TUTOR_POLL_INTERVAL_MS = 5_000;
/** How long the factory has to answer one turn. */
export const TUTOR_TURN_DEADLINE_MS = 180_000;

const TOO_LONG = 'The tutor took too long to answer. You can try again.';

export interface GristInFlightDeps {
  /** The device's key; none (no wallet yet) means nothing can be read, and nothing is asked. */
  getKey: () => Promise<PrivateKey | undefined>;
  /** The seams below default to the real thing; tests replace them. */
  read?: (params: ReadAnswerParams<TutorAnswer>) => Promise<ReadAnswerResult<TutorAnswer>>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export class GristInFlight {
  private running: Promise<void> | undefined;
  private readonly deps: GristInFlightDeps;

  constructor(deps: GristInFlightDeps) {
    this.deps = deps;
  }

  /** Passes on load, every 5 s and on `online`. Returns the function that stops all three. */
  start(): () => void {
    const run = () => {
      void this.pass();
    };
    run();
    const timer = setInterval(run, TUTOR_POLL_INTERVAL_MS);
    window.addEventListener('online', run);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', run);
    };
  }

  /** One pass over every waiting turn. A pass already running is joined, not doubled. */
  pass(): Promise<void> {
    if (!this.running) {
      this.running = this.runPass().finally(() => {
        this.running = undefined;
      });
    }
    return this.running;
  }

  private async runPass(): Promise<void> {
    const waiting = (await tutorRepo.listWaiting()).filter((turn) => turn.txid && turn.mill);
    if (waiting.length === 0) return;
    const key = await this.deps.getKey();
    if (!key) return;
    await Promise.all(waiting.map((turn) => this.settle(turn, key)));
  }

  private async settle(turn: TutorTurn, key: PrivateKey): Promise<void> {
    const read = this.deps.read ?? ((params) => readAnswer(params));
    const now = this.deps.now ?? (() => new Date());
    try {
      const result = await read({
        key,
        txid: turn.txid as string,
        mill: turn.mill as string,
        since: turn.seq ?? 0,
        isAnswer: isTutorAnswer,
        fetchImpl: this.deps.fetchImpl,
      });
      if (!('pending' in result)) {
        const verdict: TutorTurnResult =
          result.answer.status === 'answered'
            ? { status: 'answered', answer: result.answer.answer }
            : { status: result.answer.status, reason: result.answer.reason };
        await tutorRepo.applyAnswer(turn.txid as string, verdict, now());
        return;
      }
    } catch {
      // the factory cannot be reached right now: the next pass, or the deadline, decides
    }
    if (now().getTime() - turn.sentAt.getTime() >= TUTOR_TURN_DEADLINE_MS) {
      await tutorRepo.markFailed(turn.id, TOO_LONG);
    }
  }
}

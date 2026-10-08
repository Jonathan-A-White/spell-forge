// src/grist/parent-ask-in-flight.ts — Any number of parent asks in flight at once, each answer applied to its own
// ask as it arrives. The same pass as GristInFlight (every 5 s, when the browser comes online, on load; a deadline
// of 180 s), over the parentAsks table instead of tutorTurns. Everything a pass needs is in the table, never in
// memory, so a reload loses nothing.

import type { PrivateKey } from '@bsv/sdk';
import type { ParentAsk, ParentAskAnswer } from '../contracts/types';
import { parentAskRepo } from '../data/repositories/parent-ask-repo';
import { readAnswer } from './read-answer';
import type { ReadAnswerParams, ReadAnswerResult } from './read-answer';
import { TUTOR_POLL_INTERVAL_MS } from './in-flight';
import { isParentAskAnswer } from './parent-ask';

/** How long the factory has to answer one ask. */
export const PARENT_ASK_DEADLINE_MS = 180_000;

const TOO_LONG = 'The tutor took too long to answer. You can ask again.';

export interface ParentAskInFlightDeps {
  /** The device's key; none (no wallet yet) means nothing can be read, and nothing is asked. */
  getKey: () => Promise<PrivateKey | undefined>;
  /** The seams below default to the real thing; tests replace them. */
  read?: (params: ReadAnswerParams<ParentAskAnswer>) => Promise<ReadAnswerResult<ParentAskAnswer>>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export class ParentAskInFlight {
  private running: Promise<void> | undefined;
  private readonly deps: ParentAskInFlightDeps;

  constructor(deps: ParentAskInFlightDeps) {
    this.deps = deps;
  }

  /** Passes on load, every 5 s (or `intervalMs`) and on `online`. Returns the function that stops all three. */
  start(intervalMs: number = TUTOR_POLL_INTERVAL_MS): () => void {
    const run = () => {
      void this.pass();
    };
    run();
    const timer = setInterval(run, intervalMs);
    window.addEventListener('online', run);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', run);
    };
  }

  /** One pass over every waiting ask. A pass already running is joined, not doubled. */
  pass(): Promise<void> {
    if (!this.running) {
      this.running = this.runPass().finally(() => {
        this.running = undefined;
      });
    }
    return this.running;
  }

  private async runPass(): Promise<void> {
    const waiting = (await parentAskRepo.listWaiting()).filter((ask) => ask.txid && ask.mill);
    if (waiting.length === 0) return;
    const key = await this.deps.getKey();
    if (!key) return;
    await Promise.all(waiting.map((ask) => this.settle(ask, key)));
  }

  private async settle(ask: ParentAsk, key: PrivateKey): Promise<void> {
    const read = this.deps.read ?? ((params) => readAnswer(params));
    const now = this.deps.now ?? (() => new Date());
    try {
      const result = await read({
        key,
        txid: ask.txid as string,
        mill: ask.mill as string,
        since: ask.seq ?? 0,
        isAnswer: isParentAskAnswer,
        fetchImpl: this.deps.fetchImpl,
      });
      if (!('pending' in result)) {
        const verdict =
          result.answer.status === 'answered'
            ? ({ status: 'answered', answer: result.answer.answer } as const)
            : ({ status: result.answer.status, reason: result.answer.reason } as const);
        await parentAskRepo.applyAnswer(ask.txid as string, verdict, now());
        return;
      }
    } catch {
      // the factory cannot be reached right now: the next pass, or the deadline, decides
    }
    if (now().getTime() - ask.askedAt.getTime() >= PARENT_ASK_DEADLINE_MS) {
      await parentAskRepo.markFailed(ask.id, TOO_LONG);
    }
  }
}

import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import type { ParentAsk, ParentAskRequest, ParentAskResult } from '../../contracts/types';

export interface AddParentAskParams {
  profileId: string;
  question: string;
  request: ParentAskRequest;
  askedAt?: Date;
}

/** An ask can take an answer only while it is still out. */
const isOut = (ask: ParentAsk) => ask.status === 'sending' || ask.status === 'waiting';

export const parentAskRepo = {
  /** A new ask, status 'sending': made before the grist goes, so a send that dies leaves a record. */
  async add(params: AddParentAskParams): Promise<ParentAsk> {
    const ask: ParentAsk = {
      id: uuidv4(),
      profileId: params.profileId,
      question: params.question,
      askedAt: params.askedAt ?? new Date(),
      request: params.request,
      status: 'sending',
    };
    await db.parentAsks.add(ask);
    return ask;
  },

  async get(id: string): Promise<ParentAsk | undefined> {
    return db.parentAsks.get(id);
  },

  /** Every ask the profile has made, newest first. Nothing is ever deleted. */
  async listForProfile(profileId: string): Promise<ParentAsk[]> {
    const asks = await db.parentAsks.where('profileId').equals(profileId).toArray();
    return asks.sort((a, b) => b.askedAt.getTime() - a.askedAt.getTime());
  },

  /** Every ask, for any profile, that the factory has and has not yet answered. */
  async listWaiting(): Promise<ParentAsk[]> {
    return db.parentAsks.where('status').equals('waiting').toArray();
  },

  /** The factory has the ask: remember where, and wait for the answer. */
  async markSent(id: string, sent: { txid: string; seq: number; mill: string }): Promise<void> {
    await db.parentAsks.update(id, { txid: sent.txid, seq: sent.seq, mill: sent.mill, status: 'waiting' });
  },

  /** Ends an ask that is still out and will get no answer (could not be sent, or the deadline passed). */
  async markFailed(id: string, reason: string): Promise<void> {
    await db.transaction('rw', db.parentAsks, async () => {
      const ask = await db.parentAsks.get(id);
      if (!ask || !isOut(ask)) return;
      await db.parentAsks.update(id, { status: 'failed', failureReason: reason });
    });
  },

  /**
   * Applies the mill's verdict to the ask whose txid it answers. An unknown txid, or an ask already settled,
   * changes nothing and never throws. Returns the ask as it now stands.
   */
  async applyAnswer(txid: string, result: ParentAskResult, at: Date = new Date()): Promise<ParentAsk | undefined> {
    return db.transaction('rw', db.parentAsks, async () => {
      const ask = await db.parentAsks.where('txid').equals(txid).first();
      if (!ask || !isOut(ask)) return ask;
      const next: ParentAsk =
        result.status === 'answered'
          ? { ...ask, status: 'answered', answer: result.answer, answeredAt: at }
          : { ...ask, status: result.status, failureReason: result.reason, answeredAt: at };
      await db.parentAsks.put(next);
      return next;
    });
  },
};

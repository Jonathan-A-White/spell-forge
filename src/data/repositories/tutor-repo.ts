import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import type {
  TutorAttachmentKind,
  TutorBlob,
  TutorMode,
  TutorRequest,
  TutorSession,
  TutorStrictness,
  TutorTurn,
  TutorTurnResult,
} from '../../contracts/types';

export interface CreateSessionParams {
  profileId: string;
  strictness: TutorStrictness;
  problemKind?: 'word' | 'plain';
  targetText?: string;
}

export interface AddTurnParams {
  sessionId: string;
  mode: TutorMode;
  request: TutorRequest;
  attachments?: { kind: TutorAttachmentKind; blobId: string }[];
  sentAt?: Date;
}

/** A turn can take an answer only while it is still out. */
const isOut = (turn: TutorTurn) => turn.status === 'sending' || turn.status === 'waiting';

export const tutorRepo = {
  async createSession(params: CreateSessionParams): Promise<TutorSession> {
    const session: TutorSession = {
      id: uuidv4(),
      profileId: params.profileId,
      startedAt: new Date(),
      strictness: params.strictness,
      status: 'active',
      ...(params.problemKind ? { problemKind: params.problemKind } : {}),
      ...(params.targetText ? { targetText: params.targetText } : {}),
    };
    await db.tutorSessions.add(session);
    return session;
  },

  async getSession(id: string): Promise<TutorSession | undefined> {
    return db.tutorSessions.get(id);
  },

  async endSession(id: string, at: Date = new Date()): Promise<void> {
    await db.tutorSessions.update(id, { status: 'ended', endedAt: at });
  },

  async putBlob(params: { bytes: ArrayBuffer; mime: string; name?: string }): Promise<TutorBlob> {
    const blob: TutorBlob = {
      id: uuidv4(),
      bytes: params.bytes,
      mime: params.mime,
      createdAt: new Date(),
      ...(params.name ? { name: params.name } : {}),
    };
    await db.tutorBlobs.add(blob);
    return blob;
  },

  async getBlob(id: string): Promise<TutorBlob | undefined> {
    return db.tutorBlobs.get(id);
  },

  /** Adds the next turn of a session, status 'sending'; its index follows the highest one so far. */
  async addTurn(params: AddTurnParams): Promise<TutorTurn> {
    return db.transaction('rw', db.tutorTurns, async () => {
      const last = await db.tutorTurns.where('sessionId').equals(params.sessionId).toArray();
      const turn: TutorTurn = {
        id: uuidv4(),
        sessionId: params.sessionId,
        index: last.reduce((max, t) => Math.max(max, t.index), 0) + 1,
        mode: params.mode,
        sentAt: params.sentAt ?? new Date(),
        request: params.request,
        attachments: params.attachments ?? [],
        status: 'sending',
      };
      await db.tutorTurns.add(turn);
      return turn;
    });
  },

  async getTurn(id: string): Promise<TutorTurn | undefined> {
    return db.tutorTurns.get(id);
  },

  /** A session's turns, in the order they were added. */
  async listTurns(sessionId: string): Promise<TutorTurn[]> {
    const turns = await db.tutorTurns.where('sessionId').equals(sessionId).toArray();
    return turns.sort((a, b) => a.index - b.index);
  },

  /** Every turn, in any session, that the factory has and has not yet answered. */
  async listWaiting(): Promise<TutorTurn[]> {
    return db.tutorTurns.where('status').equals('waiting').toArray();
  },

  /** The factory has the turn: remember where, and wait for the answer. */
  async markSent(id: string, sent: { txid: string; seq: number; mill: string }): Promise<void> {
    await db.tutorTurns.update(id, { txid: sent.txid, seq: sent.seq, mill: sent.mill, status: 'waiting' });
  },

  /** Ends a turn that is still out and will get no answer (could not be sent, or the deadline passed). */
  async markFailed(id: string, reason: string): Promise<void> {
    await db.transaction('rw', db.tutorTurns, async () => {
      const turn = await db.tutorTurns.get(id);
      if (!turn || !isOut(turn)) return;
      await db.tutorTurns.update(id, { status: 'failed', failureReason: reason });
    });
  },

  /** The child has gone past turns up to `throughIndex`: their answers, if any come, are kept but marked stale. */
  async moveOn(sessionId: string, throughIndex: number): Promise<void> {
    await db.transaction('rw', db.tutorTurns, async () => {
      const turns = await db.tutorTurns.where('sessionId').equals(sessionId).toArray();
      for (const turn of turns) {
        if (turn.index <= throughIndex && isOut(turn)) await db.tutorTurns.update(turn.id, { movedOn: true });
      }
    });
  },

  /**
   * Applies the mill's verdict to the turn whose txid it answers. An answer for a turn the child moved past, or
   * in a session that has ended, is kept with status 'stale'. An unknown txid, or a turn already settled, changes
   * nothing and never throws. Returns the turn as it now stands.
   */
  async applyAnswer(txid: string, result: TutorTurnResult, at: Date = new Date()): Promise<TutorTurn | undefined> {
    return db.transaction('rw', db.tutorTurns, db.tutorSessions, async () => {
      const turn = await db.tutorTurns.where('txid').equals(txid).first();
      if (!turn || !isOut(turn)) return turn;

      let next: TutorTurn;
      if (result.status === 'answered') {
        const session = await db.tutorSessions.get(turn.sessionId);
        const passed = turn.movedOn === true || session?.status === 'ended';
        next = { ...turn, status: passed ? 'stale' : 'answered', answer: result.answer, answeredAt: at };
      } else {
        next = { ...turn, status: result.status, failureReason: result.reason, answeredAt: at };
      }
      await db.tutorTurns.put(next);
      return next;
    });
  },
};

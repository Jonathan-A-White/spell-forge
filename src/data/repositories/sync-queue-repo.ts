// src/data/repositories/sync-queue-repo.ts: the outbox. Feedback written while offline waits here for the banner
// (src/features/feedback) to send it.
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import type { SyncQueueItem } from '../../contracts/types';

export interface FeedbackDraft {
  text: string;
  deviceInfo: { userAgent: string; screenWidth: number; screenHeight: number; platform: string };
  appVersion: string;
}

export const syncQueueRepo = {
  /** Queues one piece of feedback; `synced` is true when the mailto: link already sent it. */
  async addFeedback(draft: FeedbackDraft, synced: boolean): Promise<SyncQueueItem> {
    const now = new Date();
    const item: SyncQueueItem = {
      id: uuidv4(),
      type: 'feedback',
      payload: { ...draft, createdAt: now },
      createdAt: now,
      synced,
    };
    await db.syncQueue.add(item);
    return item;
  },
};

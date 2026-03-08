// src/features/feedback/use-offline-feedback-sync.ts — Detect pending offline feedback on reconnect

import { useState, useEffect, useCallback } from 'react';
import { db } from '../../data/db';
import type { SyncQueueItem } from '../../contracts/types';
import { buildMailtoUrl } from './mailto';

interface PendingFeedback {
  items: SyncQueueItem[];
}

export async function queryUnsyncedFeedback(): Promise<SyncQueueItem[]> {
  const all = await db.syncQueue.toArray();
  return all.filter((item) => item.type === 'feedback' && !item.synced);
}

export function useOfflineFeedbackSync() {
  const [pending, setPending] = useState<PendingFeedback | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const unsynced = await queryUnsyncedFeedback();
      if (!cancelled) {
        setPending(unsynced.length > 0 ? { items: unsynced } : null);
      }
    };

    const handleOnline = () => {
      refresh();
    };

    // Check on mount via the same async callback used by the event listener
    handleOnline();

    window.addEventListener('online', handleOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const sendPending = useCallback(async () => {
    if (!pending || pending.items.length === 0) return;

    // Combine all pending feedback texts into one email
    const bodies = pending.items.map((item) => {
      const payload = item.payload as { text: string };
      return payload.text;
    });
    const combined = bodies.join('\n\n---\n\n');

    window.location.href = buildMailtoUrl(combined);

    // Mark all as synced
    const ids = pending.items.map((item) => item.id);
    await db.syncQueue
      .where('id')
      .anyOf(ids)
      .modify({ synced: true });

    setPending(null);
  }, [pending]);

  const dismiss = useCallback(async () => {
    if (!pending) return;
    // Mark as synced so they don't keep showing up
    const ids = pending.items.map((item) => item.id);
    await db.syncQueue
      .where('id')
      .anyOf(ids)
      .modify({ synced: true });
    setPending(null);
  }, [pending]);

  return { pending, sendPending, dismiss };
}

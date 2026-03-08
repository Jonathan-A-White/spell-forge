import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../src/data/db';
import type { SyncQueueItem } from '../../src/contracts/types';

// ─── Helpers ───────────────────────────────────────────────────

function makeFeedbackItem(overrides: Partial<SyncQueueItem> = {}): SyncQueueItem {
  return {
    id: crypto.randomUUID(),
    type: 'feedback',
    payload: {
      text: 'Great app!',
      deviceInfo: {
        userAgent: 'test-agent',
        screenWidth: 375,
        screenHeight: 812,
        platform: 'test',
      },
      appVersion: '0.1.0',
      createdAt: new Date('2026-03-01'),
    },
    createdAt: new Date('2026-03-01'),
    synced: false,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe('Offline feedback sync queue', () => {
  beforeEach(async () => {
    await db.syncQueue.clear();
  });

  it('stores unsynced feedback when offline', async () => {
    const item = makeFeedbackItem({ synced: false });
    await db.syncQueue.add(item);

    const stored = await db.syncQueue.get(item.id);
    expect(stored).toBeDefined();
    expect(stored!.type).toBe('feedback');
    // Dexie/fake-indexeddb stores booleans as 0/1 in indexed fields
    expect(!stored!.synced).toBe(true);
    expect((stored!.payload as { text: string }).text).toBe('Great app!');
  });

  it('marks feedback as synced', async () => {
    const item = makeFeedbackItem({ synced: false });
    await db.syncQueue.add(item);

    await db.syncQueue.where('id').equals(item.id).modify({ synced: true });

    const updated = await db.syncQueue.get(item.id);
    expect(updated?.synced).toBe(true);
  });

  it('stores synced feedback when online', async () => {
    const item = makeFeedbackItem({ synced: true });
    await db.syncQueue.add(item);

    const allFeedback = await db.syncQueue.toArray();
    const pending = allFeedback.filter((f) => f.type === 'feedback' && !f.synced);

    expect(pending).toHaveLength(0);
  });

  it('handles multiple unsynced feedback items', async () => {
    const item1 = makeFeedbackItem({ synced: false });
    const item2 = makeFeedbackItem({
      synced: false,
      payload: {
        text: 'Bug report',
        deviceInfo: { userAgent: 'test', screenWidth: 375, screenHeight: 812, platform: 'test' },
        appVersion: '0.1.0',
        createdAt: new Date('2026-03-02'),
      },
    });
    const item3 = makeFeedbackItem({ synced: true });
    await db.syncQueue.add(item1);
    await db.syncQueue.add(item2);
    await db.syncQueue.add(item3);

    const allFeedback = await db.syncQueue.toArray();
    expect(allFeedback).toHaveLength(3);

    // Verify synced states
    const stored1 = await db.syncQueue.get(item1.id);
    const stored2 = await db.syncQueue.get(item2.id);
    const stored3 = await db.syncQueue.get(item3.id);
    expect(!stored1!.synced).toBe(true);
    expect(!stored2!.synced).toBe(true);
    expect(!!stored3!.synced).toBe(true);
  });

  it('batch marks multiple items as synced', async () => {
    const item1 = makeFeedbackItem({ synced: false });
    const item2 = makeFeedbackItem({ synced: false });
    await db.syncQueue.add(item1);
    await db.syncQueue.add(item2);

    await db.syncQueue
      .where('id')
      .anyOf([item1.id, item2.id])
      .modify({ synced: true });

    const allFeedback = await db.syncQueue.toArray();
    const pending = allFeedback.filter((f) => f.type === 'feedback' && !f.synced);

    expect(pending).toHaveLength(0);
  });
});

describe('queryUnsyncedFeedback', () => {
  beforeEach(async () => {
    await db.syncQueue.clear();
  });

  it('returns only unsynced feedback items', async () => {
    const { queryUnsyncedFeedback } = await import('../../src/features/feedback/use-offline-feedback-sync');

    await db.syncQueue.add(makeFeedbackItem({ synced: false }));
    await db.syncQueue.add(makeFeedbackItem({ synced: true }));
    await db.syncQueue.add(makeFeedbackItem({ synced: false }));

    const pending = await queryUnsyncedFeedback();
    expect(pending).toHaveLength(2);
    expect(pending.every((item) => item.type === 'feedback')).toBe(true);
  });

  it('returns empty array when all feedback is synced', async () => {
    const { queryUnsyncedFeedback } = await import('../../src/features/feedback/use-offline-feedback-sync');

    await db.syncQueue.add(makeFeedbackItem({ synced: true }));

    const pending = await queryUnsyncedFeedback();
    expect(pending).toHaveLength(0);
  });

  it('returns empty array when no feedback exists', async () => {
    const { queryUnsyncedFeedback } = await import('../../src/features/feedback/use-offline-feedback-sync');

    const pending = await queryUnsyncedFeedback();
    expect(pending).toHaveLength(0);
  });
});

describe('buildMailtoUrl', () => {
  it('builds a mailto URL with feedback text and device info', async () => {
    // Dynamically import to ensure jsdom environment
    const { buildMailtoUrl } = await import('../../src/features/feedback/mailto');
    const url = buildMailtoUrl('Test feedback');

    expect(url).toContain('mailto:jonathan.jawhite@gmail.com');
    expect(url).toContain('subject=SpellForge%20Feedback');
    expect(url).toContain('Test%20feedback');
  });

  it('combines multiple feedback messages', async () => {
    const { buildMailtoUrl } = await import('../../src/features/feedback/mailto');
    const combined = ['First message', 'Second message'].join('\n\n---\n\n');
    const url = buildMailtoUrl(combined);

    expect(url).toContain('First%20message');
    expect(url).toContain('Second%20message');
  });
});

describe('Online event listener integration', () => {
  it('window online event fires correctly', () => {
    const handler = vi.fn();
    window.addEventListener('online', handler);
    window.dispatchEvent(new Event('online'));
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('online', handler);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/data/db';
import { sessionRepo } from '../../src/data/repositories/session-repo';
import type { SessionLog } from '../../src/contracts/types';

// ─── Helpers ───────────────────────────────────────────────────

function makeSession(overrides: Partial<Omit<SessionLog, 'id'>> = {}): Omit<SessionLog, 'id'> {
  return {
    profileId: 'profile-1',
    startedAt: new Date('2026-03-15T10:00:00'),
    endedAt: new Date('2026-03-15T10:10:00'),
    wordsAttempted: 5,
    wordsCorrect: 4,
    engagementScore: 0.8,
    endReason: 'completed',
    rewardEarned: null,
    ...overrides,
  };
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ─── Tests ────────────────────────────────────────────────────

describe('Practice Calendar — session grouping', () => {
  beforeEach(async () => {
    await db.sessionLogs.clear();
  });

  it('groups sessions by date correctly', async () => {
    // Create sessions on different dates
    await sessionRepo.create(makeSession({ startedAt: new Date('2026-03-10T09:00:00') }));
    await sessionRepo.create(makeSession({ startedAt: new Date('2026-03-10T14:00:00') }));
    await sessionRepo.create(makeSession({ startedAt: new Date('2026-03-12T10:00:00') }));

    const sessions = await sessionRepo.getByProfileId('profile-1');
    expect(sessions).toHaveLength(3);

    // Group by date key (same logic as the component)
    const map = new Map<string, SessionLog[]>();
    for (const session of sessions) {
      const key = toDateKey(session.startedAt);
      const existing = map.get(key);
      if (existing) {
        existing.push(session);
      } else {
        map.set(key, [session]);
      }
    }

    expect(map.get('2026-03-10')).toHaveLength(2);
    expect(map.get('2026-03-12')).toHaveLength(1);
    expect(map.has('2026-03-11')).toBe(false);
  });

  it('computes month stats from grouped sessions', async () => {
    await sessionRepo.create(makeSession({
      startedAt: new Date('2026-03-01T10:00:00'),
      wordsAttempted: 10,
      wordsCorrect: 8,
    }));
    await sessionRepo.create(makeSession({
      startedAt: new Date('2026-03-01T14:00:00'),
      wordsAttempted: 5,
      wordsCorrect: 5,
    }));
    await sessionRepo.create(makeSession({
      startedAt: new Date('2026-03-05T10:00:00'),
      wordsAttempted: 8,
      wordsCorrect: 6,
    }));

    const sessions = await sessionRepo.getByProfileId('profile-1');

    // Compute stats (same logic as the component)
    const map = new Map<string, SessionLog[]>();
    for (const session of sessions) {
      const key = toDateKey(session.startedAt);
      const existing = map.get(key);
      if (existing) {
        existing.push(session);
      } else {
        map.set(key, [session]);
      }
    }

    let practiceDays = 0;
    let totalSessions = 0;
    let totalWords = 0;
    let totalCorrect = 0;

    for (const daySessions of map.values()) {
      practiceDays++;
      totalSessions += daySessions.length;
      for (const s of daySessions) {
        totalWords += s.wordsAttempted;
        totalCorrect += s.wordsCorrect;
      }
    }

    expect(practiceDays).toBe(2);
    expect(totalSessions).toBe(3);
    expect(totalWords).toBe(23);
    expect(totalCorrect).toBe(19);
    expect(Math.round((totalCorrect / totalWords) * 100)).toBe(83);
  });

  it('returns empty for profile with no sessions', async () => {
    const sessions = await sessionRepo.getByProfileId('profile-nonexistent');
    expect(sessions).toHaveLength(0);
  });

  it('toDateKey formats dates correctly', () => {
    expect(toDateKey(new Date('2026-01-05'))).toBe('2026-01-05');
    expect(toDateKey(new Date('2026-12-25'))).toBe('2026-12-25');
    expect(toDateKey(new Date('2026-03-01'))).toBe('2026-03-01');
  });
});

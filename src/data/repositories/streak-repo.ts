import { db } from '../db';
import type { StreakData, DayProgress } from '../../contracts/types';

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildWeekProgress(monday: Date, completedDates: Set<string>, sessionCountByDate: Map<string, number>): DayProgress[] {
  const week: DayProgress[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const iso = toISODate(d);
    week.push({
      date: iso,
      completed: completedDates.has(iso),
      sessionCount: sessionCountByDate.get(iso) ?? 0,
    });
  }
  return week;
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86400000;
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.floor((utcB - utcA) / msPerDay);
}

export const streakRepo = {
  async get(profileId: string): Promise<StreakData | null> {
    const streak = await db.streaks.get(profileId);
    return streak ?? null;
  },

  async initialize(profileId: string): Promise<StreakData> {
    const existing = await db.streaks.get(profileId);
    if (existing) return existing;
    const streak: StreakData = {
      profileId,
      currentStreak: 0,
      longestStreak: 0,
      lastSessionDate: null,
      weeklyProgress: buildWeekProgress(getMondayOfWeek(new Date()), new Set(), new Map()),
    };
    await db.streaks.add(streak);
    return streak;
  },

  async recordSession(profileId: string, sessionDate: Date, wordsAttempted: number): Promise<StreakData> {
    let streak = await db.streaks.get(profileId);
    if (!streak) {
      streak = await this.initialize(profileId);
    }

    // A qualifying session requires at least 2 words attempted
    const qualifying = wordsAttempted >= 2;
    if (!qualifying) return streak;

    const today = toISODate(sessionDate);

    if (streak.lastSessionDate) {
      const lastDate = new Date(streak.lastSessionDate);
      const gap = daysBetween(lastDate, sessionDate);

      if (gap <= 0) {
        // Same day — no streak change, just update weekly
      } else if (gap === 1) {
        // Consecutive day
        streak.currentStreak += 1;
      } else if (gap === 2) {
        // Missed 1 day — "at risk" but streak preserved, increment for today
        streak.currentStreak += 1;
      } else {
        // Missed 2+ consecutive days — reset
        streak.currentStreak = 1;
      }
    } else {
      // First ever session
      streak.currentStreak = 1;
    }

    if (streak.currentStreak > streak.longestStreak) {
      streak.longestStreak = streak.currentStreak;
    }

    streak.lastSessionDate = sessionDate;

    // Rebuild weekly progress
    const monday = getMondayOfWeek(sessionDate);
    const sessions = await db.sessionLogs.where('profileId').equals(profileId).toArray();
    const completedDates = new Set<string>();
    const sessionCountByDate = new Map<string, number>();

    for (const s of sessions) {
      if (s.endedAt && s.wordsAttempted >= 2) {
        const d = toISODate(s.startedAt);
        completedDates.add(d);
        sessionCountByDate.set(d, (sessionCountByDate.get(d) ?? 0) + 1);
      }
    }
    // Also count the current session being recorded
    completedDates.add(today);
    sessionCountByDate.set(today, (sessionCountByDate.get(today) ?? 0) + 1);

    streak.weeklyProgress = buildWeekProgress(monday, completedDates, sessionCountByDate);

    await db.streaks.put(streak);
    return streak;
  },

  async delete(profileId: string): Promise<void> {
    await db.streaks.delete(profileId);
  },
};

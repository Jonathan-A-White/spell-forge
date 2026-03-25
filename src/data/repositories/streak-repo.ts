import { db } from '../db';
import type { StreakData, DayProgress } from '../../contracts/types';

function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

/** Count weekdays (Mon–Fri) strictly between two dates, exclusive of both endpoints. */
function weekdaysMissedBetween(a: Date, b: Date): number {
  let count = 0;
  // Use local-time consistently to avoid UTC/local mismatch across timezones
  const current = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  current.setDate(current.getDate() + 1);
  const endISO = toISODate(b);
  while (toISODate(current) < endISO) {
    const day = current.getDay(); // 0=Sun, 6=Sat (local)
    if (day !== 0 && day !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export const streakRepo = {
  async get(profileId: string, now: Date = new Date()): Promise<StreakData | null> {
    const streak = await db.streaks.get(profileId);
    if (!streak) return null;

    // Validate stored streak against current date — if weekdays have been
    // missed since the last session, the streak is broken.
    if (streak.currentStreak > 0 && streak.lastSessionDate) {
      const lastDate = new Date(streak.lastSessionDate);
      const gap = daysBetween(lastDate, now);
      if (gap > 0 && weekdaysMissedBetween(lastDate, now) > 0) {
        streak.currentStreak = 0;
        await db.streaks.put(streak);
      }
    }

    return streak;
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
      } else if (weekdaysMissedBetween(lastDate, sessionDate) === 0) {
        // No weekdays missed — weekends don't break streaks
        streak.currentStreak += 1;
      } else {
        // Missed at least one weekday — reset
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

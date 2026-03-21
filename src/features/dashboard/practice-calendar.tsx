// src/features/dashboard/practice-calendar.tsx — Calendar view showing practice history

import { useState, useEffect, useMemo } from 'react';
import type { SessionLog, StreakData } from '../../contracts/types';
import { sessionRepo } from '../../data/repositories/session-repo';

interface PracticeCalendarProps {
  profileId: string;
  streakData: StreakData | null;
  onBack: () => void;
}

export function PracticeCalendar({ profileId, streakData, onBack }: PracticeCalendarProps) {
  const [sessions, setSessions] = useState<SessionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDate, setViewDate] = useState(() => new Date());

  useEffect(() => {
    sessionRepo.getByProfileId(profileId).then((logs) => {
      setSessions(logs);
      setLoading(false);
    });
  }, [profileId]);

  const currentStreak = streakData?.currentStreak ?? 0;
  const longestStreak = streakData?.longestStreak ?? 0;

  // Group sessions by date key (YYYY-MM-DD)
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, SessionLog[]>();
    for (const session of sessions) {
      const date = session.startedAt instanceof Date ? session.startedAt : new Date(session.startedAt);
      if (isNaN(date.getTime())) continue;
      const key = toDateKey(date);
      const existing = map.get(key);
      if (existing) {
        existing.push(session);
      } else {
        map.set(key, [session]);
      }
    }
    return map;
  }, [sessions]);

  // Calendar grid computation
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay(); // 0=Sun
  const daysInMonth = lastDay.getDate();

  const today = new Date();
  const todayKey = toDateKey(today);
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  // Stats for the viewed month
  const monthStats = useMemo(() => {
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    const dim = new Date(y, m + 1, 0).getDate();

    let practiceDays = 0;
    let totalSessions = 0;
    let totalWords = 0;
    let totalCorrect = 0;

    for (let d = 1; d <= dim; d++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const daySessions = sessionsByDate.get(key);
      if (daySessions && daySessions.length > 0) {
        practiceDays++;
        totalSessions += daySessions.length;
        for (const s of daySessions) {
          totalWords += s.wordsAttempted;
          totalCorrect += s.wordsCorrect;
        }
      }
    }

    return { practiceDays, totalSessions, totalWords, totalCorrect };
  }, [sessionsByDate, viewDate]);

  // Determine the earliest month that has any session data
  const earliestSessionMonth = useMemo(() => {
    let earliest: Date | null = null;
    for (const session of sessions) {
      const date = session.startedAt instanceof Date ? session.startedAt : new Date(session.startedAt);
      if (isNaN(date.getTime())) continue;
      if (!earliest || date < earliest) earliest = date;
    }
    return earliest;
  }, [sessions]);

  const canGoPrev = (() => {
    if (!earliestSessionMonth) return false;
    const earliestYear = earliestSessionMonth.getFullYear();
    const earliestMonth = earliestSessionMonth.getMonth();
    // Can go back if viewing a month after the earliest data month
    return year > earliestYear || (year === earliestYear && month > earliestMonth);
  })();

  const prevMonth = () => {
    if (canGoPrev) setViewDate(new Date(year, month - 1, 1));
  };
  const nextMonth = () => {
    if (!isCurrentMonth) setViewDate(new Date(year, month + 1, 1));
  };

  const monthLabel = firstDay.toLocaleString('default', { month: 'long', year: 'numeric' });
  const canGoNext = !isCurrentMonth;

  return (
    <div className="min-h-screen bg-sf-bg">
      {/* Header */}
      <div className="bg-gradient-to-br from-sf-surface via-sf-surface to-sf-surface-hover px-4 pt-3 pb-4">
        <div className="max-w-lg md:max-w-4xl lg:max-w-6xl mx-auto">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sf-muted hover:text-sf-secondary text-sm transition-colors mb-3"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span>Back</span>
          </button>

          {/* Streak display */}
          <div className="text-center mb-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-orange-500/20 mb-2">
              <span className="text-4xl">🔥</span>
            </div>
            <h1 className="text-3xl font-bold text-orange-400">{currentStreak}</h1>
            <p className="text-sf-muted text-sm">day streak</p>
          </div>

          {/* Streak stats */}
          <div className="flex justify-center gap-6 text-sm">
            <div className="text-center">
              <p className="font-bold text-orange-400">{longestStreak}</p>
              <p className="text-sf-muted text-xs">Longest streak</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-cyan-400">{monthStats.practiceDays}</p>
              <p className="text-sf-muted text-xs">Days this month</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-green-400">{monthStats.totalSessions}</p>
              <p className="text-sf-muted text-xs">Sessions</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg md:max-w-4xl lg:max-w-6xl mx-auto px-4 pb-6">
        {/* Month navigation */}
        <div className="flex items-center justify-between mt-4 mb-3">
          <button
            onClick={prevMonth}
            disabled={!canGoPrev}
            className={`p-2 rounded-lg transition-all ${
              canGoPrev
                ? 'text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover'
                : 'text-sf-muted/30 cursor-not-allowed'
            }`}
            aria-label="Previous month"
            title={!canGoPrev ? 'No practice data before this month' : undefined}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <h2 className="font-bold text-sf-heading text-sm">{monthLabel}</h2>
          <button
            onClick={nextMonth}
            disabled={!canGoNext}
            className={`p-2 rounded-lg transition-all ${
              canGoNext
                ? 'text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover'
                : 'text-sf-muted/30 cursor-not-allowed'
            }`}
            aria-label="Next month"
            title={!canGoNext ? 'Already viewing the current month' : undefined}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>

        {/* Calendar grid */}
        <div className="rounded-xl bg-sf-surface border border-sf-border p-3">
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="text-center text-sf-muted text-xs font-medium py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Date cells */}
          {loading ? (
            <p className="text-sf-muted text-sm text-center py-8">Loading...</p>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells for offset */}
              {Array.from({ length: startDow }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}
              {/* Day cells */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const daySessions = sessionsByDate.get(key);
                const practiced = daySessions && daySessions.length > 0;
                const isToday = key === todayKey;
                const isFuture = new Date(year, month, day) > today;
                const sessionCount = daySessions?.length ?? 0;

                return (
                  <div
                    key={day}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs relative transition-colors ${
                      isFuture
                        ? 'text-sf-muted/30'
                        : practiced
                          ? 'bg-orange-500/20 text-orange-400 font-bold'
                          : 'text-sf-muted'
                    } ${isToday ? 'ring-2 ring-sf-primary ring-offset-1 ring-offset-sf-surface' : ''}`}
                  >
                    <span>{day}</span>
                    {practiced && !isFuture && (
                      <div className="flex gap-0.5 mt-0.5">
                        {Array.from({ length: Math.min(sessionCount, 3) }).map((_, j) => (
                          <div key={j} className="w-1 h-1 rounded-full bg-orange-400" />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Month summary */}
        {!loading && monthStats.totalWords > 0 && (
          <div className="mt-3 rounded-xl bg-sf-surface border border-sf-border p-4">
            <h3 className="font-bold text-sf-heading text-sm mb-3">Month Summary</h3>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Practice days" value={String(monthStats.practiceDays)} color="text-orange-400" />
              <StatCard label="Total sessions" value={String(monthStats.totalSessions)} color="text-cyan-400" />
              <StatCard label="Words attempted" value={String(monthStats.totalWords)} color="text-purple-400" />
              <StatCard
                label="Accuracy"
                value={monthStats.totalWords > 0 ? `${Math.round((monthStats.totalCorrect / monthStats.totalWords) * 100)}%` : '—'}
                color="text-green-400"
              />
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-3 rounded-xl bg-sf-surface border border-sf-border p-4">
          <h3 className="font-bold text-sf-heading text-sm mb-2">Legend</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <div className="w-1 h-1 rounded-full bg-orange-400" />
              </div>
              <span className="text-sf-muted text-xs">Practiced that day (dots = number of sessions)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg ring-2 ring-sf-primary ring-offset-1 ring-offset-sf-surface" />
              <span className="text-sf-muted text-xs">Today</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg bg-sf-surface-hover/50 p-2.5 text-center">
      <p className={`font-bold text-lg ${color}`}>{value}</p>
      <p className="text-sf-muted text-xs">{label}</p>
    </div>
  );
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

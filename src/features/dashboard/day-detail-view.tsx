// src/features/dashboard/day-detail-view.tsx — Detail view for a single day's activity

import { useState, useEffect, useMemo } from 'react';
import type { SessionLog, Word } from '../../contracts/types';
import { db } from '../../data/db';

interface DayDetailViewProps {
  profileId: string;
  dateKey: string; // "YYYY-MM-DD"
  sessions: SessionLog[];
  onBack: () => void;
}

interface WordAttempt {
  wordId: string;
  wordText: string;
  correct: boolean;
  responseTimeMs: number;
  techniqueId: string;
  struggled: boolean;
  scaffoldingUsed: boolean;
  userInput?: string;
  timestamp: Date;
}

export function DayDetailView({ profileId, dateKey, sessions, onBack }: DayDetailViewProps) {
  const [wordAttempts, setWordAttempts] = useState<WordAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  const displayDate = useMemo(() => {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, [dateKey]);

  // Load word attempts for this day from techniqueHistory
  useEffect(() => {
    async function load() {
      const [allStats, allWords] = await Promise.all([
        db.wordStats.where('profileId').equals(profileId).toArray(),
        db.words.where('profileId').equals(profileId).toArray(),
      ]);

      const wordMap = new Map<string, Word>();
      for (const w of allWords) wordMap.set(w.id, w);

      const [y, m, d] = dateKey.split('-').map(Number);
      const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
      const dayEnd = new Date(y, m - 1, d, 23, 59, 59, 999);

      const attempts: WordAttempt[] = [];
      for (const stat of allStats) {
        for (const t of stat.techniqueHistory) {
          const ts = t.timestamp instanceof Date ? t.timestamp : new Date(t.timestamp);
          if (ts >= dayStart && ts <= dayEnd) {
            const word = wordMap.get(stat.wordId);
            attempts.push({
              wordId: stat.wordId,
              wordText: word?.text ?? '(unknown)',
              correct: t.correct,
              responseTimeMs: t.responseTimeMs,
              techniqueId: t.techniqueId,
              struggled: t.struggled,
              scaffoldingUsed: t.scaffoldingUsed,
              userInput: t.userInput,
              timestamp: ts,
            });
          }
        }
      }

      attempts.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      setWordAttempts(attempts);
      setLoading(false);
    }
    load();
  }, [profileId, dateKey]);

  // Day-level stats
  const totalWords = sessions.reduce((sum, s) => sum + s.wordsAttempted, 0);
  const totalCorrect = sessions.reduce((sum, s) => sum + s.wordsCorrect, 0);
  const accuracy = totalWords > 0 ? Math.round((totalCorrect / totalWords) * 100) : 0;
  const avgEngagement = sessions.length > 0
    ? Math.round((sessions.reduce((sum, s) => sum + s.engagementScore, 0) / sessions.length) * 100)
    : 0;

  // Group attempts by word for the "words practiced" summary
  const wordSummary = useMemo(() => {
    const map = new Map<string, { text: string; correct: number; wrong: number }>();
    for (const a of wordAttempts) {
      const existing = map.get(a.wordId);
      if (existing) {
        if (a.correct) existing.correct++;
        else existing.wrong++;
      } else {
        map.set(a.wordId, {
          text: a.wordText,
          correct: a.correct ? 1 : 0,
          wrong: a.correct ? 0 : 1,
        });
      }
    }
    // Sort: most wrong first, then alphabetical
    return [...map.values()].sort((a, b) => b.wrong - a.wrong || a.text.localeCompare(b.text));
  }, [wordAttempts]);

  const wordsNailedIt = wordSummary.filter((w) => w.wrong === 0 && w.correct > 0);
  const wordsStruggled = wordSummary.filter((w) => w.wrong > 0);

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
            <span>Calendar</span>
          </button>
          <h1 className="text-xl font-bold text-sf-heading">{displayDate}</h1>
        </div>
      </div>

      <div className="max-w-lg md:max-w-4xl lg:max-w-6xl mx-auto px-4 pb-6">
        {/* Day Stats */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <StatCard label="Sessions" value={String(sessions.length)} color="text-cyan-400" />
          <StatCard label="Accuracy" value={totalWords > 0 ? `${accuracy}%` : '\u2014'} color="text-green-400" />
          <StatCard label="Words attempted" value={String(totalWords)} color="text-purple-400" />
          <StatCard label="Engagement" value={`${avgEngagement}%`} color="text-orange-400" />
        </div>

        {/* Session Breakdown */}
        <div className="mt-3 rounded-xl bg-sf-surface border border-sf-border p-4">
          <h3 className="font-bold text-sf-heading text-sm mb-3">Sessions</h3>
          {sessions.length === 0 ? (
            <p className="text-sf-muted text-sm">No sessions this day</p>
          ) : (
            <ul className="space-y-3">
              {sessions
                .slice()
                .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
                .map((session, i) => {
                  const start = new Date(session.startedAt);
                  const end = session.endedAt ? new Date(session.endedAt) : null;
                  const durationMin = end
                    ? Math.round((end.getTime() - start.getTime()) / 60000)
                    : null;
                  const sessionAcc = session.wordsAttempted > 0
                    ? Math.round((session.wordsCorrect / session.wordsAttempted) * 100)
                    : 0;

                  return (
                    <li key={session.id} className="rounded-lg bg-sf-surface-hover/50 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-sf-heading">
                          Session {i + 1}
                        </span>
                        <span className="text-xs text-sf-muted">
                          {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          {durationMin !== null && ` \u00B7 ${durationMin}min`}
                        </span>
                      </div>
                      <div className="flex gap-4 text-xs text-sf-muted">
                        <span>
                          <span className="text-green-400 font-medium">{session.wordsCorrect}</span>
                          {' / '}
                          <span>{session.wordsAttempted}</span>
                          {' correct'}
                        </span>
                        <span className={sessionAcc >= 80 ? 'text-green-400' : sessionAcc >= 50 ? 'text-yellow-400' : 'text-red-400'}>
                          {sessionAcc}%
                        </span>
                        <EndReasonBadge reason={session.endReason} />
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>

        {loading ? (
          <p className="text-sf-muted text-sm text-center py-8">Loading word details...</p>
        ) : (
          <>
            {/* Words that went well */}
            {wordsNailedIt.length > 0 && (
              <div className="mt-3 rounded-xl bg-sf-surface border border-sf-border p-4">
                <h3 className="font-bold text-sf-heading text-sm mb-3 flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-green-500" stroke="currentColor" strokeWidth={2.5}>
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Nailed It ({wordsNailedIt.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {wordsNailedIt.map((w) => (
                    <span
                      key={w.text}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-500/15 text-green-400 text-sm font-medium"
                    >
                      {w.text}
                      {w.correct > 1 && (
                        <span className="text-xs text-green-400/70">{w.correct}x</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Words that need work */}
            {wordsStruggled.length > 0 && (
              <div className="mt-3 rounded-xl bg-sf-surface border border-sf-border p-4">
                <h3 className="font-bold text-sf-heading text-sm mb-3 flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-orange-400" stroke="currentColor" strokeWidth={2.5}>
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  Needs Practice ({wordsStruggled.length})
                </h3>
                <ul className="space-y-2">
                  {wordsStruggled.map((w) => (
                    <li key={w.text} className="flex items-center justify-between">
                      <span className="text-sm text-sf-text font-medium">{w.text}</span>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-green-400">{w.correct} right</span>
                        <span className="text-red-400">{w.wrong} wrong</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Full attempt timeline */}
            {wordAttempts.length > 0 && (
              <div className="mt-3 rounded-xl bg-sf-surface border border-sf-border p-4">
                <h3 className="font-bold text-sf-heading text-sm mb-3">Attempt Timeline</h3>
                <ul className="divide-y divide-sf-border">
                  {wordAttempts.map((a, i) => (
                    <li key={i} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {a.correct ? (
                            <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-green-500" stroke="currentColor" strokeWidth={2.5}>
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-red-500" stroke="currentColor" strokeWidth={2.5}>
                              <path d="M18 6L6 18" />
                              <path d="M6 6l12 12" />
                            </svg>
                          )}
                          <span className="text-sm text-sf-text font-medium">{a.wordText}</span>
                          {a.scaffoldingUsed && (
                            <span className="text-xs bg-sf-track text-sf-muted px-1.5 py-0.5 rounded">
                              Scaffolded
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-sf-muted">
                          {(a.responseTimeMs / 1000).toFixed(1)}s
                        </span>
                      </div>
                      {!a.correct && a.userInput && (
                        <p className="text-xs text-red-400 mt-0.5 ml-5.5">
                          Typed: &ldquo;{a.userInput}&rdquo;
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5 ml-5.5">
                        <span className="text-xs text-sf-faint">
                          {a.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                        <span className="text-xs text-sf-faint">
                          {formatTechniqueId(a.techniqueId)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {wordAttempts.length === 0 && (
              <div className="mt-3 rounded-xl bg-sf-surface border border-sf-border p-4">
                <p className="text-sf-muted text-sm text-center">No detailed word data available for this day</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg bg-sf-surface border border-sf-border p-2.5 text-center">
      <p className={`font-bold text-lg ${color}`}>{value}</p>
      <p className="text-sf-muted text-xs">{label}</p>
    </div>
  );
}

function EndReasonBadge({ reason }: { reason: SessionLog['endReason'] }) {
  const labels: Record<SessionLog['endReason'], { text: string; className: string }> = {
    'completed': { text: 'Completed', className: 'text-green-400' },
    'adaptive-stop': { text: 'Adaptive stop', className: 'text-yellow-400' },
    'user-quit': { text: 'Quit early', className: 'text-sf-muted' },
    'parent-stop': { text: 'Parent stopped', className: 'text-sf-muted' },
  };
  const badge = labels[reason];
  return <span className={`text-xs ${badge.className}`}>{badge.text}</span>;
}

function formatTechniqueId(id: string): string {
  return id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

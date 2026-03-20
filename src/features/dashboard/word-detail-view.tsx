// src/features/dashboard/word-detail-view.tsx — Detailed view for a single word's progress

import { useState, useEffect } from 'react';
import type { Word, WordStats, WordBucket } from '../../contracts/types';
import { db } from '../../data/db';

const MASTERED_MIN_DAYS = 3;
const FAMILIAR_CONSECUTIVE = 3;
const MASTERED_CONSECUTIVE = 5;

interface WordDetailViewProps {
  wordId: string;
  profileId: string;
  onBack: () => void;
  onPlayAudio?: (word: string) => void;
}

function formatTechniqueId(techniqueId: string): string {
  return techniqueId
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatResponseTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function getDifficultyLabel(score: number): string {
  if (score < 0.3) return 'Easy';
  if (score <= 0.7) return 'Medium';
  return 'Hard';
}

function getBucketBadge(bucket: WordBucket): { label: string; className: string } {
  switch (bucket) {
    case 'new':
      return { label: 'New', className: 'bg-gray-500 text-white' };
    case 'learning':
      return { label: 'Learning', className: 'bg-orange-500 text-white' };
    case 'familiar':
      return { label: 'Familiar', className: 'bg-yellow-500 text-black' };
    case 'mastered':
      return { label: 'Mastered', className: 'bg-green-500 text-white' };
    case 'review':
      return { label: 'Mastered', className: 'bg-green-500 text-white' };
  }
}

export function WordDetailView({ wordId, profileId, onBack, onPlayAudio }: WordDetailViewProps) {
  const [word, setWord] = useState<Word | null>(null);
  const [stats, setStats] = useState<WordStats | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    async function load() {
      const [loadedWord, loadedStats] = await Promise.all([
        db.words.get(wordId),
        db.wordStats.where({ wordId, profileId }).first(),
      ]);
      setWord(loadedWord ?? null);
      setStats(loadedStats ?? null);
    }
    load();
  }, [wordId, profileId]);

  if (!word) {
    return (
      <div className="min-h-screen bg-sf-bg p-4 flex items-center justify-center">
        <p className="text-sf-muted">Loading...</p>
      </div>
    );
  }

  const bucket: WordBucket = stats?.currentBucket ?? 'new';
  const badge = getBucketBadge(bucket);

  // Distinct correct days
  const distinctDays = new Set(
    (stats?.techniqueHistory ?? [])
      .filter((t) => t.correct)
      .map((t) => new Date(t.timestamp).toDateString()),
  ).size;

  // Accuracy
  const accuracy =
    stats && stats.timesAsked > 0
      ? `${(((stats.timesAsked - stats.timesWrong) / stats.timesAsked) * 100).toFixed(0)}%`
      : '\u2014';

  // Average response time
  const avgTime =
    stats && stats.techniqueHistory.length > 0
      ? formatResponseTime(
          stats.techniqueHistory.reduce((sum, t) => sum + t.responseTimeMs, 0) /
            stats.techniqueHistory.length,
        )
      : '\u2014';

  // Difficulty label
  const difficulty = stats ? getDifficultyLabel(stats.difficultyScore) : '\u2014';

  // Days until next review
  const daysUntilReview =
    stats?.nextReviewDate
      ? Math.max(
          0,
          Math.ceil(
            (new Date(stats.nextReviewDate).getTime() - now) / (1000 * 60 * 60 * 24),
          ),
        )
      : null;

  // History entries sorted most recent first
  const history = [...(stats?.techniqueHistory ?? [])].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return (
    <div className="min-h-screen bg-sf-bg px-4 py-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover transition-all"
          aria-label="Go back to Progress"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm text-sf-muted">Progress</span>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-3xl font-bold text-sf-heading">{word.text}</h1>
        {onPlayAudio && (
          <button
            onClick={() => onPlayAudio(word.text)}
            className="p-2 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover transition-all"
            aria-label={`Play audio for ${word.text}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M15.54 8.46a5 5 0 010 7.07" />
              <path d="M19.07 4.93a10 10 0 010 14.14" />
            </svg>
          </button>
        )}
      </div>

      {/* Current Status Badge */}
      <div className="mb-6">
        <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {/* Next Level Progress */}
      <div className="bg-sf-surface rounded-xl p-4 shadow-sm border border-sf-border mb-4">
        <h3 className="font-bold text-sf-heading mb-3">Next Level</h3>
        {bucket === 'new' && (
          <p className="text-sf-muted text-sm">
            Start practicing this word to begin tracking progress
          </p>
        )}
        {bucket === 'learning' && (
          <ProgressBar
            label="Consecutive correct"
            current={stats?.consecutiveCorrect ?? 0}
            target={FAMILIAR_CONSECUTIVE}
          />
        )}
        {bucket === 'familiar' && (
          <div className="space-y-3">
            <ProgressBar
              label="Consecutive correct"
              current={stats?.consecutiveCorrect ?? 0}
              target={MASTERED_CONSECUTIVE}
            />
            <ProgressBar
              label="Correct on distinct days"
              current={distinctDays}
              target={MASTERED_MIN_DAYS}
            />
          </div>
        )}
        {(bucket === 'mastered' || bucket === 'review') && (
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-green-500" stroke="currentColor" strokeWidth={2}>
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span className="text-sf-text text-sm">
              Mastered! Next review in {daysUntilReview ?? 0} day{daysUntilReview !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard label="Accuracy" value={accuracy} />
        <StatCard label="Attempts" value={stats ? String(stats.timesAsked) : '0'} />
        <StatCard label="Avg Time" value={avgTime} />
        <StatCard label="Difficulty" value={difficulty} />
      </div>

      {/* Attempt Timeline */}
      <div className="bg-sf-surface rounded-xl p-4 shadow-sm border border-sf-border mb-4">
        <h3 className="font-bold text-sf-heading mb-3">History</h3>
        {history.length === 0 ? (
          <p className="text-sf-muted text-sm">No attempts yet</p>
        ) : (
          <ul className="divide-y divide-sf-border">
            {history.map((entry, i) => (
              <li key={i} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {entry.correct ? (
                      <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-green-500" stroke="currentColor" strokeWidth={2.5}>
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-red-500" stroke="currentColor" strokeWidth={2.5}>
                        <path d="M18 6L6 18" />
                        <path d="M6 6l12 12" />
                      </svg>
                    )}
                    <span className="text-sm text-sf-text">
                      {formatTechniqueId(entry.techniqueId)}
                    </span>
                    {entry.scaffoldingUsed && (
                      <span className="text-xs bg-sf-track text-sf-muted px-1.5 py-0.5 rounded">
                        Scaffolded
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-sf-muted">
                    {formatResponseTime(entry.responseTimeMs)}
                  </span>
                </div>
                <p className="text-xs text-sf-faint mt-1 ml-6">
                  {formatDate(entry.timestamp)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ProgressBar({ label, current, target }: { label: string; current: number; target: number }) {
  const pct = Math.min(100, (current / target) * 100);

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm text-sf-muted">{label}</span>
        <span className="text-sm text-sf-text">
          {current} / {target}
        </span>
      </div>
      <div className="w-full bg-sf-track rounded-full h-2.5">
        <div
          className="bg-green-500 h-2.5 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-sf-surface rounded-xl p-4 shadow-sm border border-sf-border">
      <p className="text-xs text-sf-muted mb-1">{label}</p>
      <p className="text-lg font-bold text-sf-heading">{value}</p>
    </div>
  );
}

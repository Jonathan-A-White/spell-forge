// src/features/dashboard/progress-view.tsx — Progress dashboard

import type { StreakData, WordStats, WordList, Word } from '../../contracts/types';
import { ReadinessIndicator } from './readiness-indicator';

interface ProgressViewProps {
  streakData: StreakData | null;
  allWords: Word[];
  allStats: WordStats[];
  activeList: WordList | null;
  daysUntilTest: number | null;
  onStartPractice: () => void;
  onAddWords: () => void;
  onBack: () => void;
}

export function ProgressView({
  streakData,
  allWords,
  allStats,
  activeList,
  daysUntilTest,
  onStartPractice,
  onAddWords,
  onBack,
}: ProgressViewProps) {
  const statsMap = new Map(allStats.map((s) => [s.wordId, s]));

  // Lifetime health
  const mastered = allStats.filter((s) => s.currentBucket === 'mastered' || s.currentBucket === 'review').length;
  const familiar = allStats.filter((s) => s.currentBucket === 'familiar').length;
  const learning = allStats.filter((s) => s.currentBucket === 'learning').length;
  const newWords = allWords.length - mastered - familiar - learning;

  // Active list readiness
  const activeListWords = activeList
    ? allWords.filter((w) => w.listId === activeList.id)
    : [];
  const activeListReady = activeListWords.filter((w) => {
    const s = statsMap.get(w.id);
    return s && (s.currentBucket === 'mastered' || s.currentBucket === 'familiar');
  }).length;
  const readinessPercent = activeListWords.length > 0
    ? Math.round((activeListReady / activeListWords.length) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-sf-bg p-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-lg text-sf-muted hover:text-sf-secondary hover:bg-sf-surface-hover transition-all"
          aria-label="Go back"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-sf-heading">Progress</h1>
      </div>

      {/* Streak */}
      {streakData && (
        <div className="bg-sf-surface rounded-xl p-4 shadow-sm border border-sf-border mb-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-2xl font-bold text-sf-secondary">{streakData.currentStreak}</p>
              <p className="text-sm text-sf-muted">Day Streak</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-sf-faint">Best: {streakData.longestStreak}</p>
            </div>
          </div>
          {/* Weekly dots */}
          <div className="flex gap-2 mt-3 justify-center">
            {streakData.weeklyProgress.map((day) => (
              <div
                key={day.date}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                  day.completed
                    ? 'bg-green-500 text-white'
                    : 'bg-sf-track text-sf-faint'
                }`}
                title={day.date}
              >
                {new Date(day.date + 'T00:00:00').toLocaleDateString('en', { weekday: 'narrow' })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Test Readiness */}
      {activeList && (
        <ReadinessIndicator
          percentage={readinessPercent}
          listName={activeList.name}
          daysUntilTest={daysUntilTest}
          wordsTotal={activeListWords.length}
          wordsReady={activeListReady}
        />
      )}

      {/* Lifetime Health */}
      <div className="bg-sf-surface rounded-xl p-4 shadow-sm border border-sf-border mb-4">
        <h3 className="font-bold text-sf-heading mb-3">Lifetime Word Health</h3>
        <p className="text-sf-text mb-3">
          {mastered} of {allWords.length} words mastered
        </p>
        <div className="space-y-2">
          <HealthBar label="Mastered" count={mastered} total={allWords.length} color="bg-green-500" />
          <HealthBar label="Familiar" count={familiar} total={allWords.length} color="bg-yellow-500" />
          <HealthBar label="Learning" count={learning} total={allWords.length} color="bg-orange-500" />
          <HealthBar label="New" count={newWords} total={allWords.length} color="bg-sf-track" />
        </div>
      </div>

      {/* Empty state — guide user to add words first */}
      {allWords.length === 0 && (
        <div className="bg-sf-surface rounded-xl p-6 shadow-sm border-2 border-dashed border-sf-border-strong mb-4 text-center">
          <p className="text-sf-secondary font-medium text-lg mb-2">No spelling words yet!</p>
          <p className="text-sf-muted text-sm mb-4">
            Add your spelling words to start practicing.
          </p>
          <button
            onClick={onAddWords}
            className="w-full bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-4 px-8 rounded-xl text-lg transition-colors shadow-md"
          >
            Add Spelling Words
          </button>
        </div>
      )}

      {/* Action buttons — show Start Practice when words exist */}
      {allWords.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={onStartPractice}
            className="w-full bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-4 px-8 rounded-xl text-lg transition-colors shadow-md"
          >
            Start Practice
          </button>
          <button
            onClick={onAddWords}
            className="w-full bg-sf-surface border-2 border-sf-border-strong hover:bg-sf-surface-hover text-sf-secondary font-medium py-3 rounded-xl transition-colors"
          >
            Add More Words
          </button>
        </div>
      )}
    </div>
  );
}

function HealthBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-sf-text w-20">{label}</span>
      <div className="flex-1 bg-sf-track rounded-full h-3">
        <div className={`${color} h-3 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm text-sf-muted w-8 text-right">{count}</span>
    </div>
  );
}

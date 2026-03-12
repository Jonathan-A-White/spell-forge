// src/features/dashboard/progress-view.tsx — Progress dashboard

import { useState } from 'react';
import type { StreakData, WordStats, WordList, Word, WordLearningProgress } from '../../contracts/types';
import { getWordsDueCount } from '../../core/spaced-rep';
import { ReadinessIndicator } from './readiness-indicator';
import { rewardTracker, monsterCollection } from '../rewards';
import { themeEngine } from '../../themes';

type HealthCategory = 'mastered' | 'familiar' | 'learning' | 'new';

interface ProgressViewProps {
  profileId: string;
  themeId: string;
  streakData: StreakData | null;
  allWords: Word[];
  allStats: WordStats[];
  learningProgress: WordLearningProgress[];
  activeLists: WordList[];
  daysUntilTest: number | null;
  onStartPractice: () => void;
  onAddWords: () => void;
  onBack: () => void;
}

/**
 * Compute a unified health category for each word, combining
 * spaced-rep bucket status with learning-stage progress.
 *
 * Priority: spaced-rep bucket wins if the word has been practiced.
 * If a word is still "new" in spaced-rep but has learning progress,
 * its learning stage determines the category.
 */
function getWordCategory(
  wordId: string,
  statsMap: Map<string, WordStats>,
  learningMap: Map<string, WordLearningProgress>,
): HealthCategory {
  const stat = statsMap.get(wordId);
  const lp = learningMap.get(wordId);

  // If word has been through spaced-rep practice, use that bucket
  if (stat && stat.timesAsked > 0) {
    if (stat.currentBucket === 'mastered' || stat.currentBucket === 'review') return 'mastered';
    if (stat.currentBucket === 'familiar') return 'familiar';
    if (stat.currentBucket === 'learning') return 'learning';
  }

  // Fall back to learning-stage progress
  // Completing learning mode means the word is 'familiar', not 'mastered'.
  // True mastery requires proven retention through spaced-rep practice.
  if (lp) {
    if (lp.mastered || lp.stage >= 2) return 'familiar';
    if (lp.stage >= 1 || lp.totalAttempts > 0) return 'learning';
  }

  return 'new';
}

export function ProgressView({
  profileId,
  themeId,
  streakData,
  allWords,
  allStats,
  learningProgress,
  activeLists,
  daysUntilTest,
  onStartPractice,
  onAddWords,
  onBack,
}: ProgressViewProps) {
  const [expandedCategory, setExpandedCategory] = useState<HealthCategory | null>(null);

  // Theme milestone & collection data (moved from home screen)
  const milestone = rewardTracker.getMilestoneStatus(profileId, themeId);
  const themeName = themeEngine.getTheme(themeId).name;
  const collectionCount = monsterCollection.getCollectionCount(profileId);
  const collection = monsterCollection.getCollection(profileId);

  const statsMap = new Map(allStats.map((s) => [s.wordId, s]));
  const learningMap = new Map(learningProgress.map((lp) => [lp.wordId, lp]));

  // Build category → word[] mapping
  const categoryWords: Record<HealthCategory, Word[]> = {
    mastered: [],
    familiar: [],
    learning: [],
    new: [],
  };

  for (const word of allWords) {
    const cat = getWordCategory(word.id, statsMap, learningMap);
    categoryWords[cat].push(word);
  }

  const mastered = categoryWords.mastered.length;
  const familiar = categoryWords.familiar.length;
  const learning = categoryWords.learning.length;
  const newWords = categoryWords.new.length;

  // Active lists readiness — aggregate words across all active lists
  const activeListIds = new Set(activeLists.map((l) => l.id));
  const activeListWords = activeListIds.size > 0
    ? allWords.filter((w) => activeListIds.has(w.listId))
    : [];
  const activeListReady = activeListWords.filter((w) => {
    const cat = getWordCategory(w.id, statsMap, learningMap);
    return cat === 'mastered' || cat === 'familiar';
  }).length;
  const readinessPercent = activeListWords.length > 0
    ? Math.round((activeListReady / activeListWords.length) * 100)
    : 0;
  const readinessLabel = activeLists.length === 1
    ? activeLists[0].name
    : `${activeLists.length} Active Lists`;

  const handleToggleCategory = (category: HealthCategory) => {
    setExpandedCategory((prev) => (prev === category ? null : category));
  };

  return (
    <div className="min-h-screen bg-sf-bg p-4 max-w-lg md:max-w-4xl lg:max-w-6xl mx-auto">
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

      {/* Stat Circles */}
      {allWords.length > 0 && (
        <div className="flex justify-center gap-6 mb-4">
          <StatCircle
            value={`${allWords.length > 0 ? Math.round((mastered / allWords.length) * 100) : 0}%`}
            label="Mastery"
            color="bg-purple-500"
          />
          <StatCircle
            value={String(newWords)}
            label="New Words"
            color="bg-green-500"
          />
          <StatCircle
            value={String(getWordsDueCount(allStats))}
            label="Words Due"
            color="bg-blue-500"
          />
        </div>
      )}

      {/* Theme Milestone */}
      {allWords.length > 0 && (
        <div className="bg-sf-surface rounded-xl p-4 shadow-sm border border-sf-border mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-sf-heading text-sm">{themeName}</h3>
            <span className="text-sm font-medium text-sf-heading">{milestone.current}</span>
          </div>
          {milestone.next && (
            <>
              <div className="w-full bg-sf-track rounded-full h-2">
                <div
                  className="bg-sf-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(5, Math.round(((themeEngine.UNITS_PER_MILESTONE - milestone.progressToNext) / themeEngine.UNITS_PER_MILESTONE) * 100))}%` }}
                />
              </div>
              <p className="text-xs text-sf-faint mt-1.5">
                {milestone.progressToNext} more to reach {milestone.next}
              </p>
            </>
          )}
          {collectionCount > 0 && (
            <div className="mt-3 pt-3 border-t border-sf-border/30">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-sf-muted">Monster Stable</span>
                <span className="font-medium text-sf-heading">{collectionCount} creature{collectionCount !== 1 ? 's' : ''}</span>
              </div>
              {collection.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {collection.slice(-5).map((creature) => (
                    <div
                      key={creature.id}
                      className="flex-shrink-0 bg-sf-surface-hover rounded-lg px-3 py-2 text-center min-w-[80px]"
                      title={`Completed ${new Date(creature.completedAt).toLocaleDateString()}`}
                    >
                      <div className="text-lg mb-0.5">&#129514;</div>
                      <p className="text-[10px] font-medium text-sf-heading truncate max-w-[70px]">{creature.name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Test Readiness */}
      {activeLists.length > 0 && (
        <ReadinessIndicator
          percentage={readinessPercent}
          listName={readinessLabel}
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
        <div className="space-y-1">
          <HealthBar
            label="Mastered"
            count={mastered}
            total={allWords.length}
            color="bg-green-500"
            expanded={expandedCategory === 'mastered'}
            onToggle={() => handleToggleCategory('mastered')}
          />
          {expandedCategory === 'mastered' && (
            <WordList words={categoryWords.mastered} color="text-green-500" />
          )}
          <HealthBar
            label="Familiar"
            count={familiar}
            total={allWords.length}
            color="bg-yellow-500"
            expanded={expandedCategory === 'familiar'}
            onToggle={() => handleToggleCategory('familiar')}
          />
          {expandedCategory === 'familiar' && (
            <WordList words={categoryWords.familiar} color="text-yellow-500" />
          )}
          <HealthBar
            label="Learning"
            count={learning}
            total={allWords.length}
            color="bg-orange-500"
            expanded={expandedCategory === 'learning'}
            onToggle={() => handleToggleCategory('learning')}
          />
          {expandedCategory === 'learning' && (
            <WordList words={categoryWords.learning} color="text-orange-500" />
          )}
          <HealthBar
            label="New"
            count={newWords}
            total={allWords.length}
            color="bg-sf-track"
            expanded={expandedCategory === 'new'}
            onToggle={() => handleToggleCategory('new')}
          />
          {expandedCategory === 'new' && (
            <WordList words={categoryWords.new} color="text-sf-muted" />
          )}
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

function HealthBar({
  label,
  count,
  total,
  color,
  expanded,
  onToggle,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const hasWords = count > 0;

  return (
    <button
      onClick={hasWords ? onToggle : undefined}
      className={`flex items-center gap-2 w-full py-1.5 rounded-lg transition-colors ${
        hasWords
          ? 'hover:bg-sf-surface-hover cursor-pointer'
          : 'cursor-default'
      }`}
      aria-expanded={hasWords ? expanded : undefined}
      aria-label={`${label}: ${count} word${count !== 1 ? 's' : ''}${hasWords ? '. Tap to see words.' : ''}`}
    >
      <span className="text-sm text-sf-text w-20">{label}</span>
      <div className="flex-1 bg-sf-track rounded-full h-3">
        <div className={`${color} h-3 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm text-sf-muted w-8 text-right">{count}</span>
      {hasWords && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={`w-4 h-4 text-sf-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      )}
      {!hasWords && <div className="w-4" />}
    </button>
  );
}

function StatCircle({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`w-20 h-20 rounded-full ${color} flex items-center justify-center shadow-lg`}>
        <span className="text-white text-xl font-bold">{value}</span>
      </div>
      <span className="text-sm text-sf-muted font-medium">{label}</span>
    </div>
  );
}

function WordList({ words, color }: { words: Word[]; color: string }) {
  if (words.length === 0) return null;

  return (
    <div className="ml-2 mb-2 pl-4 border-l-2 border-sf-border">
      <div className="flex flex-wrap gap-2 py-2">
        {words.map((w) => (
          <span
            key={w.id}
            className={`inline-block text-sm font-medium ${color} bg-sf-surface border border-sf-border rounded-lg px-3 py-1`}
          >
            {w.text}
          </span>
        ))}
      </div>
    </div>
  );
}

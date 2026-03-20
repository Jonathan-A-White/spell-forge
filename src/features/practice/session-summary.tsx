// src/features/practice/session-summary.tsx — End-of-session celebration screen

import type { SessionLog, RewardEvent } from '../../contracts/types';
import { PerformanceReport, type WordResult } from './performance-report';

interface SessionSummaryProps {
  session: SessionLog;
  reward: RewardEvent | null;
  streakCount: number;
  wordResults: WordResult[];
  totalWordsInList: number;
  onDone: () => void;
}

function getHeading(wordsAttempted: number, accuracy: number): string {
  if (wordsAttempted === 0) return 'Session Complete';
  if (accuracy >= 80) return 'Amazing Work!';
  if (accuracy >= 50) return 'Good Effort!';
  return 'Keep Practicing!';
}

function getEncouragement(
  wordsCorrect: number,
  wordsAttempted: number,
  totalWordsInList: number,
): string | null {
  const remaining = totalWordsInList - wordsCorrect;
  if (remaining <= 0) return 'You nailed every word! Nothing left to conquer!';
  if (wordsAttempted === 0) return null;
  return `${remaining} word${remaining === 1 ? '' : 's'} left to master — keep going!`;
}

export function SessionSummary({
  session,
  reward,
  streakCount,
  wordResults,
  totalWordsInList,
  onDone,
}: SessionSummaryProps) {
  const accuracy = session.wordsAttempted > 0
    ? Math.round((session.wordsCorrect / session.wordsAttempted) * 100)
    : 0;

  const heading = getHeading(session.wordsAttempted, accuracy);
  const encouragement = getEncouragement(
    session.wordsCorrect,
    session.wordsAttempted,
    totalWordsInList,
  );

  const correctCount = wordResults.filter((r) => r.result.correct).length;
  const incorrectCount = wordResults.filter((r) => !r.result.correct).length;

  return (
    <div className="min-h-screen bg-sf-bg flex flex-col items-center gap-6 p-6 max-w-md md:max-w-3xl lg:max-w-5xl mx-auto overflow-y-auto">
      <h2 className="text-3xl font-bold text-sf-heading">{heading}</h2>

      <div className="grid grid-cols-3 gap-3 w-full">
        <div className="bg-sf-surface rounded-xl p-4 shadow-sm border border-sf-border text-center">
          <p className="text-2xl font-bold text-sf-secondary">{session.wordsAttempted}</p>
          <p className="text-xs text-sf-muted">Reviewed</p>
        </div>
        <div className="bg-sf-surface rounded-xl p-4 shadow-sm border border-sf-border text-center">
          <p className="text-2xl font-bold text-green-500">{correctCount}</p>
          <p className="text-xs text-sf-muted">Correct</p>
        </div>
        <div className="bg-sf-surface rounded-xl p-4 shadow-sm border border-sf-border text-center">
          <p className="text-2xl font-bold text-red-500">{incorrectCount}</p>
          <p className="text-xs text-sf-muted">Incorrect</p>
        </div>
      </div>

      <p className="text-xl font-bold text-sf-heading">Accuracy: {accuracy}%</p>

      {reward && reward.unitsEarned > 0 && (
        <div className="bg-sf-surface-active rounded-xl p-4 w-full text-center">
          <p className="text-lg font-bold text-sf-heading">
            +{reward.unitsEarned} earned!
          </p>
          {reward.milestoneReached && (
            <p className="text-sf-text mt-1">
              Milestone reached: {reward.milestoneReached}!
            </p>
          )}
        </div>
      )}

      {streakCount > 0 && (
        <p className="text-lg text-sf-text">
          {streakCount}-day streak! Keep it going!
        </p>
      )}

      {encouragement && (
        <p className="text-sm text-sf-muted italic">{encouragement}</p>
      )}

      <PerformanceReport wordResults={wordResults} />

      <button
        onClick={onDone}
        className="w-full bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-4 px-8 rounded-xl text-lg transition-colors mt-2"
      >
        Done
      </button>
    </div>
  );
}

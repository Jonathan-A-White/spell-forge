// src/features/practice/session-summary.tsx — End-of-session celebration screen

import type { SessionLog, RewardEvent } from '../../contracts/types';

interface SessionSummaryProps {
  session: SessionLog;
  reward: RewardEvent | null;
  streakCount: number;
  onDone: () => void;
}

export function SessionSummary({ session, reward, streakCount, onDone }: SessionSummaryProps) {
  const accuracy = session.wordsAttempted > 0
    ? Math.round((session.wordsCorrect / session.wordsAttempted) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-sf-bg flex flex-col items-center gap-6 p-8 text-center max-w-md md:max-w-xl lg:max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-sf-heading">Amazing Work!</h2>

      <div className="grid grid-cols-2 gap-4 w-full">
        <div className="bg-sf-surface rounded-xl p-4 shadow-sm border border-sf-border">
          <p className="text-2xl font-bold text-sf-secondary">{session.wordsAttempted}</p>
          <p className="text-sm text-sf-muted">Words Practiced</p>
        </div>
        <div className="bg-sf-surface rounded-xl p-4 shadow-sm border border-sf-border">
          <p className="text-2xl font-bold text-green-700">{accuracy}%</p>
          <p className="text-sm text-sf-muted">Accuracy</p>
        </div>
      </div>

      {reward && reward.unitsEarned > 0 && (
        <div className="bg-sf-surface-active rounded-xl p-4 w-full">
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

      <button
        onClick={onDone}
        className="w-full bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-4 px-8 rounded-xl text-lg transition-colors"
      >
        Done
      </button>
    </div>
  );
}

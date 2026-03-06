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
    <div className="flex flex-col items-center gap-6 p-8 text-center max-w-md mx-auto">
      <h2 className="text-3xl font-bold text-amber-900">Amazing Work!</h2>

      <div className="grid grid-cols-2 gap-4 w-full">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-amber-200">
          <p className="text-2xl font-bold text-amber-800">{session.wordsAttempted}</p>
          <p className="text-sm text-amber-600">Words Practiced</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-amber-200">
          <p className="text-2xl font-bold text-green-700">{accuracy}%</p>
          <p className="text-sm text-amber-600">Accuracy</p>
        </div>
      </div>

      {reward && reward.unitsEarned > 0 && (
        <div className="bg-amber-100 rounded-xl p-4 w-full">
          <p className="text-lg font-bold text-amber-900">
            +{reward.unitsEarned} earned!
          </p>
          {reward.milestoneReached && (
            <p className="text-amber-700 mt-1">
              Milestone reached: {reward.milestoneReached}!
            </p>
          )}
        </div>
      )}

      {streakCount > 0 && (
        <p className="text-lg text-amber-700">
          {streakCount}-day streak! Keep it going!
        </p>
      )}

      <button
        onClick={onDone}
        className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-4 px-8 rounded-xl text-lg transition-colors"
      >
        Done
      </button>
    </div>
  );
}

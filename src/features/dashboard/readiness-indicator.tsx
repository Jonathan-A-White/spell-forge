// src/features/dashboard/readiness-indicator.tsx — Test readiness thermometer

import type { ReadinessLevel } from '../../contracts/types';

interface ReadinessIndicatorProps {
  percentage: number;
  listName: string;
  daysUntilTest: number | null;
  wordsTotal: number;
  wordsReady: number;
  gradeGoal?: number;
}

interface ReadinessInfo {
  level: ReadinessLevel;
  label: string;
  color: string;
  barColor: string;
  emoji: string;
}

function getReadinessLevel(pct: number): ReadinessInfo {
  if (pct >= 90)
    return { level: 'ready', label: 'Ready to crush it!', color: 'text-green-400', barColor: 'bg-green-500', emoji: '\u{1F525}' };
  if (pct >= 75)
    return { level: 'almost-there', label: 'Almost there!', color: 'text-yellow-400', barColor: 'bg-yellow-500', emoji: '\u{2600}\u{FE0F}' };
  if (pct >= 50)
    return { level: 'getting-warmer', label: 'Getting warmer!', color: 'text-orange-400', barColor: 'bg-orange-500', emoji: '\u{1F321}\u{FE0F}' };
  return { level: 'keep-forging', label: 'Keep forging!', color: 'text-blue-400', barColor: 'bg-blue-500', emoji: '\u{2744}\u{FE0F}' };
}

const milestones = [
  { pct: 25, emoji: '\u{2744}\u{FE0F}' },
  { pct: 50, emoji: '\u{1F321}\u{FE0F}' },
  { pct: 75, emoji: '\u{2600}\u{FE0F}' },
  { pct: 100, emoji: '\u{1F525}' },
];

export function ReadinessIndicator({
  percentage,
  listName,
  daysUntilTest,
  wordsTotal,
  wordsReady,
  gradeGoal,
}: ReadinessIndicatorProps) {
  const { label, color, barColor, emoji } = getReadinessLevel(percentage);

  return (
    <div className="bg-sf-surface rounded-xl p-4 shadow-sm border border-sf-border mb-4">
      <h3 className="font-bold text-sf-heading mb-1">{listName}</h3>
      {daysUntilTest !== null && (
        <p className="text-sm text-sf-muted mb-3">
          {daysUntilTest === 0
            ? 'Test is today!'
            : daysUntilTest === 1
              ? 'Test is tomorrow!'
              : `${daysUntilTest} days until test`}
        </p>
      )}

      {/* Thermometer bar */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl" role="img" aria-label="progress">{emoji}</span>
          <p className={`text-lg font-bold ${color}`}>{label}</p>
        </div>

        <div className="relative">
          {/* Track */}
          <div className="w-full h-4 bg-sf-track rounded-full overflow-hidden">
            <div
              className={`h-full ${barColor} rounded-full transition-all duration-500 ease-out`}
              style={{ width: `${Math.max(percentage, 2)}%` }}
            />
          </div>

          {/* Milestone markers */}
          <div className="flex justify-between mt-1 px-0.5">
            {milestones.map((m) => (
              <span
                key={m.pct}
                className={`text-xs transition-opacity ${percentage >= m.pct ? 'opacity-100' : 'opacity-30'}`}
                role="img"
                aria-label={`${m.pct}% milestone`}
              >
                {m.emoji}
              </span>
            ))}
          </div>
        </div>
      </div>

      {(() => {
        const effectiveGoal = gradeGoal ?? 100;
        const target = Math.ceil(wordsTotal * effectiveGoal / 100);
        return (
          <>
            <p className="text-center text-sm text-sf-muted">
              {wordsReady} of {target} words ready{effectiveGoal < 100 ? ` (${effectiveGoal}% goal)` : ''}
            </p>
            <p className="text-center text-xs text-sf-faint mt-0.5">
              Master each word through practice to fill the bar
            </p>
          </>
        );
      })()}
    </div>
  );
}

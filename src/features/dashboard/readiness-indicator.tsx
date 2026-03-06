// src/features/dashboard/readiness-indicator.tsx — Test readiness gauge

import type { ReadinessLevel } from '../../contracts/types';

interface ReadinessIndicatorProps {
  percentage: number;
  listName: string;
  daysUntilTest: number | null;
  wordsTotal: number;
  wordsReady: number;
}

function getReadinessLevel(pct: number): { level: ReadinessLevel; label: string; color: string } {
  if (pct >= 90) return { level: 'ready', label: 'Ready to crush it!', color: 'text-green-700' };
  if (pct >= 75) return { level: 'almost-there', label: 'Almost there!', color: 'text-blue-700' };
  if (pct >= 50) return { level: 'getting-warmer', label: 'Getting warmer!', color: 'text-yellow-700' };
  return { level: 'keep-forging', label: 'Keep forging!', color: 'text-orange-700' };
}

export function ReadinessIndicator({
  percentage,
  listName,
  daysUntilTest,
  wordsTotal,
  wordsReady,
}: ReadinessIndicatorProps) {
  const { label, color } = getReadinessLevel(percentage);
  const gaugeRotation = (percentage / 100) * 180 - 90; // -90 to 90 degrees

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-amber-200 mb-4">
      <h3 className="font-bold text-amber-900 mb-1">{listName}</h3>
      {daysUntilTest !== null && (
        <p className="text-sm text-amber-600 mb-3">
          {daysUntilTest === 0
            ? 'Test is today!'
            : daysUntilTest === 1
              ? 'Test is tomorrow!'
              : `${daysUntilTest} days until test`}
        </p>
      )}

      {/* Gauge visualization */}
      <div className="flex justify-center mb-3">
        <div className="relative w-32 h-16 overflow-hidden">
          <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full border-8 border-gray-200" />
          <div
            className="absolute bottom-0 left-0 w-32 h-32 rounded-full border-8 border-amber-500"
            style={{
              clipPath: `polygon(50% 50%, 50% 0%, ${50 + percentage * 0.5}% 0%)`,
            }}
          />
          <div
            className="absolute bottom-0 left-1/2 w-1 h-14 bg-amber-800 rounded-full origin-bottom"
            style={{ transform: `translateX(-50%) rotate(${gaugeRotation}deg)` }}
          />
        </div>
      </div>

      <p className={`text-center text-lg font-bold ${color}`}>{label}</p>
      <p className="text-center text-sm text-amber-600 mt-1">
        {wordsReady} of {wordsTotal} words ready
      </p>
    </div>
  );
}

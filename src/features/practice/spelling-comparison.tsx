// src/features/practice/spelling-comparison.tsx — Visual diff between attempt and correct spelling

import { computeLetterDiff } from './letter-diff';

interface SpellingComparisonProps {
  attempt: string;
  correct: string;
  fontSize: string;
}

export function SpellingComparison({ attempt, correct, fontSize }: SpellingComparisonProps) {
  const { attemptDiff, correctDiff } = computeLetterDiff(attempt, correct);
  const isCorrect = attempt.toLowerCase() === correct.toLowerCase();

  return (
    <div className="w-full space-y-4">
      {/* Result header */}
      <div className={`text-center font-bold text-lg ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
        {isCorrect ? 'Correct!' : 'Not quite right'}
      </div>

      {/* Your attempt */}
      <div className="space-y-1">
        <p className="text-sf-muted text-xs font-medium uppercase tracking-wide">Your attempt</p>
        <div
          className={`flex flex-wrap gap-1 p-3 rounded-xl border-2 ${
            isCorrect ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
          }`}
        >
          {attemptDiff.length === 0 ? (
            <span className="text-sf-muted italic" style={{ fontSize }}>
              (empty)
            </span>
          ) : (
            attemptDiff.map((d, i) => (
              <span
                key={i}
                className={`font-bold rounded px-1 ${
                  d.status === 'correct'
                    ? 'text-green-800'
                    : 'text-red-800 bg-red-200'
                }`}
                style={{ fontSize }}
              >
                {d.letter}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Correct spelling */}
      <div className="space-y-1">
        <p className="text-sf-muted text-xs font-medium uppercase tracking-wide">Correct spelling</p>
        <div className="flex flex-wrap gap-1 p-3 rounded-xl border-2 border-green-300 bg-green-50">
          {correctDiff.map((d, i) => (
            <span
              key={i}
              className={`font-bold rounded px-1 ${
                d.status === 'correct'
                  ? 'text-green-800'
                  : 'text-amber-800 bg-amber-200'
              }`}
              style={{ fontSize }}
            >
              {d.letter}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

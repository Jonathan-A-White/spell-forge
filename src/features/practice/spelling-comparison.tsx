// src/features/practice/spelling-comparison.tsx — Visual diff between attempt and correct spelling

import { computeLetterDiff } from './letter-diff';
import { getErrorTargetedHints } from './error-hints';
import type { DetectedPattern } from '../../contracts/types';

interface SpellingComparisonProps {
  attempt: string;
  correct: string;
  fontSize: string;
  patterns?: DetectedPattern[];
}

// Fallback hex colors for browsers that don't support oklch() (Tailwind CSS 4 default).
// Older tablets (pre-Chrome 111) silently ignore oklch-based Tailwind classes,
// so inline styles ensure error highlighting always renders.
const colors = {
  green700: '#15803d',
  red700: '#b91c1c',
  green800: '#166534',
  red800: '#991b1b',
  red200: '#fecaca',
  amber800: '#92400e',
  amber200: '#fde68a',
  green300: '#86efac',
  green50: '#f0fdf4',
  red300: '#fca5a5',
  red50: '#fef2f2',
  blue800: '#1e40af',
  blue700: '#1d4ed8',
  blue200: '#bfdbfe',
  blue50: '#eff6ff',
};

export function SpellingComparison({ attempt, correct, fontSize, patterns }: SpellingComparisonProps) {
  const { attemptDiff, correctDiff } = computeLetterDiff(attempt, correct);
  const isCorrect = attempt.toLowerCase() === correct.toLowerCase();
  const errorHints = isCorrect
    ? []
    : getErrorTargetedHints(attempt, correct, patterns ?? []);

  return (
    <div className="w-full space-y-4">
      {/* Result header */}
      <div
        className={`text-center font-bold text-lg ${isCorrect ? 'text-green-700' : 'text-red-700'}`}
        style={{ color: isCorrect ? colors.green700 : colors.red700 }}
      >
        {isCorrect ? 'Correct!' : 'Not quite right'}
      </div>

      {/* Your attempt */}
      <div className="space-y-1">
        <p className="text-sf-muted text-xs font-medium uppercase tracking-wide">Your attempt</p>
        <div
          className={`flex flex-wrap gap-1 p-3 rounded-xl border-2 ${
            isCorrect ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
          }`}
          style={{
            borderColor: isCorrect ? colors.green300 : colors.red300,
            backgroundColor: isCorrect ? colors.green50 : colors.red50,
          }}
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
                style={{
                  fontSize,
                  color: d.status === 'correct' ? colors.green800 : colors.red800,
                  backgroundColor: d.status === 'correct' ? undefined : colors.red200,
                }}
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
        <div
          className="flex flex-wrap gap-1 p-3 rounded-xl border-2 border-green-300 bg-green-50"
          style={{ borderColor: colors.green300, backgroundColor: colors.green50 }}
        >
          {correctDiff.map((d, i) => (
            <span
              key={i}
              className={`font-bold rounded px-1 ${
                d.status === 'correct'
                  ? 'text-green-800'
                  : 'text-amber-800 bg-amber-200'
              }`}
              style={{
                fontSize,
                color: d.status === 'correct' ? colors.green800 : colors.amber800,
                backgroundColor: d.status === 'correct' ? undefined : colors.amber200,
              }}
            >
              {d.letter}
            </span>
          ))}
        </div>
      </div>

      {/* Phonics hints for the patterns the error touched */}
      {errorHints.length > 0 && (
        <div
          className="rounded-xl border-2 border-blue-200 bg-blue-50 p-3 space-y-1"
          style={{ borderColor: colors.blue200, backgroundColor: colors.blue50 }}
        >
          {errorHints.map((h) => (
            <p
              key={h.grapheme}
              className="text-blue-700 text-sm"
              style={{ color: colors.blue700 }}
            >
              {'\u{1F4A1} '}
              <span
                className="font-bold text-blue-800"
                style={{ color: colors.blue800 }}
              >
                {h.grapheme}
              </span>
              {': '}
              {h.hint}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

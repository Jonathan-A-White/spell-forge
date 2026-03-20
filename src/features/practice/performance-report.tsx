// src/features/practice/performance-report.tsx — Word-by-word session results

import type { Word, TechniqueResult } from '../../contracts/types';

export interface WordResult {
  word: Word;
  result: TechniqueResult;
}

interface PerformanceReportProps {
  wordResults: WordResult[];
}

export function PerformanceReport({ wordResults }: PerformanceReportProps) {
  if (wordResults.length === 0) return null;

  return (
    <div className="w-full space-y-2">
      <h3 className="text-lg font-bold text-sf-heading text-center">Reviewed Words:</h3>
      <ul className="space-y-2">
        {wordResults.map(({ word, result }) => (
          <li
            key={`${word.id}-${result.timestamp.getTime()}`}
            className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
              result.correct
                ? 'border-green-600/40 bg-green-900/20'
                : 'border-red-600/40 bg-red-900/20'
            }`}
          >
            <span className="text-sf-heading font-semibold text-base">{word.text}</span>
            <span
              className={`text-xl ${result.correct ? 'text-green-500' : 'text-red-500'}`}
              aria-label={result.correct ? 'Correct' : 'Incorrect'}
            >
              {result.correct ? '\u2713' : '\u2717'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

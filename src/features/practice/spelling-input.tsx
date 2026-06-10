// src/features/practice/spelling-input.tsx — Full word text input for practice mode

import { useState, useCallback, useEffect } from 'react';
import { SpellingComparison } from './spelling-comparison';
import { SpellingField } from './custom-keyboard';
import { hapticSuccess, hapticError } from '../../core/haptics';
import type { DetectedPattern } from '../../contracts/types';

interface SpellingInputProps {
  word: string;
  onComplete: (correct: boolean, responseTimeMs: number, mistakes: number, userInput?: string) => void;
  scaffolding?: { chunks: string[]; hints: string[] } | null;
  patterns?: DetectedPattern[];
  tapTargetSize: number;
}

type Phase = 'input' | 'comparison' | 'retype';

const REQUIRED_RETYPES = 2;

export function SpellingInput({ word, onComplete, scaffolding, patterns, tapTargetSize }: SpellingInputProps) {
  const [phase, setPhase] = useState<Phase>('input');
  const [attempt, setAttempt] = useState('');
  const [retypeCount, setRetypeCount] = useState(0);
  const [retypeValue, setRetypeValue] = useState('');
  const [wordVisible, setWordVisible] = useState(true);
  const [startTime] = useState(() => Date.now());

  const targetWord = word.toLowerCase();
  const fontSize = `${Math.max(18, tapTargetSize * 0.5)}px`;

  // Hide the reference word after 5 seconds in the retype phase
  // wordVisible is set to true by handleStartRetype and handleRetypeSubmit
  useEffect(() => {
    if (phase === 'retype' && wordVisible) {
      const timer = setTimeout(() => setWordVisible(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [phase, wordVisible]);

  const handleSubmit = useCallback(() => {
    const trimmed = attempt.trim().toLowerCase();
    if (trimmed.length === 0) return;

    if (trimmed === targetWord) {
      // Correct on first try — move on immediately
      hapticSuccess();
      const responseTimeMs = Date.now() - startTime;
      onComplete(true, responseTimeMs, 0);
    } else {
      // Wrong — show comparison, then require retypes
      hapticError();
      setAttempt(trimmed); // preserve the user's attempt for recording
      setPhase('comparison');
    }
  }, [attempt, targetWord, startTime, onComplete]);

  const handleRetypeSubmit = useCallback(() => {
    const trimmed = retypeValue.trim().toLowerCase();
    if (trimmed !== targetWord) {
      // Wrong retype — clear and let them try again
      hapticError();
      setRetypeValue('');
      return;
    }

    const newCount = retypeCount + 1;
    if (newCount >= REQUIRED_RETYPES) {
      // Done retyping — move on (counted as incorrect since initial attempt was wrong)
      hapticSuccess();
      const responseTimeMs = Date.now() - startTime;
      onComplete(false, responseTimeMs, 1, attempt);
    } else {
      hapticSuccess();
      setRetypeCount(newCount);
      setRetypeValue('');
      setWordVisible(true);
    }
  }, [retypeValue, targetWord, retypeCount, startTime, onComplete, attempt]);

  const handleStartRetype = useCallback(() => {
    setPhase('retype');
    setRetypeCount(0);
    setRetypeValue('');
    setWordVisible(true);
  }, []);

  // Phase 1: Initial text input
  if (phase === 'input') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-md">
        {scaffolding && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center w-full">
            {scaffolding.chunks.length > 0 && (
              <div className="flex justify-center gap-2 mb-2">
                {scaffolding.chunks.map((chunk, i) => (
                  <span
                    key={i}
                    className="bg-blue-100 px-3 py-1 rounded-md font-bold text-blue-800"
                    style={{ fontSize }}
                  >
                    {chunk}
                  </span>
                ))}
              </div>
            )}
            {scaffolding.hints.map((hint, i) => (
              <p key={i} className="text-blue-700 text-sm mt-1">
                {hint}
              </p>
            ))}
          </div>
        )}

        <SpellingField
          value={attempt}
          onChange={setAttempt}
          onSubmit={handleSubmit}
          placeholder="Type the word..."
          tapTargetSize={tapTargetSize}
          fontSize={fontSize}
          submitLabel="Check"
          ariaLabel="Type the spelling word"
        />
      </div>
    );
  }

  // Phase 2: Show comparison
  if (phase === 'comparison') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-md">
        <SpellingComparison
          attempt={attempt.trim().toLowerCase()}
          correct={targetWord}
          fontSize={fontSize}
          patterns={patterns}
        />

        <button
          onClick={handleStartRetype}
          className="w-full bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors"
          style={{ minHeight: `${tapTargetSize}px`, fontSize }}
        >
          Now type it correctly
        </button>
      </div>
    );
  }

  // Phase 3: Corrective retype
  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-md">
      <div className="text-center">
        <p className="text-sf-muted text-sm mb-1">
          Type it correctly ({retypeCount + 1} of {REQUIRED_RETYPES})
        </p>
        {wordVisible ? (
          <p className="text-sf-heading font-bold text-2xl" style={{ fontSize }}>
            {word.toLowerCase()}
          </p>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sf-muted text-sm italic">
              Word hidden — type from memory!
            </p>
            <button
              onClick={() => setWordVisible(true)}
              className="text-sf-primary hover:text-sf-primary-hover text-sm font-medium underline transition-colors"
              type="button"
            >
              Show word again
            </button>
          </div>
        )}
      </div>

      <SpellingField
        value={retypeValue}
        onChange={setRetypeValue}
        onSubmit={handleRetypeSubmit}
        placeholder="Type the word..."
        tapTargetSize={tapTargetSize}
        fontSize={fontSize}
        submitLabel="Submit"
        ariaLabel="Retype the word correctly"
      />
    </div>
  );
}

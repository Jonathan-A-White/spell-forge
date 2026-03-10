// src/features/practice/spelling-input.tsx — Full word text input for practice mode

import { useState, useCallback, useRef, useEffect } from 'react';
import { SpellingComparison } from './spelling-comparison';

interface SpellingInputProps {
  word: string;
  onComplete: (correct: boolean, responseTimeMs: number, mistakes: number) => void;
  scaffolding?: { chunks: string[]; hints: string[] } | null;
  tapTargetSize: number;
}

type Phase = 'input' | 'comparison' | 'retype';

const REQUIRED_RETYPES = 2;

export function SpellingInput({ word, onComplete, scaffolding, tapTargetSize }: SpellingInputProps) {
  const [phase, setPhase] = useState<Phase>('input');
  const [attempt, setAttempt] = useState('');
  const [retypeCount, setRetypeCount] = useState(0);
  const [retypeValue, setRetypeValue] = useState('');
  const [startTime] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const targetWord = word.toLowerCase();
  const fontSize = `${Math.max(18, tapTargetSize * 0.5)}px`;

  // Focus the input when the phase changes to input or retype
  useEffect(() => {
    if (phase === 'input' || phase === 'retype') {
      // Small delay to ensure the element is rendered
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  const handleSubmit = useCallback(() => {
    const trimmed = attempt.trim().toLowerCase();
    if (trimmed.length === 0) return;

    if (trimmed === targetWord) {
      // Correct on first try — move on immediately
      const responseTimeMs = Date.now() - startTime;
      onComplete(true, responseTimeMs, 0);
    } else {
      // Wrong — show comparison, then require retypes
      setPhase('comparison');
    }
  }, [attempt, targetWord, startTime, onComplete]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleRetypeSubmit = useCallback(() => {
    const trimmed = retypeValue.trim().toLowerCase();
    if (trimmed !== targetWord) {
      // Wrong retype — clear and let them try again
      setRetypeValue('');
      inputRef.current?.focus();
      return;
    }

    const newCount = retypeCount + 1;
    if (newCount >= REQUIRED_RETYPES) {
      // Done retyping — move on (counted as incorrect since initial attempt was wrong)
      const responseTimeMs = Date.now() - startTime;
      onComplete(true, responseTimeMs, 1);
    } else {
      setRetypeCount(newCount);
      setRetypeValue('');
      inputRef.current?.focus();
    }
  }, [retypeValue, targetWord, retypeCount, startTime, onComplete]);

  const handleRetypeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleRetypeSubmit();
      }
    },
    [handleRetypeSubmit],
  );

  const handleStartRetype = useCallback(() => {
    setPhase('retype');
    setRetypeCount(0);
    setRetypeValue('');
  }, []);

  // Phase 1: Initial text input
  if (phase === 'input') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-md">
        {scaffolding && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center w-full">
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
            {scaffolding.hints.map((hint, i) => (
              <p key={i} className="text-blue-700 text-sm mt-1">
                {hint}
              </p>
            ))}
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          value={attempt}
          onChange={(e) => setAttempt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type the word..."
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full text-center font-bold rounded-xl border-2 border-sf-border-strong bg-sf-surface text-sf-heading focus:border-sf-primary focus:outline-none transition-colors"
          style={{
            fontSize,
            padding: `${tapTargetSize * 0.3}px ${tapTargetSize * 0.4}px`,
            minHeight: `${tapTargetSize}px`,
          }}
          aria-label="Type the spelling word"
        />

        <button
          onClick={handleSubmit}
          disabled={attempt.trim().length === 0}
          className="w-full bg-sf-primary hover:bg-sf-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors"
          style={{ minHeight: `${tapTargetSize}px`, fontSize }}
        >
          Check
        </button>
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
        <p className="text-sf-heading font-bold text-2xl" style={{ fontSize }}>
          {word.toLowerCase()}
        </p>
      </div>

      <input
        ref={inputRef}
        type="text"
        value={retypeValue}
        onChange={(e) => setRetypeValue(e.target.value)}
        onKeyDown={handleRetypeKeyDown}
        placeholder="Type the word..."
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className="w-full text-center font-bold rounded-xl border-2 border-sf-border-strong bg-sf-surface text-sf-heading focus:border-sf-primary focus:outline-none transition-colors"
        style={{
          fontSize,
          padding: `${tapTargetSize * 0.3}px ${tapTargetSize * 0.4}px`,
          minHeight: `${tapTargetSize}px`,
        }}
        aria-label="Retype the word correctly"
      />

      <button
        onClick={handleRetypeSubmit}
        disabled={retypeValue.trim().length === 0}
        className="w-full bg-sf-primary hover:bg-sf-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors"
        style={{ minHeight: `${tapTargetSize}px`, fontSize }}
      >
        Submit
      </button>
    </div>
  );
}

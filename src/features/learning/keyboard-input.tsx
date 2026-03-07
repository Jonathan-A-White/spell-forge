// src/features/learning/keyboard-input.tsx — Free-form text input for boss levels and stage 3

import { useState, useCallback, useRef, useEffect } from 'react';

interface KeyboardInputProps {
  word: string;
  onComplete: (correct: boolean, responseTimeMs: number, mistakes: number) => void;
  tapTargetSize: number;
}

export function KeyboardInput({ word, onComplete, tapTargetSize }: KeyboardInputProps) {
  const [value, setValue] = useState('');
  const [wrongFlash, setWrongFlash] = useState(false);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [startTime] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = value.trim();
      if (trimmed.length === 0) return;

      const responseTimeMs = Date.now() - startTime;

      if (trimmed.toLowerCase() === word.toLowerCase()) {
        onComplete(true, responseTimeMs, mistakeCount);
      } else {
        setMistakeCount((prev) => prev + 1);
        setWrongFlash(true);
        setTimeout(() => setWrongFlash(false), 300);
        setValue('');
        inputRef.current?.focus();
      }
    },
    [value, word, onComplete, startTime, mistakeCount],
  );

  const fontSize = `${Math.max(16, tapTargetSize * 0.4)}px`;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4 w-full max-w-md">
      <div
        className={`w-full rounded-xl border-2 transition-colors ${
          wrongFlash ? 'border-red-400 bg-red-50' : 'border-sf-border-strong bg-sf-bg'
        }`}
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full px-4 py-3 bg-transparent text-center font-bold text-sf-heading outline-none"
          style={{ fontSize }}
          placeholder="Type the word..."
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Type the spelling word"
        />
      </div>
      <button
        type="submit"
        disabled={value.trim().length === 0}
        className="w-full bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ minHeight: `${tapTargetSize}px` }}
      >
        Check
      </button>
    </form>
  );
}

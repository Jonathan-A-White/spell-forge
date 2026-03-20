// src/features/learning/keyboard-input.tsx — Free-form text input for boss levels and stage 3

import { useState, useCallback } from 'react';
import { SpellingField } from '../practice/custom-keyboard';
import { hapticSuccess, hapticError } from '../../core/haptics';

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

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;

    const responseTimeMs = Date.now() - startTime;

    if (trimmed.toLowerCase() === word.toLowerCase()) {
      hapticSuccess();
      onComplete(true, responseTimeMs, mistakeCount);
    } else {
      hapticError();
      setMistakeCount((prev) => prev + 1);
      setWrongFlash(true);
      setTimeout(() => setWrongFlash(false), 300);
      setValue('');
    }
  }, [value, word, onComplete, startTime, mistakeCount]);

  const fontSize = `${Math.max(16, tapTargetSize * 0.4)}px`;

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-md">
      <SpellingField
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder="Type the word..."
        tapTargetSize={tapTargetSize}
        fontSize={fontSize}
        submitLabel="Check"
        ariaLabel="Type the spelling word"
        displayClassName={wrongFlash ? 'border-red-400 bg-red-50' : undefined}
      />
    </div>
  );
}

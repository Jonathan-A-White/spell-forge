// src/features/practice/letter-bank.tsx — Letter bank spelling component

import { useState, useCallback, useMemo } from 'react';

interface LetterBankProps {
  word: string;
  onComplete: (correct: boolean, responseTimeMs: number) => void;
  scaffolding?: { chunks: string[]; hints: string[] } | null;
  tapTargetSize: number;
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function generateDistractors(word: string, count: number): string[] {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const wordLetters = new Set(word.toLowerCase().split(''));
  const available = alphabet.split('').filter((l) => !wordLetters.has(l));

  const distractors: string[] = [];
  const shuffled = shuffle(available);
  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    distractors.push(shuffled[i]);
  }
  return distractors;
}

export function LetterBank({ word, onComplete, scaffolding, tapTargetSize }: LetterBankProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [startTime] = useState(() => Date.now());
  const [wrongFlash, setWrongFlash] = useState(false);

  const targetLetters = useMemo(() => word.toLowerCase().split(''), [word]);
  const bankLetters = useMemo(() => {
    const distractors = generateDistractors(word, 4);
    const all = [...targetLetters, ...distractors];
    return shuffle(all);
  }, [word, targetLetters]);

  const [availableLetters, setAvailableLetters] = useState(() =>
    bankLetters.map((l, i) => ({ letter: l, id: `${l}-${i}`, used: false })),
  );

  const handleLetterTap = useCallback(
    (letterId: string, letter: string) => {
      const nextIndex = selected.length;
      const expectedLetter = targetLetters[nextIndex];

      if (letter === expectedLetter) {
        const newSelected = [...selected, letter];
        setSelected(newSelected);
        setAvailableLetters((prev) =>
          prev.map((l) => (l.id === letterId ? { ...l, used: true } : l)),
        );

        if (newSelected.length === targetLetters.length) {
          const responseTimeMs = Date.now() - startTime;
          onComplete(true, responseTimeMs);
        }
      } else {
        setWrongFlash(true);
        setTimeout(() => setWrongFlash(false), 300);
      }
    },
    [selected, targetLetters, onComplete, startTime],
  );

  const handleUndo = useCallback(() => {
    if (selected.length === 0) return;
    const removedLetter = selected[selected.length - 1];
    setSelected((prev) => prev.slice(0, -1));

    // Find the first used letter matching and un-use it
    setAvailableLetters((prev) => {
      const idx = prev.findIndex((l) => l.used && l.letter === removedLetter);
      if (idx === -1) return prev;
      return prev.map((l, i) => (i === idx ? { ...l, used: false } : l));
    });
  }, [selected]);

  const buttonSize = `${tapTargetSize}px`;
  const fontSize = `${Math.max(18, tapTargetSize * 0.45)}px`;

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Scaffolding hints */}
      {scaffolding && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center max-w-md">
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

      {/* Word building area */}
      <div
        className={`flex gap-2 min-h-[80px] items-center justify-center p-4 rounded-xl border-2 transition-colors ${
          wrongFlash ? 'border-red-400 bg-red-50' : 'border-amber-300 bg-amber-50'
        }`}
      >
        {targetLetters.map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-center rounded-lg border-2 border-dashed border-amber-400 bg-white"
            style={{ width: buttonSize, height: buttonSize }}
          >
            {selected[i] && (
              <span className="font-bold text-amber-900 uppercase" style={{ fontSize }}>
                {selected[i]}
              </span>
            )}
          </div>
        ))}
        {selected.length > 0 && (
          <button
            onClick={handleUndo}
            className="ml-2 text-sm text-gray-500 hover:text-gray-700 underline"
            aria-label="Undo last letter"
          >
            Undo
          </button>
        )}
      </div>

      {/* Letter bank */}
      <div className="flex flex-wrap gap-3 justify-center max-w-md">
        {availableLetters.map((item) => (
          <button
            key={item.id}
            onClick={() => handleLetterTap(item.id, item.letter)}
            disabled={item.used}
            className={`rounded-xl font-bold uppercase transition-all shadow-md ${
              item.used
                ? 'opacity-30 cursor-not-allowed bg-gray-200 text-gray-400'
                : 'bg-white hover:bg-amber-100 text-amber-900 border-2 border-amber-300 hover:border-amber-500 active:scale-95'
            }`}
            style={{
              width: buttonSize,
              height: buttonSize,
              fontSize,
              minWidth: buttonSize,
              minHeight: buttonSize,
            }}
            aria-label={`Letter ${item.letter}`}
          >
            {item.letter}
          </button>
        ))}
      </div>
    </div>
  );
}

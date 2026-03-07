// src/features/practice/letter-bank.tsx — Letter bank spelling component

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

interface LetterBankProps {
  word: string;
  onComplete: (correct: boolean, responseTimeMs: number, mistakes: number) => void;
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
  const [mistakeCount, setMistakeCount] = useState(0);

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
          onComplete(true, responseTimeMs, mistakeCount);
        }
      } else {
        setMistakeCount((prev) => prev + 1);
        setWrongFlash(true);
        setTimeout(() => setWrongFlash(false), 300);
      }
    },
    [selected, targetLetters, onComplete, startTime, mistakeCount],
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

  // Measure container width to scale letter boxes for long words
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Scale down slot size so all letters fit within the container
  const slotSize = useMemo(() => {
    if (containerWidth === 0) return tapTargetSize;
    const gap = 8; // gap-2 = 0.5rem = 8px
    const padding = 32; // p-4 = 1rem * 2 = 32px
    const undoWidth = selected.length > 0 ? 60 : 0; // approx undo button width + margin
    const availableWidth = containerWidth - padding - undoWidth;
    const maxPerSlot = (availableWidth - gap * (targetLetters.length - 1)) / targetLetters.length;
    return Math.max(32, Math.min(tapTargetSize, Math.floor(maxPerSlot)));
  }, [containerWidth, tapTargetSize, targetLetters.length, selected.length]);

  const buttonSize = `${slotSize}px`;
  const fontSize = `${Math.max(14, slotSize * 0.45)}px`;

  // Bank button size: also responsive but uses tapTargetSize as max
  const bankButtonSize = useMemo(() => {
    if (containerWidth === 0) return tapTargetSize;
    const gap = 12; // gap-3 = 0.75rem = 12px
    const maxColumns = Math.min(availableLetters.length, 6);
    const maxPerButton = (containerWidth - gap * (maxColumns - 1)) / maxColumns;
    return Math.max(32, Math.min(tapTargetSize, Math.floor(maxPerButton)));
  }, [containerWidth, tapTargetSize, availableLetters.length]);

  const bankSize = `${bankButtonSize}px`;
  const bankFontSize = `${Math.max(14, bankButtonSize * 0.45)}px`;

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-6 w-full">
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
        className={`flex gap-2 min-h-[80px] items-center justify-center p-4 rounded-xl border-2 transition-colors w-full ${
          wrongFlash ? 'border-red-400 bg-red-50' : 'border-sf-border-strong bg-sf-bg'
        }`}
      >
        {targetLetters.map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-center rounded-lg border-2 border-dashed border-sf-border-strong bg-sf-surface flex-shrink-0"
            style={{ width: buttonSize, height: buttonSize }}
          >
            {selected[i] && (
              <span className="font-bold text-sf-heading uppercase" style={{ fontSize }}>
                {selected[i]}
              </span>
            )}
          </div>
        ))}
        {selected.length > 0 && (
          <button
            onClick={handleUndo}
            className="ml-2 text-sm text-sf-faint hover:text-sf-text underline flex-shrink-0"
            aria-label="Undo last letter"
          >
            Undo
          </button>
        )}
      </div>

      {/* Letter bank */}
      <div className="flex flex-wrap gap-3 justify-center w-full">
        {availableLetters.map((item) => (
          <button
            key={item.id}
            onClick={() => handleLetterTap(item.id, item.letter)}
            disabled={item.used}
            className={`rounded-xl font-bold uppercase transition-all shadow-md ${
              item.used
                ? 'opacity-30 cursor-not-allowed bg-sf-disabled text-sf-faint'
                : 'bg-sf-surface hover:bg-sf-surface-hover text-sf-heading border-2 border-sf-border-strong hover:border-sf-primary active:scale-95'
            }`}
            style={{
              width: bankSize,
              height: bankSize,
              fontSize: bankFontSize,
              minWidth: bankSize,
              minHeight: bankSize,
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

// src/features/practice/crossword.tsx — Crossword puzzle game

import { useState, useMemo, useCallback } from 'react';

interface CrosswordProps {
  words: string[];
  onComplete: (correctCount: number, totalCount: number) => void;
  tapTargetSize: number;
}

interface PlacedCrosswordWord {
  word: string;
  row: number;
  col: number;
  direction: 'across' | 'down';
  number: number;
  clue: string;
}

interface CellData {
  letter: string;
  wordIndices: number[];
  number?: number;
}

function generateClue(word: string): string {
  const len = word.length;
  const first = word[0].toUpperCase();
  const last = word[word.length - 1].toLowerCase();
  return `${len} letters, starts with "${first}" and ends with "${last}"`;
}

function buildCrossword(words: string[]): {
  grid: (CellData | null)[][];
  placed: PlacedCrosswordWord[];
  gridSize: number;
} {
  const sorted = [...words]
    .map((w) => w.toUpperCase())
    .sort((a, b) => b.length - a.length);

  const gridSize = Math.max(
    15,
    Math.max(...sorted.map((w) => w.length)) + 4,
  );

  const grid: (CellData | null)[][] = Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => null),
  );

  const placed: PlacedCrosswordWord[] = [];
  let wordNumber = 1;

  if (sorted.length === 0) return { grid, placed, gridSize };

  // Place first word horizontally in the middle
  const firstWord = sorted[0];
  const startRow = Math.floor(gridSize / 2);
  const startCol = Math.floor((gridSize - firstWord.length) / 2);

  for (let i = 0; i < firstWord.length; i++) {
    grid[startRow][startCol + i] = {
      letter: firstWord[i],
      wordIndices: [0],
      ...(i === 0 ? { number: wordNumber } : {}),
    };
  }

  placed.push({
    word: firstWord,
    row: startRow,
    col: startCol,
    direction: 'across',
    number: wordNumber++,
    clue: generateClue(firstWord),
  });

  // Try to place remaining words by finding intersections
  for (let wi = 1; wi < sorted.length; wi++) {
    const word = sorted[wi];
    let bestPlacement: {
      row: number;
      col: number;
      direction: 'across' | 'down';
      intersections: number;
    } | null = null;

    // Try to intersect with already-placed words
    for (const pw of placed) {
      for (let pi = 0; pi < pw.word.length; pi++) {
        for (let wi2 = 0; wi2 < word.length; wi2++) {
          if (pw.word[pi] !== word[wi2]) continue;

          let row: number, col: number;
          let direction: 'across' | 'down';

          if (pw.direction === 'across') {
            // New word goes down
            direction = 'down';
            row = pw.row - wi2;
            col = pw.col + pi;
          } else {
            // New word goes across
            direction = 'across';
            row = pw.row + pi;
            col = pw.col - wi2;
          }

          // Check bounds
          const endRow = direction === 'down' ? row + word.length - 1 : row;
          const endCol = direction === 'across' ? col + word.length - 1 : col;
          if (row < 0 || col < 0 || endRow >= gridSize || endCol >= gridSize) continue;

          // Check if placement is valid
          let valid = true;
          let intersections = 0;

          for (let i = 0; i < word.length; i++) {
            const r = direction === 'down' ? row + i : row;
            const c = direction === 'across' ? col + i : col;
            const cell = grid[r][c];

            if (cell !== null) {
              if (cell.letter === word[i]) {
                intersections++;
              } else {
                valid = false;
                break;
              }
            } else {
              // Check adjacent cells for conflicts (no parallel touching)
              if (direction === 'across') {
                if (grid[r - 1]?.[c] !== null && grid[r - 1]?.[c] !== undefined) {
                  // Check it's not an intersection cell
                  const above = grid[r - 1]?.[c];
                  if (above && !above.wordIndices.some((idx) => placed[idx]?.direction === 'down')) {
                    valid = false;
                    break;
                  }
                }
                if (grid[r + 1]?.[c] !== null && grid[r + 1]?.[c] !== undefined) {
                  const below = grid[r + 1]?.[c];
                  if (below && !below.wordIndices.some((idx) => placed[idx]?.direction === 'down')) {
                    valid = false;
                    break;
                  }
                }
              } else {
                if (grid[r]?.[c - 1] !== null && grid[r]?.[c - 1] !== undefined) {
                  const left = grid[r]?.[c - 1];
                  if (left && !left.wordIndices.some((idx) => placed[idx]?.direction === 'across')) {
                    valid = false;
                    break;
                  }
                }
                if (grid[r]?.[c + 1] !== null && grid[r]?.[c + 1] !== undefined) {
                  const right = grid[r]?.[c + 1];
                  if (right && !right.wordIndices.some((idx) => placed[idx]?.direction === 'across')) {
                    valid = false;
                    break;
                  }
                }
              }
            }
          }

          // Check cell before and after word is empty
          if (valid) {
            if (direction === 'across') {
              if (col > 0 && grid[row][col - 1] !== null) valid = false;
              if (endCol < gridSize - 1 && grid[row][endCol + 1] !== null) valid = false;
            } else {
              if (row > 0 && grid[row - 1][col] !== null) valid = false;
              if (endRow < gridSize - 1 && grid[endRow + 1][col] !== null) valid = false;
            }
          }

          if (valid && intersections > 0) {
            if (!bestPlacement || intersections > bestPlacement.intersections) {
              bestPlacement = { row, col, direction, intersections };
            }
          }
        }
      }
    }

    if (bestPlacement) {
      const { row, col, direction } = bestPlacement;
      const placedIdx = placed.length;
      let assignedNumber: number | undefined;

      for (let i = 0; i < word.length; i++) {
        const r = direction === 'down' ? row + i : row;
        const c = direction === 'across' ? col + i : col;

        if (grid[r][c] !== null) {
          grid[r][c]!.wordIndices.push(placedIdx);
        } else {
          grid[r][c] = {
            letter: word[i],
            wordIndices: [placedIdx],
          };
        }

        if (i === 0) {
          if (grid[r][c]!.number === undefined) {
            grid[r][c]!.number = wordNumber;
            assignedNumber = wordNumber++;
          } else {
            assignedNumber = grid[r][c]!.number;
          }
        }
      }

      placed.push({
        word,
        row,
        col,
        direction,
        number: assignedNumber ?? wordNumber++,
        clue: generateClue(word),
      });
    }
  }

  return { grid, placed, gridSize };
}

export function Crossword({ words, onComplete, tapTargetSize }: CrosswordProps) {
  const { grid, placed, gridSize } = useMemo(() => buildCrossword(words), [words]);

  const [inputs, setInputs] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        if (grid[r][c] !== null) {
          map[`${r},${c}`] = '';
        }
      }
    }
    return map;
  });

  const [checkedWords, setCheckedWords] = useState<Record<number, boolean>>({});
  const [showResults, setShowResults] = useState(false);

  // Find the bounding box of placed cells to trim the grid display
  const bounds = useMemo(() => {
    let minR = gridSize, maxR = 0, minC = gridSize, maxC = 0;
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        if (grid[r][c] !== null) {
          minR = Math.min(minR, r);
          maxR = Math.max(maxR, r);
          minC = Math.min(minC, c);
          maxC = Math.max(maxC, c);
        }
      }
    }
    return { minR: Math.max(0, minR - 1), maxR: Math.min(gridSize - 1, maxR + 1), minC: Math.max(0, minC - 1), maxC: Math.min(gridSize - 1, maxC + 1) };
  }, [grid, gridSize]);

  const handleInputChange = useCallback((r: number, c: number, value: string) => {
    const letter = value.slice(-1).toUpperCase();
    setInputs((prev) => ({ ...prev, [`${r},${c}`]: letter }));

    // Auto-advance to next cell
    if (letter) {
      // Try right first, then down
      const nextRight = document.querySelector<HTMLInputElement>(`[data-pos="${r},${c + 1}"]`);
      const nextDown = document.querySelector<HTMLInputElement>(`[data-pos="${r + 1},${c}"]`);
      (nextRight ?? nextDown)?.focus();
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, r: number, c: number) => {
    if (e.key === 'Backspace' && !inputs[`${r},${c}`]) {
      // Move to previous cell
      const prevLeft = document.querySelector<HTMLInputElement>(`[data-pos="${r},${c - 1}"]`);
      const prevUp = document.querySelector<HTMLInputElement>(`[data-pos="${r - 1},${c}"]`);
      (prevLeft ?? prevUp)?.focus();
    } else if (e.key === 'ArrowRight') {
      document.querySelector<HTMLInputElement>(`[data-pos="${r},${c + 1}"]`)?.focus();
    } else if (e.key === 'ArrowLeft') {
      document.querySelector<HTMLInputElement>(`[data-pos="${r},${c - 1}"]`)?.focus();
    } else if (e.key === 'ArrowDown') {
      document.querySelector<HTMLInputElement>(`[data-pos="${r + 1},${c}"]`)?.focus();
    } else if (e.key === 'ArrowUp') {
      document.querySelector<HTMLInputElement>(`[data-pos="${r - 1},${c}"]`)?.focus();
    }
  }, [inputs]);

  const handleCheck = useCallback(() => {
    const results: Record<number, boolean> = {};
    for (let i = 0; i < placed.length; i++) {
      const pw = placed[i];
      let correct = true;
      for (let j = 0; j < pw.word.length; j++) {
        const r = pw.direction === 'down' ? pw.row + j : pw.row;
        const c = pw.direction === 'across' ? pw.col + j : pw.col;
        if (inputs[`${r},${c}`] !== pw.word[j]) {
          correct = false;
          break;
        }
      }
      results[i] = correct;
    }
    setCheckedWords(results);
    setShowResults(true);

    const correctCount = Object.values(results).filter(Boolean).length;
    onComplete(correctCount, placed.length);
  }, [inputs, placed, onComplete]);

  const acrossClues = placed.filter((p) => p.direction === 'across').sort((a, b) => a.number - b.number);
  const downClues = placed.filter((p) => p.direction === 'down').sort((a, b) => a.number - b.number);

  const cellSize = Math.max(32, Math.min(tapTargetSize * 0.65, 44));

  if (placed.length === 0) {
    return (
      <div className="text-center p-8">
        <p className="text-sf-muted">Not enough words to build a crossword puzzle.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-3xl mx-auto">
      <h2 className="text-xl font-bold text-sf-heading">Crossword Puzzle</h2>
      <p className="text-sf-muted text-sm">
        Fill in {placed.length} word{placed.length !== 1 ? 's' : ''} using the clues below
      </p>

      {/* Grid */}
      <div className="overflow-x-auto w-full flex justify-center">
        <div className="inline-block">
          {Array.from({ length: bounds.maxR - bounds.minR + 1 }, (_, ri) => {
            const r = ri + bounds.minR;
            return (
              <div key={r} className="flex">
                {Array.from({ length: bounds.maxC - bounds.minC + 1 }, (_, ci) => {
                  const c = ci + bounds.minC;
                  const cell = grid[r][c];

                  if (cell === null) {
                    return (
                      <div
                        key={`${r},${c}`}
                        style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
                        className="bg-sf-bg"
                      />
                    );
                  }

                  const isCorrect = showResults && cell.wordIndices.some((idx) => checkedWords[idx] === true);
                  const isWrong = showResults && !isCorrect && inputs[`${r},${c}`] !== '';

                  return (
                    <div
                      key={`${r},${c}`}
                      className={`relative border border-sf-border-strong ${
                        isCorrect
                          ? 'bg-green-100'
                          : isWrong
                            ? 'bg-red-100'
                            : 'bg-sf-surface'
                      }`}
                      style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
                    >
                      {cell.number !== undefined && (
                        <span className="absolute top-0 left-0.5 text-[9px] text-sf-muted leading-none">
                          {cell.number}
                        </span>
                      )}
                      <input
                        data-pos={`${r},${c}`}
                        type="text"
                        maxLength={1}
                        value={inputs[`${r},${c}`] ?? ''}
                        onChange={(e) => handleInputChange(r, c, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, r, c)}
                        disabled={showResults}
                        className="w-full h-full text-center font-bold uppercase bg-transparent outline-none focus:ring-2 focus:ring-sf-primary/50"
                        style={{ fontSize: `${cellSize * 0.5}px` }}
                        aria-label={`Row ${r + 1}, Column ${c + 1}${cell.number !== undefined ? `, number ${cell.number}` : ''}`}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Clues */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full text-left">
        {acrossClues.length > 0 && (
          <div>
            <h3 className="font-bold text-sf-heading mb-2">Across</h3>
            <ul className="space-y-1">
              {acrossClues.map((pw, i) => {
                const idx = placed.indexOf(pw);
                return (
                  <li
                    key={i}
                    className={`text-sm ${
                      showResults
                        ? checkedWords[idx]
                          ? 'text-green-700'
                          : 'text-red-600'
                        : 'text-sf-text'
                    }`}
                  >
                    <span className="font-medium">{pw.number}.</span> {pw.clue}
                    {showResults && !checkedWords[idx] && (
                      <span className="ml-1 font-medium"> ({pw.word})</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {downClues.length > 0 && (
          <div>
            <h3 className="font-bold text-sf-heading mb-2">Down</h3>
            <ul className="space-y-1">
              {downClues.map((pw, i) => {
                const idx = placed.indexOf(pw);
                return (
                  <li
                    key={i}
                    className={`text-sm ${
                      showResults
                        ? checkedWords[idx]
                          ? 'text-green-700'
                          : 'text-red-600'
                        : 'text-sf-text'
                    }`}
                  >
                    <span className="font-medium">{pw.number}.</span> {pw.clue}
                    {showResults && !checkedWords[idx] && (
                      <span className="ml-1 font-medium"> ({pw.word})</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {!showResults && (
        <button
          onClick={handleCheck}
          className="w-full max-w-xs bg-sf-primary hover:bg-sf-primary-hover text-sf-primary-text font-bold py-3 px-6 rounded-xl transition-colors"
        >
          Check Answers
        </button>
      )}

      {showResults && (
        <div className="text-center">
          <p className="text-lg font-bold text-sf-heading">
            {Object.values(checkedWords).filter(Boolean).length} / {placed.length} correct!
          </p>
        </div>
      )}
    </div>
  );
}

// src/features/practice/word-search.tsx — Word Search puzzle game

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  type WordSearchDifficulty,
  type PlacedWord,
  getDirectionsForDifficulty,
  getMaxWordsForDifficulty,
  getGridSizeForDifficulty,
  buildGrid,
} from './word-search-difficulty';

export interface WordSearchSavedState {
  grid: string[][];
  placed: PlacedWord[];
  foundWords: string[];
  highlightedCells: string[];
}

interface WordSearchProps {
  words: string[];
  difficulty: WordSearchDifficulty;
  onComplete: (foundCount: number, totalCount: number) => void;
  tapTargetSize: number;
  savedState?: WordSearchSavedState;
  onProgress?: (state: WordSearchSavedState) => void;
}

function cellKey(r: number, c: number): string {
  return `${r},${c}`;
}

export function WordSearch({ words, difficulty, onComplete, tapTargetSize, savedState, onProgress }: WordSearchProps) {
  const limitedWords = useMemo(() => {
    const max = getMaxWordsForDifficulty(difficulty);
    return words.slice(0, max);
  }, [words, difficulty]);

  const gridSize = useMemo(
    () => getGridSizeForDifficulty(limitedWords, difficulty),
    [limitedWords, difficulty],
  );

  const directions = useMemo(() => getDirectionsForDifficulty(difficulty), [difficulty]);

  // Use saved grid/placed if available, otherwise generate new
  const { grid, placed } = useMemo(() => {
    if (savedState) {
      return { grid: savedState.grid, placed: savedState.placed };
    }
    return buildGrid(limitedWords, gridSize, directions);
  }, [limitedWords, gridSize, directions, savedState]);

  const [foundWords, setFoundWords] = useState<Set<string>>(
    () => new Set(savedState?.foundWords ?? []),
  );
  const [selecting, setSelecting] = useState(false);
  const [selectedCells, setSelectedCells] = useState<[number, number][]>([]);
  const [highlightedCells, setHighlightedCells] = useState<Set<string>>(
    () => new Set(savedState?.highlightedCells ?? []),
  );

  // Report progress when found words change
  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);
  useEffect(() => {
    if (foundWords.size > 0) {
      onProgressRef.current?.({
        grid,
        placed,
        foundWords: [...foundWords],
        highlightedCells: [...highlightedCells],
      });
    }
  }, [foundWords, highlightedCells, grid, placed]);

  const handleCellDown = useCallback((r: number, c: number) => {
    setSelecting(true);
    setSelectedCells([[r, c]]);
  }, []);

  const handleCellEnter = useCallback(
    (r: number, c: number) => {
      if (!selecting) return;
      // Only allow straight-line selections
      if (selectedCells.length === 0) return;

      const [startR, startC] = selectedCells[0];
      const dr = Math.sign(r - startR);
      const dc = Math.sign(c - startC);

      // Rebuild line from start to current
      const dist = Math.max(Math.abs(r - startR), Math.abs(c - startC));
      if (dist === 0) return;

      // Verify it's a straight line
      if (r - startR !== 0 && c - startC !== 0 && Math.abs(r - startR) !== Math.abs(c - startC)) return;

      const cells: [number, number][] = [];
      for (let i = 0; i <= dist; i++) {
        cells.push([startR + dr * i, startC + dc * i]);
      }
      setSelectedCells(cells);
    },
    [selecting, selectedCells],
  );

  const handleCellUp = useCallback(() => {
    if (!selecting) return;
    setSelecting(false);

    // Check if selected cells match any placed word
    const selectedStr = selectedCells.map(([r, c]) => grid[r][c]).join('');
    const reversedStr = [...selectedStr].reverse().join('');

    for (const pw of placed) {
      if (foundWords.has(pw.word)) continue;
      if (selectedStr === pw.word || reversedStr === pw.word) {
        const newFound = new Set(foundWords);
        newFound.add(pw.word);
        setFoundWords(newFound);

        const newHighlighted = new Set(highlightedCells);
        for (const [r, c] of pw.cells) {
          newHighlighted.add(cellKey(r, c));
        }
        setHighlightedCells(newHighlighted);

        if (newFound.size === placed.length) {
          onComplete(newFound.size, placed.length);
        }
        break;
      }
    }

    setSelectedCells([]);
  }, [selecting, selectedCells, grid, placed, foundWords, highlightedCells, onComplete]);

  const selectedSet = useMemo(() => {
    const s = new Set<string>();
    for (const [r, c] of selectedCells) {
      s.add(cellKey(r, c));
    }
    return s;
  }, [selectedCells]);

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
    setContainerWidth(containerRef.current.clientWidth);
    return () => observer.disconnect();
  }, []);

  const cellSize = useMemo(() => {
    const preferred = Math.max(28, Math.min(tapTargetSize * 0.7, 44));
    if (containerWidth > 0) {
      const maxByWidth = Math.floor(containerWidth / gridSize);
      return Math.max(20, Math.min(preferred, maxByWidth));
    }
    return preferred;
  }, [tapTargetSize, containerWidth, gridSize]);

  const fontSize = `${Math.max(10, cellSize * 0.45)}px`;
  const isDone = foundWords.size === placed.length;

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-3 w-full max-w-full overflow-x-auto px-1">
      <h2 className="text-xl font-bold text-sf-heading">Word Search</h2>
      <p className="text-sf-muted text-sm">
        Find {placed.length} word{placed.length !== 1 ? 's' : ''} hidden in the grid!
        <span className="ml-1 capitalize">({difficulty})</span>
      </p>

      {/* Word list */}
      <div className="flex flex-wrap gap-1.5 justify-center w-full px-1">
        {placed.map((pw) => (
          <span
            key={pw.word}
            className={`px-2 py-0.5 rounded-full text-xs font-medium transition-all ${
              foundWords.has(pw.word)
                ? 'bg-green-100 text-green-700 line-through'
                : 'bg-sf-surface border border-sf-border text-sf-heading'
            }`}
          >
            {pw.word}
          </span>
        ))}
      </div>

      {/* Grid */}
      <div
        className="select-none touch-none"
        onMouseUp={handleCellUp}
        onMouseLeave={handleCellUp}
        onTouchEnd={handleCellUp}
        role="grid"
        aria-label="Word search puzzle grid"
      >
        {grid.map((row, r) => (
          <div key={r} className="flex" role="row">
            {row.map((letter, c) => {
              const key = cellKey(r, c);
              const isSelected = selectedSet.has(key);
              const isFound = highlightedCells.has(key);

              return (
                <div
                  key={key}
                  role="gridcell"
                  aria-label={`Letter ${letter}`}
                  className={`flex items-center justify-center font-bold uppercase cursor-pointer transition-colors border border-sf-border/30 ${
                    isFound
                      ? 'bg-green-200 text-green-800'
                      : isSelected
                        ? 'bg-sf-primary/30 text-sf-heading'
                        : 'bg-sf-surface text-sf-heading hover:bg-sf-surface-hover'
                  }`}
                  style={{
                    width: `${cellSize}px`,
                    height: `${cellSize}px`,
                    fontSize,
                  }}
                  onMouseDown={() => handleCellDown(r, c)}
                  onMouseEnter={() => handleCellEnter(r, c)}
                  onTouchStart={() => handleCellDown(r, c)}
                  onTouchMove={(e) => {
                    const touch = e.touches[0];
                    const el = document.elementFromPoint(touch.clientX, touch.clientY);
                    if (el) {
                      const rowAttr = el.getAttribute('data-row');
                      const colAttr = el.getAttribute('data-col');
                      if (rowAttr && colAttr) {
                        handleCellEnter(Number(rowAttr), Number(colAttr));
                      }
                    }
                  }}
                  data-row={r}
                  data-col={c}
                >
                  {letter}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <p className="text-sf-muted text-sm">
        Found: {foundWords.size} / {placed.length}
      </p>

      {isDone && (
        <div className="text-center">
          <p className="text-lg font-bold text-green-700 mb-2">
            You found all the words!
          </p>
        </div>
      )}
    </div>
  );
}

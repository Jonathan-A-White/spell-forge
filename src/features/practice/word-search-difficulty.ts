// src/features/practice/word-search-difficulty.ts — Difficulty settings for Word Search

import { shuffle } from '../../core/shuffle';

export type WordSearchDifficulty = 'easy' | 'medium' | 'hard';

type Direction = [number, number];

const DIRECTIONS_EASY: Direction[] = [
  [0, 1],   // right
  [1, 0],   // down
];

const DIRECTIONS_MEDIUM: Direction[] = [
  [0, 1],   // right
  [1, 0],   // down
  [1, 1],   // diagonal down-right
  [-1, 1],  // diagonal up-right
];

const DIRECTIONS_HARD: Direction[] = [
  [0, 1],   // right
  [1, 0],   // down
  [1, 1],   // diagonal down-right
  [0, -1],  // left
  [1, -1],  // diagonal down-left
  [-1, 0],  // up
  [-1, 1],  // diagonal up-right
  [-1, -1], // diagonal up-left
];

export function getDirectionsForDifficulty(difficulty: WordSearchDifficulty): Direction[] {
  switch (difficulty) {
    case 'easy': return DIRECTIONS_EASY;
    case 'medium': return DIRECTIONS_MEDIUM;
    case 'hard': return DIRECTIONS_HARD;
  }
}

export function getMaxWordsForDifficulty(difficulty: WordSearchDifficulty): number {
  switch (difficulty) {
    case 'easy': return 6;
    case 'medium': return 9;
    case 'hard': return 12;
  }
}

export function getGridSizeForDifficulty(
  words: string[],
  difficulty: WordSearchDifficulty,
): number {
  const maxLen = Math.max(...words.map((w) => w.length));
  const base = Math.max(10, maxLen + 3, Math.ceil(Math.sqrt(words.length * 20)));
  switch (difficulty) {
    case 'easy': return Math.max(8, Math.min(base - 2, 10));
    case 'medium': return base;
    case 'hard': return base + 2;
  }
}

// ─── Grid Building ───────────────────────────────────────────

export interface PlacedWord {
  word: string;
  row: number;
  col: number;
  direction: Direction;
  cells: [number, number][];
}

export function buildGrid(
  words: string[],
  gridSize: number,
  directions: Direction[] = DIRECTIONS_HARD,
): { grid: string[][]; placed: PlacedWord[] } {
  const grid: string[][] = Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => ''),
  );
  const placed: PlacedWord[] = [];

  // Sort words longest first for better placement
  const sorted = [...words].sort((a, b) => b.length - a.length);

  for (const word of sorted) {
    const upper = word.toUpperCase();
    let didPlace = false;

    const shuffledDirs = shuffle([...directions]);
    const positions = shuffle(
      Array.from({ length: gridSize * gridSize }, (_, i) => [Math.floor(i / gridSize), i % gridSize] as [number, number]),
    );

    for (const [dr, dc] of shuffledDirs) {
      if (didPlace) break;
      for (const [startRow, startCol] of positions) {
        if (didPlace) break;
        const endRow = startRow + dr * (upper.length - 1);
        const endCol = startCol + dc * (upper.length - 1);

        if (endRow < 0 || endRow >= gridSize || endCol < 0 || endCol >= gridSize) continue;

        let canPlace = true;
        const cells: [number, number][] = [];
        for (let i = 0; i < upper.length; i++) {
          const r = startRow + dr * i;
          const c = startCol + dc * i;
          cells.push([r, c]);
          if (grid[r][c] !== '' && grid[r][c] !== upper[i]) {
            canPlace = false;
            break;
          }
        }

        if (canPlace) {
          for (let i = 0; i < upper.length; i++) {
            grid[cells[i][0]][cells[i][1]] = upper[i];
          }
          placed.push({ word: upper, row: startRow, col: startCol, direction: [dr, dc], cells });
          didPlace = true;
        }
      }
    }
  }

  // Fill empty cells with random letters
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (grid[r][c] === '') {
        grid[r][c] = alphabet[Math.floor(Math.random() * 26)];
      }
    }
  }

  return { grid, placed };
}

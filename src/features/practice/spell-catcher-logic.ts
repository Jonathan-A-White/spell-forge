// src/features/practice/spell-catcher-logic.ts — Pure logic for Spell Catcher (testable, no React)

export interface FallingLetter {
  id: string;
  letter: string;
  column: number;   // 0-based column index
  row: number;       // current row position (0 = top, increases downward)
  speed: number;     // rows per tick
  isTarget: boolean; // true if this is the next needed letter
}

interface CatchResult {
  caught: boolean;
  correct: boolean;
  letterIndex: number; // which position in the word was being sought
}

/** Generate distractor letters that look plausible alongside the target word */
export function generateDistractors(word: string, count: number): string[] {
  const wordLetters = new Set(word.toLowerCase().split(''));
  // Common letters weighted toward ones kids confuse
  const pool = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const distractors: string[] = [];

  // Include some letters from the word itself (to make it tricky)
  const wordArr = word.toLowerCase().split('');
  for (let i = 0; i < Math.min(count, Math.ceil(count / 2)); i++) {
    distractors.push(wordArr[i % wordArr.length]);
  }

  // Fill with random non-word letters
  const nonWordLetters = pool.filter((l) => !wordLetters.has(l));
  for (let i = distractors.length; i < count; i++) {
    distractors.push(nonWordLetters[i % nonWordLetters.length]);
  }

  return distractors;
}

/** Create a batch of falling letters for a given word and next needed index */
export function createLetterBatch(
  word: string,
  nextLetterIndex: number,
  columns: number,
  batchId: number,
): FallingLetter[] {
  const targetLetter = word[nextLetterIndex]?.toLowerCase();
  if (!targetLetter) return [];

  const distractorCount = Math.max(2, columns - 1);
  const distractors = generateDistractors(word, distractorCount);

  // Place the target letter in a random column
  const targetColumn = batchId % columns;
  const letters: FallingLetter[] = [];

  // Add target letter
  letters.push({
    id: `${batchId}-target`,
    letter: targetLetter,
    column: targetColumn,
    row: 0,
    speed: 1,
    isTarget: true,
  });

  // Add distractors in other columns
  let colIdx = 0;
  for (let i = 0; i < distractors.length && letters.length < columns; i++) {
    if (colIdx === targetColumn) colIdx++;
    if (colIdx >= columns) break;
    letters.push({
      id: `${batchId}-d${i}`,
      letter: distractors[i],
      column: colIdx,
      row: 0,
      speed: 1,
      isTarget: false,
    });
    colIdx++;
  }

  return letters;
}

/** Check if a tapped letter is correct for the current position in the word */
export function checkCatch(
  letter: string,
  word: string,
  nextLetterIndex: number,
): CatchResult {
  const expected = word[nextLetterIndex]?.toLowerCase();
  const tapped = letter.toLowerCase();
  return {
    caught: true,
    correct: tapped === expected,
    letterIndex: nextLetterIndex,
  };
}

/** Calculate score for completing a word */
export function calcWordScore(
  livesRemaining: number,
  maxLives: number,
  wordLength: number,
): number {
  // Base points for the word + bonus for lives remaining
  const basePoints = wordLength * 10;
  const lifeBonus = Math.round((livesRemaining / maxLives) * wordLength * 5);
  return basePoints + lifeBonus;
}

/** Calculate depth level (visual progression) based on words completed */
export function calcDepthLevel(wordsCompleted: number, totalWords: number): number {
  if (totalWords <= 0) return 0;
  return Math.min(Math.floor((wordsCompleted / totalWords) * 5), 5);
}

/** Get lives for the round based on word length */
export function calcStartingLives(wordLength: number): number {
  if (wordLength <= 3) return 3;
  if (wordLength <= 5) return 4;
  return 5;
}

/** Calculate final star rating */
export function calcCatcherStars(
  wordsCompleted: number,
  totalWords: number,
  totalScore: number,
  maxPossibleScore: number,
): number {
  if (totalWords <= 0) return 0;
  const completionRate = wordsCompleted / totalWords;
  const scoreRate = maxPossibleScore > 0 ? totalScore / maxPossibleScore : 0;

  if (completionRate === 1 && scoreRate >= 0.8) return 3;
  if (completionRate >= 0.7) return 2;
  if (completionRate >= 0.4) return 1;
  return 0;
}

/** Calculate the max possible score for a set of words (perfect play) */
export function calcMaxPossibleScore(words: string[], maxLives?: number): number {
  return words.reduce((total, word) => {
    const lives = maxLives ?? calcStartingLives(word.length);
    return total + calcWordScore(lives, lives, word.length);
  }, 0);
}

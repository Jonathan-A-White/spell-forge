// src/features/practice/word-volcano-logic.ts — Pure logic for Word Volcano (testable, no React)

export interface VolcanoLetter {
  id: string;
  letter: string;
  placed: boolean;
}

export interface EruptionLevel {
  level: number;
  label: string;
  color: string;         // Tailwind class suffix
  wordsRequired: number; // cumulative words to reach this level
}

export const ERUPTION_LEVELS: EruptionLevel[] = [
  { level: 0, label: 'Dormant', color: 'gray', wordsRequired: 0 },
  { level: 1, label: 'Rumbling', color: 'amber', wordsRequired: 2 },
  { level: 2, label: 'Smoking', color: 'orange', wordsRequired: 4 },
  { level: 3, label: 'Lava Flow', color: 'red', wordsRequired: 6 },
  { level: 4, label: 'Eruption!', color: 'rose', wordsRequired: 8 },
];

/** Get eruption level based on words completed */
export function getEruptionLevel(wordsCompleted: number): EruptionLevel {
  let level = ERUPTION_LEVELS[0];
  for (const el of ERUPTION_LEVELS) {
    if (wordsCompleted >= el.wordsRequired) {
      level = el;
    }
  }
  return level;
}

/** Create scrambled letter tiles for a word, including distractors */
export function createLetterTiles(word: string, batchId: number): VolcanoLetter[] {
  const letters = word.toLowerCase().split('');

  // Add 2-3 distractor letters
  const distractorCount = Math.min(3, Math.max(2, Math.floor(word.length / 2)));
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const wordSet = new Set(letters);

  for (let i = 0; i < distractorCount; i++) {
    // Pick a letter not in the word
    let distractor: string;
    let attempts = 0;
    do {
      distractor = alphabet[Math.floor(Math.random() * 26)];
      attempts++;
    } while (wordSet.has(distractor) && attempts < 26);
    letters.push(distractor);
  }

  // Shuffle using Fisher-Yates
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }

  return letters.map((letter, idx) => ({
    id: `${batchId}-${idx}`,
    letter,
    placed: false,
  }));
}

/** Check if a selected letter sequence matches the target word */
export function checkWordBuilt(selectedLetters: string[], targetWord: string): boolean {
  return selectedLetters.join('') === targetWord.toLowerCase();
}

/** Calculate score for building a word */
export function calcVolcanoWordScore(
  wordLength: number,
  mistakesMade: number,
  hintsUsed: number,
): number {
  const base = wordLength * 15;
  const mistakePenalty = mistakesMade * 5;
  const hintPenalty = hintsUsed * 10;
  return Math.max(base - mistakePenalty - hintPenalty, wordLength);
}

/** Calculate lava fill percentage (0-100) for volcano visual */
export function calcLavaFill(wordsCompleted: number, totalWords: number): number {
  if (totalWords <= 0) return 0;
  return Math.min(Math.round((wordsCompleted / totalWords) * 100), 100);
}

/** Calculate final star rating */
export function calcVolcanoStars(
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

/** Calculate maximum possible score for a set of words (perfect play, no mistakes/hints) */
export function calcMaxPossibleScore(words: string[]): number {
  return words.reduce((total, word) => total + calcVolcanoWordScore(word.length, 0, 0), 0);
}

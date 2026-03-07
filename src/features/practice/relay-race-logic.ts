// src/features/practice/relay-race-logic.ts — Pure logic for Word Relay Race (testable, no React)

/** Calculate runner position as percentage (0-100) along the track */
export function calcRunnerPosition(currentIndex: number, totalWords: number): number {
  if (totalWords <= 0) return 0;
  return Math.round((currentIndex / totalWords) * 100);
}

/** Format milliseconds into a display string like "1:23.4" */
export function formatTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
  }
  return `${seconds.toFixed(1)}s`;
}

/** Calculate stumble delay in ms based on word length */
export function calcStumbleDelay(wordLength: number): number {
  return Math.min(2000, 1000 + wordLength * 50);
}

/** Determine star rating based on accuracy and whether it's a personal best */
export function calcStarRating(
  wordsCorrect: number,
  totalWords: number,
  isNewBest: boolean,
): number {
  const accuracy = totalWords > 0 ? wordsCorrect / totalWords : 0;
  if (accuracy === 1 && isNewBest) return 3;
  if (accuracy >= 0.8) return 2;
  if (accuracy >= 0.5) return 1;
  return 0;
}

// src/core/shuffle.ts — Fisher-Yates (Knuth) shuffle, unbiased

/**
 * Returns a new array with elements randomly shuffled using the
 * Fisher-Yates algorithm.  The original array is not mutated.
 */
export function shuffle<T>(arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// src/features/practice/letter-invasion-logic.ts — Pure logic for Letter Invasion (testable, no React)

export interface Invader {
  id: string;
  letter: string;
  column: number;  // 0-based
  row: number;     // 0 = top, increases downward
  speed: number;   // rows per tick
  isTarget: boolean;
}

export interface WaveConfig {
  wave: number;
  word: string;
  spawnIntervalTicks: number; // ticks between spawns
  invaderSpeed: number;       // rows per tick
  columns: number;
}

/** Configure a wave based on the word and wave number */
export function createWaveConfig(word: string, waveNumber: number, columns: number): WaveConfig {
  // Increase difficulty with each wave
  const speedBoost = Math.min(waveNumber * 0.15, 0.6);
  const spawnReduction = Math.max(4 - Math.floor(waveNumber / 3), 2);

  return {
    wave: waveNumber,
    word,
    spawnIntervalTicks: spawnReduction,
    invaderSpeed: 1 + speedBoost,
    columns,
  };
}

/** Create an invader (letter) at the top of the grid */
export function spawnInvader(
  config: WaveConfig,
  nextLetterIndex: number,
  invaderId: number,
  forceTarget = false,
): Invader {
  const targetLetter = config.word[nextLetterIndex]?.toLowerCase();
  if (!targetLetter) {
    // Spawn a random distractor
    const letter = randomLetter(config.word);
    return {
      id: `inv-${invaderId}`,
      letter,
      column: Math.floor(Math.random() * config.columns),
      row: 0,
      speed: config.invaderSpeed,
      isTarget: false,
    };
  }

  // Force target if requested, otherwise ~40% chance of spawning the target letter
  const spawnTarget = forceTarget || Math.random() < 0.4;
  const letter = spawnTarget ? targetLetter : randomLetter(config.word);

  return {
    id: `inv-${invaderId}`,
    letter,
    column: Math.floor(Math.random() * config.columns),
    row: 0,
    speed: config.invaderSpeed,
    isTarget: spawnTarget,
  };
}

/** Generate a random letter, slightly weighted toward confusable letters */
function randomLetter(word: string): string {
  const pool = 'abcdefghijklmnopqrstuvwxyz';
  // 30% chance to pick from the word itself (makes it trickier)
  if (Math.random() < 0.3) {
    return word[Math.floor(Math.random() * word.length)].toLowerCase();
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Check if shooting an invader is correct */
export function checkShot(
  invaderLetter: string,
  word: string,
  nextLetterIndex: number,
): { correct: boolean; letterIndex: number } {
  const expected = word[nextLetterIndex]?.toLowerCase();
  return {
    correct: invaderLetter.toLowerCase() === expected,
    letterIndex: nextLetterIndex,
  };
}

/** Calculate score for completing a word in a wave */
export function calcWaveScore(
  wordLength: number,
  shieldRemaining: number,
  maxShield: number,
): number {
  const base = wordLength * 12;
  const shieldBonus = Math.round((shieldRemaining / maxShield) * wordLength * 8);
  return base + shieldBonus;
}

/** Calculate starting shield (lives) based on word length */
export function calcStartingShield(wordLength: number): number {
  if (wordLength <= 3) return 4;
  if (wordLength <= 5) return 5;
  return 6;
}

/** Calculate final star rating */
export function calcInvasionStars(
  wavesCleared: number,
  totalWaves: number,
  totalScore: number,
  maxPossibleScore: number,
): number {
  if (totalWaves <= 0) return 0;
  const clearRate = wavesCleared / totalWaves;
  const scoreRate = maxPossibleScore > 0 ? totalScore / maxPossibleScore : 0;

  if (clearRate === 1 && scoreRate >= 0.8) return 3;
  if (clearRate >= 0.7) return 2;
  if (clearRate >= 0.4) return 1;
  return 0;
}

/** Calculate max possible score for a set of words (perfect play) */
export function calcMaxPossibleScore(words: string[]): number {
  return words.reduce((total, word) => {
    const shield = calcStartingShield(word.length);
    return total + calcWaveScore(word.length, shield, shield);
  }, 0);
}

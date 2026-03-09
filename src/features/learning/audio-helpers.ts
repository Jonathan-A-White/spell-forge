// src/features/learning/audio-helpers.ts — Say + spell audio helpers for learning mode

import type { AudioManager } from '../../audio/manager';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Say the full word, pause, then spell out each letter individually.
 * Uses runExclusive so overlapping taps are silently ignored.
 */
export async function sayAndSpell(
  audioManager: AudioManager,
  word: string,
): Promise<void> {
  await audioManager.runExclusive(async () => {
    await audioManager.speak(word);
    await delay(300);
    await audioManager.speakChunks(word.split(''), 400);
  });
}

/**
 * Say the full word only, without spelling it out.
 * Uses runExclusive so overlapping taps are silently ignored.
 */
export async function sayWordOnly(
  audioManager: AudioManager,
  word: string,
): Promise<void> {
  await audioManager.runExclusive(async () => {
    await audioManager.speak(word);
  });
}

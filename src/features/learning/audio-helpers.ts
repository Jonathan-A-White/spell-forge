// src/features/learning/audio-helpers.ts — Say + spell audio helpers for learning mode

import type { AudioManager } from '../../audio/manager';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Say the full word, pause, then spell out each letter individually.
 * Used when entering a new stage level or when the user taps "Hear it".
 */
export async function sayAndSpell(
  audioManager: AudioManager,
  word: string,
): Promise<void> {
  await audioManager.speak(word);
  await delay(300);
  await audioManager.speakChunks(word.split(''), 400);
}

/**
 * Say the full word only, without spelling it out.
 * Used in test-out mode where spelling would reveal the answer.
 */
export async function sayWordOnly(
  audioManager: AudioManager,
  word: string,
): Promise<void> {
  await audioManager.speak(word);
}

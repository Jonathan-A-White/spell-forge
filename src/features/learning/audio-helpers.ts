// src/features/learning/audio-helpers.ts — Thin wrappers that run audio
// actions inside runExclusive so overlapping taps are silently ignored.

import type { AudioManager } from '../../audio/manager';

export async function sayAndSpell(
  audioManager: AudioManager,
  word: string,
  language: string,
): Promise<void> {
  await audioManager.runExclusive(() => audioManager.sayThenSpell(word, language));
}

export async function sayWordOnly(
  audioManager: AudioManager,
  word: string,
  language: string,
): Promise<void> {
  await audioManager.runExclusive(() => audioManager.sayWord(word, language));
}

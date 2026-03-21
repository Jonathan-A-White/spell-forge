// src/core/memory-aids/engine.ts — Main entry point for generating all memory aids

import type { MemoryAid } from '../../contracts/types.ts';
import { generatePhoneticAid } from './phonetic-aid.ts';
import { generatePatternAid } from './pattern-aid.ts';
import { generateMnemonicAid } from './mnemonic-aid.ts';

/**
 * Generate all three memory aids for a word:
 * 1. Phonetic breakdown ("Sound It Out")
 * 2. Pattern spotlight ("Pattern Spotter")
 * 3. Memory tricks ("Memory Tricks")
 *
 * Each aid is shown on a different rep during Stage 0 of learning.
 */
export function generateMemoryAids(word: string): [MemoryAid, MemoryAid, MemoryAid] {
  return [
    generatePhoneticAid(word),
    generatePatternAid(word),
    generateMnemonicAid(word),
  ];
}

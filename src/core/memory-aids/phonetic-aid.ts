// src/core/memory-aids/phonetic-aid.ts — "Sound It Out" memory aid

import type { PhoneticAid, PhoneticChunk, Phoneme } from '../../contracts/types.ts';
import { splitSyllables } from '../phonics/syllabifier.ts';
import { analyzeWord } from '../phonics/engine.ts';

/**
 * Generate a phonetic breakdown aid for a word.
 * Shows syllables with pronunciation guides so the learner
 * can "sound out" the word piece by piece.
 */
export function generatePhoneticAid(word: string): PhoneticAid {
  const lower = word.toLowerCase().trim();
  const analysis = analyzeWord(lower);
  const syllables = analysis.syllables.length > 0
    ? analysis.syllables
    : splitSyllables(lower);

  const chunks = syllables.map((syl): PhoneticChunk => {
    const pronunciation = buildSyllablePronunciation(syl, analysis.phonemes);
    return { text: syl, pronunciation };
  });

  const summary = chunks.map(c => c.text).join(' · ');

  return {
    type: 'phonetic',
    chunks,
    summary: `Say it: ${summary}`,
  };
}

/**
 * Build a pronunciation string for a syllable by matching
 * phonemes that fall within the syllable's position range.
 */
function buildSyllablePronunciation(
  syllable: string,
  phonemes: Phoneme[],
): string {
  // Find phonemes that overlap with this syllable text
  const sylPhonemes = phonemes.filter(p => {
    // Check if this phoneme's grapheme appears in the syllable
    return syllable.includes(p.grapheme);
  });

  if (sylPhonemes.length > 0) {
    // Use unique phoneme symbols
    const seen = new Set<string>();
    const parts: string[] = [];
    for (const p of sylPhonemes) {
      if (!seen.has(p.phoneme)) {
        seen.add(p.phoneme);
        parts.push(p.phoneme);
      }
    }
    return parts.join('');
  }

  // Fallback: wrap syllable in slashes as basic phonetic
  return `/${syllable}/`;
}

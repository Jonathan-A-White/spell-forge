// src/core/memory-aids/tricky-part.ts — Find the "tricky part" of a word:
// the chunk most likely to be misspelled because it doesn't sound the way
// it's written (e.g. the "ue" in "pursue"). Used to spotlight that chunk
// in the word display during learning.

import type { DetectedPattern, PatternCategory, Phoneme } from '../../contracts/types.ts';
import { analyzeWord } from '../phonics/engine.ts';
import { findPatternById } from '../phonics/patterns.ts';

export interface TrickyPart {
  /** Character index in the (lowercased) word where the tricky chunk starts */
  start: number;
  /** Number of characters in the tricky chunk */
  length: number;
  /** The chunk as written, e.g. "ue" or "ake" */
  grapheme: string;
  /** Kid-friendly explanation, e.g. '"ue" says "oo" — like blue and glue.' */
  hint: string;
  /** Other words with the same pattern (the word itself is excluded) */
  examples: string[];
}

// Categories where spelling diverges most from sound, most confusing first
const TRICKY_PRIORITY: PatternCategory[] = [
  'irregular',
  'silent-letter',
  'long-vowel-silent-e',
  'vowel-team',
  'r-controlled',
];

/**
 * Find the single trickiest chunk of a word, or null when the word is
 * spelled the way it sounds (no spotlight needed).
 */
export function findTrickyPart(word: string): TrickyPart | null {
  const lower = word.toLowerCase().trim();
  const analysis = analyzeWord(lower);

  for (const category of TRICKY_PRIORITY) {
    const pattern = analysis.patterns.find(p => p.category === category);
    if (!pattern) continue;

    const phoneme = matchPhoneme(pattern, analysis.phonemes);
    if (!phoneme) continue;

    const entry = findPatternById(pattern.id);
    const examples = (entry?.examples ?? []).filter(ex => ex !== lower).slice(0, 3);

    return {
      start: phoneme.position,
      length: phoneme.length,
      grapheme: phoneme.grapheme,
      hint: pattern.hint,
      examples,
    };
  }

  return null;
}

/** Locate the phoneme produced by a detected pattern (it carries position data). */
function matchPhoneme(pattern: DetectedPattern, phonemes: Phoneme[]): Phoneme | null {
  for (const p of phonemes) {
    // Silent-e notation: "a_e" grapheme corresponds to a 3-char phoneme like "ake"
    if (pattern.grapheme.includes('_')) {
      const vowel = pattern.grapheme[0];
      if (p.grapheme.length === 3 && p.grapheme[0] === vowel && p.grapheme[2] === 'e') {
        return p;
      }
    } else if (p.grapheme === pattern.grapheme) {
      return p;
    }
  }
  return null;
}

// src/features/practice/error-hints.ts — Phonics hints targeted at the letters the child got wrong
//
// Maps the letter-level diff onto the word's detected phonics patterns so the
// comparison screen can explain the rule behind the error ("ai makes the long
// A sound, like in rain") instead of only showing which letters were wrong.
// Uses the patterns stored on the Word entity, which were analyzed with the
// correct language engine at import time.

import type { DetectedPattern } from '../../contracts/types';
import { computeLetterDiff } from './letter-diff';

export interface ErrorHint {
  /** Display form of the grapheme, e.g. "ai" or "a·e" for silent-e */
  grapheme: string;
  hint: string;
}

const MAX_HINTS = 2;

/**
 * Generate hints for the phonics patterns overlapping the error positions
 * in the correct word. Returns at most MAX_HINTS hints so a young child
 * isn't overwhelmed.
 */
export function getErrorTargetedHints(
  attempt: string,
  correct: string,
  patterns: DetectedPattern[],
): ErrorHint[] {
  if (patterns.length === 0) return [];

  const word = correct.toLowerCase().trim();
  const errorPositions = findErrorPositions(attempt, word);
  if (errorPositions.size === 0) return [];

  const hints: ErrorHint[] = [];
  const seenIds = new Set<string>();

  for (const pattern of patterns) {
    if (hints.length >= MAX_HINTS) break;
    if (seenIds.has(pattern.id)) continue;

    const spans = findPatternSpans(word, pattern);
    const overlapsError = spans.some((span) => {
      for (let i = span.start; i < span.end; i++) {
        if (errorPositions.has(i)) return true;
      }
      return false;
    });

    if (overlapsError) {
      seenIds.add(pattern.id);
      hints.push({
        grapheme: pattern.grapheme.replace('_', '·'),
        hint: pattern.hint,
      });
    }
  }

  return hints;
}

/**
 * Positions in the correct word involved in the error: letters the child
 * omitted/substituted, plus the insertion points of any extra letters.
 */
function findErrorPositions(attempt: string, correct: string): Set<number> {
  const { attemptDiff, correctDiff } = computeLetterDiff(attempt, correct);
  const positions = new Set<number>();

  // correctDiff is aligned 1:1 with the correct word's letters
  correctDiff.forEach((d, i) => {
    if (d.status === 'missing') positions.add(i);
  });

  // Extra letters in the attempt map to the insertion point in the correct
  // word: the number of matched letters seen so far.
  let matched = 0;
  for (const d of attemptDiff) {
    if (d.status === 'correct') {
      matched++;
    } else {
      positions.add(Math.min(matched, correct.length - 1));
    }
  }

  return positions;
}

/** Character spans of the word covered by a detected pattern's grapheme. */
function findPatternSpans(
  word: string,
  pattern: DetectedPattern,
): Array<{ start: number; end: number }> {
  const grapheme = pattern.grapheme;

  // Silent-e notation ("a_e"): vowel + consonant + final e
  if (grapheme.includes('_')) {
    const vowel = grapheme[0];
    for (let i = 0; i < word.length - 2; i++) {
      if (
        word[i] === vowel &&
        isConsonant(word[i + 1]) &&
        word[i + 2] === 'e' &&
        i + 2 === word.length - 1
      ) {
        return [{ start: i, end: i + 3 }];
      }
    }
    return [];
  }

  if (pattern.category === 'suffix') {
    return word.endsWith(grapheme)
      ? [{ start: word.length - grapheme.length, end: word.length }]
      : [];
  }

  if (pattern.category === 'prefix') {
    return word.startsWith(grapheme) ? [{ start: 0, end: grapheme.length }] : [];
  }

  // All other patterns: every occurrence of the grapheme
  const spans: Array<{ start: number; end: number }> = [];
  let idx = word.indexOf(grapheme);
  while (idx >= 0) {
    spans.push({ start: idx, end: idx + grapheme.length });
    idx = word.indexOf(grapheme, idx + 1);
  }
  return spans;
}

function isConsonant(ch: string): boolean {
  return /^[bcdfghjklmnpqrstvwxyz]$/i.test(ch);
}

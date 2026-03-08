// src/ocr/spell-check.ts — OCR post-processing spell correction
//
// Corrects common OCR misreads (e.g. "dlmost" → "almost", "pedce" → "peace")
// using a combination of OCR-specific character substitutions and edit-distance
// matching against a dictionary of common English words.

import { WORD_SET } from './word-list.ts';

/**
 * Single-character OCR confusions: [misread, intended].
 * These cover the most frequent character-level errors produced by
 * Tesseract and similar engines on printed English text.
 */
const CHAR_SUBSTITUTIONS: ReadonlyArray<[string, string]> = [
  ['d', 'a'],   // dlmost → almost, pedce → peace
  ['a', 'd'],
  ['a', 'o'],
  ['o', 'a'],
  ['l', 'i'],
  ['i', 'l'],
  ['0', 'o'],
  ['o', '0'],
  ['1', 'l'],
  ['l', '1'],
  ['1', 'i'],
  ['i', '1'],
  ['e', 'c'],
  ['c', 'e'],
  ['h', 'b'],
  ['b', 'h'],
  ['n', 'r'],
  ['r', 'n'],
  ['u', 'v'],
  ['v', 'u'],
  ['g', 'q'],
  ['q', 'g'],
  ['f', 't'],
  ['t', 'f'],
  ['s', '5'],
  ['5', 's'],
];

/**
 * Multi-character OCR confusions: [misread sequence, intended sequence].
 * These handle ligature-like misreads where multiple characters map to one
 * or vice versa.
 */
const MULTI_CHAR_SUBSTITUTIONS: ReadonlyArray<[string, string]> = [
  ['rn', 'm'],
  ['m', 'rn'],
  ['cl', 'd'],
  ['d', 'cl'],
  ['vv', 'w'],
  ['w', 'vv'],
  ['ii', 'u'],
  ['li', 'h'],
  ['ln', 'in'],
  ['nn', 'nn'],
];

/**
 * Correct common OCR misreads in a list of words.
 *
 * For each word:
 *  1. If it's already in the dictionary, keep it unchanged.
 *  2. Try multi-character substitutions first (they fix ligature-like errors).
 *  3. Try single-character substitutions at each position.
 *  4. Try all single-char subs within edit distance 2 (two substitutions).
 *  5. If no correction found, keep the original word.
 *
 * This is intentionally conservative — it only replaces a word when a
 * substitution produces an exact dictionary match.
 */
export function correctOcrWords(words: string[]): string[] {
  return words.map((word) => correctSingleWord(word));
}

function correctSingleWord(word: string): string {
  if (WORD_SET.has(word)) return word;

  // Try multi-character substitutions
  const multiResult = tryMultiCharSubs(word);
  if (multiResult !== null) return multiResult;

  // Try single-character substitutions (edit distance 1)
  const singleResult = trySingleCharSubs(word);
  if (singleResult !== null) return singleResult;

  // Try two single-character substitutions (edit distance 2)
  const doubleResult = tryDoubleCharSubs(word);
  if (doubleResult !== null) return doubleResult;

  return word;
}

/**
 * Try replacing each occurrence of a multi-character sequence with its
 * intended counterpart and check if the result is a dictionary word.
 */
function tryMultiCharSubs(word: string): string | null {
  for (const [misread, intended] of MULTI_CHAR_SUBSTITUTIONS) {
    let idx = word.indexOf(misread);
    while (idx !== -1) {
      const candidate = word.slice(0, idx) + intended + word.slice(idx + misread.length);
      if (WORD_SET.has(candidate)) return candidate;
      idx = word.indexOf(misread, idx + 1);
    }
  }
  return null;
}

/**
 * Try substituting one character at a time using the OCR confusion table.
 */
function trySingleCharSubs(word: string): string | null {
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    for (const [misread, intended] of CHAR_SUBSTITUTIONS) {
      if (ch === misread) {
        const candidate = word.slice(0, i) + intended + word.slice(i + 1);
        if (WORD_SET.has(candidate)) return candidate;
      }
    }
  }
  return null;
}

/**
 * Try two single-character substitutions (for words with multiple OCR errors).
 */
function tryDoubleCharSubs(word: string): string | null {
  for (let i = 0; i < word.length; i++) {
    const ch1 = word[i];
    for (const [misread1, intended1] of CHAR_SUBSTITUTIONS) {
      if (ch1 !== misread1) continue;
      const partial = word.slice(0, i) + intended1 + word.slice(i + 1);
      // Now try a second substitution on the partially-corrected word
      for (let j = 0; j < partial.length; j++) {
        if (j === i) continue; // skip the position we already changed
        const ch2 = partial[j];
        for (const [misread2, intended2] of CHAR_SUBSTITUTIONS) {
          if (ch2 === misread2) {
            const candidate = partial.slice(0, j) + intended2 + partial.slice(j + 1);
            if (WORD_SET.has(candidate)) return candidate;
          }
        }
      }
    }
  }
  return null;
}

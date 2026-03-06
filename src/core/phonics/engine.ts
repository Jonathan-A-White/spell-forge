// src/core/phonics/engine.ts — Main phonics analysis engine

import type { PhonicsResult, Phoneme, DetectedPattern } from '../../contracts/types.ts';
import { patterns, type PatternEntry } from './patterns.ts';
import { splitSyllables } from './syllabifier.ts';
import { generateHint } from './hints.ts';

// Patterns that use the "X_e" notation for silent-e (e.g., "a_e", "i_e")
const SILENT_E_BASE_PATTERNS = patterns.filter(
  p => p.category === 'long-vowel-silent-e' && /^[aeiou]_e$/.test(p.grapheme),
);

// More specific silent-e patterns (e.g., silent-e-a-ke, silent-e-i-ce)
const SILENT_E_SPECIFIC = patterns.filter(
  p => p.category === 'long-vowel-silent-e' && p.grapheme.includes('_') && p.id !== 'silent-e-a' && p.id !== 'silent-e-i' && p.id !== 'silent-e-o' && p.id !== 'silent-e-u',
);

// Non-silent-e patterns for direct substring matching, sorted by grapheme length desc
const DIRECT_PATTERNS = patterns
  .filter(p => !p.grapheme.includes('_'))
  .sort((a, b) => b.grapheme.length - a.grapheme.length);

/**
 * Analyze a word for phonics patterns, phonemes, syllables, and difficulty.
 */
export function analyzeWord(word: string): PhonicsResult {
  const lower = word.toLowerCase().trim();
  const syllables = splitSyllables(lower);
  const detectedPatterns = detectPatterns(lower);
  const phonemes = buildPhonemes(lower, detectedPatterns);
  const difficultyScore = computeDifficulty(lower, detectedPatterns, syllables);
  const scaffoldingHints = detectedPatterns.map(p => generateHint(p));
  const relatedWords = getRelatedWords(detectedPatterns);

  return {
    syllables,
    phonemes,
    patterns: detectedPatterns,
    difficultyScore,
    scaffoldingHints,
    relatedWords,
  };
}

/**
 * Get example words that share the same pattern.
 */
export function getPatternFamily(patternId: string): string[] {
  const entry = patterns.find(p => p.id === patternId);
  if (!entry) return [];
  return [...entry.examples];
}

// ─── Internal helpers ──────────────────────────────────────────

function detectPatterns(word: string): DetectedPattern[] {
  const detected: DetectedPattern[] = [];
  const usedIds = new Set<string>();
  // Track which character positions are "claimed" by higher-priority patterns
  const covered = new Array<boolean>(word.length).fill(false);

  // 1. Check silent-e patterns — pick the most specific match
  detectSilentEPatterns(word, detected, usedIds, covered);

  // 2. Check suffix patterns (match at end of word)
  detectPositionalPatterns(word, detected, usedIds, covered, 'suffix');

  // 3. Check prefix patterns (match at start of word)
  detectPositionalPatterns(word, detected, usedIds, covered, 'prefix');

  // 4. Check all other direct-match patterns (longer graphemes first, with coverage)
  detectDirectPatterns(word, detected, usedIds, covered);

  return detected;
}

function detectSilentEPatterns(
  word: string,
  detected: DetectedPattern[],
  usedIds: Set<string>,
  covered: boolean[],
): void {
  if (!word.endsWith('e') || word.length < 4) return;

  // Find the vowel-consonant-e position first
  let matchVowel = '';
  let matchPos = -1;
  for (let i = 0; i < word.length - 2; i++) {
    if (
      'aeiou'.includes(word[i]) &&
      isConsonant(word[i + 1]) &&
      word[i + 2] === 'e' &&
      i + 2 === word.length - 1
    ) {
      // Exclude cases where the vowel is preceded by another vowel (vowel team like "au")
      if (i > 0 && 'aeiouy'.includes(word[i - 1])) continue;
      matchVowel = word[i];
      matchPos = i;
      break;
    }
  }
  if (matchPos < 0) return;

  // Check if a specific silent-e pattern matches (e.g., silent-e-a-ke for "cake")
  const ending = word.slice(matchPos); // e.g., "ake" for cake
  let bestMatch: PatternEntry | null = null;

  for (const sp of SILENT_E_SPECIFIC) {
    if (sp.grapheme[0] !== matchVowel) continue;
    // Check if the word's ending matches this specific pattern's examples
    if (sp.examples.some(ex => ex.endsWith(ending))) {
      bestMatch = sp;
      break;
    }
  }

  // Fall back to the base pattern (e.g., silent-e-a)
  if (!bestMatch) {
    bestMatch = SILENT_E_BASE_PATTERNS.find(p => p.grapheme[0] === matchVowel) ?? null;
  }

  if (bestMatch) {
    detected.push({
      id: bestMatch.id,
      category: bestMatch.category,
      grapheme: bestMatch.grapheme,
      hint: bestMatch.hint,
    });
    usedIds.add(bestMatch.id);
    // Mark the vowel-consonant-e positions as covered
    for (let j = matchPos; j <= matchPos + 2 && j < word.length; j++) {
      covered[j] = true;
    }
  }
}

function detectPositionalPatterns(
  word: string,
  detected: DetectedPattern[],
  usedIds: Set<string>,
  covered: boolean[],
  position: 'prefix' | 'suffix',
): void {
  const matchPatterns = DIRECT_PATTERNS.filter(p => p.category === position);
  // Track which grapheme has been matched for this position to avoid duplicates
  let matchedGrapheme = '';

  for (const pattern of matchPatterns) {
    if (usedIds.has(pattern.id)) continue;

    const grapheme = pattern.grapheme;
    const matches =
      position === 'suffix'
        ? word.endsWith(grapheme) && word.length > grapheme.length
        : word.startsWith(grapheme) && word.length > grapheme.length;

    if (matches) {
      // Only allow one match per grapheme for positional patterns
      if (matchedGrapheme === grapheme) continue;

      detected.push({
        id: pattern.id,
        category: pattern.category,
        grapheme: pattern.grapheme,
        hint: pattern.hint,
      });
      usedIds.add(pattern.id);
      matchedGrapheme = grapheme;

      // Mark covered positions
      if (position === 'suffix') {
        const start = word.length - grapheme.length;
        for (let j = start; j < word.length; j++) covered[j] = true;
      } else {
        for (let j = 0; j < grapheme.length; j++) covered[j] = true;
      }
    }
  }
}

function detectDirectPatterns(
  word: string,
  detected: DetectedPattern[],
  usedIds: Set<string>,
  covered: boolean[],
): void {
  const nonPositional = DIRECT_PATTERNS.filter(
    p => p.category !== 'suffix' && p.category !== 'prefix',
  );

  // Track which grapheme at which position has been matched (to prevent
  // multiple patterns with the same grapheme, like th-voiced and th-unvoiced)
  const matchedGraphemePositions = new Set<string>();

  for (const pattern of nonPositional) {
    if (usedIds.has(pattern.id)) continue;

    const grapheme = pattern.grapheme;
    const idx = word.indexOf(grapheme);
    if (idx < 0) continue;

    // Skip if positions are already covered by a higher-priority pattern
    const posKey = `${grapheme}@${idx}`;
    if (matchedGraphemePositions.has(posKey)) continue;

    // For short vowels, check if the vowel position is already covered
    // by a vowel team or other higher-priority pattern
    if (pattern.category === 'short-vowel') {
      if (covered[idx]) continue;
      if (!isShortVowelContext(word, pattern)) continue;
    } else {
      // For non-short-vowel patterns, check if any position is covered
      let anyCovered = false;
      for (let j = idx; j < idx + grapheme.length; j++) {
        if (covered[j]) { anyCovered = true; break; }
      }
      if (anyCovered) continue;
    }

    detected.push({
      id: pattern.id,
      category: pattern.category,
      grapheme: pattern.grapheme,
      hint: pattern.hint,
    });
    usedIds.add(pattern.id);
    matchedGraphemePositions.add(posKey);

    // Mark positions as covered (for multi-character graphemes)
    if (grapheme.length > 1) {
      for (let j = idx; j < idx + grapheme.length; j++) {
        if (j < covered.length) covered[j] = true;
      }
    }
  }
}

function isShortVowelContext(word: string, pattern: PatternEntry): boolean {
  const vowel = pattern.grapheme;

  // Contextual short-vowel patterns (e.g., short-i-dge) must match their specific
  // context — the vowel must actually precede the specific ending in the word.
  const contextSuffixes: Record<string, string> = {
    '-dge': 'dge', '-ck': 'ck', '-ng': 'ng', '-ll': 'll',
    '-ff': 'ff', '-nk': 'nk', '-tch': 'tch',
  };

  for (const [idSuffix, ending] of Object.entries(contextSuffixes)) {
    if (pattern.id.includes(idSuffix)) {
      // This is a contextual pattern — only match if vowel directly precedes the ending
      const endIdx = word.indexOf(ending);
      if (endIdx > 0 && word[endIdx - 1] === vowel) return true;
      return false; // contextual pattern but context not found — don't fall through
    }
  }

  // Generic short vowel: only match if vowel is in a CVC context
  const idx = word.indexOf(vowel);
  if (idx < 0) return false;
  // Vowel followed by a consonant, not followed by 'e' at end (silent-e) or another vowel
  if (idx + 1 < word.length && isConsonant(word[idx + 1])) {
    // Not a silent-e pattern
    if (idx + 2 === word.length) return true; // CVC at end
    if (idx + 2 < word.length && isConsonant(word[idx + 2])) return true; // CVCC
    // Not followed by vowel-e
    if (idx + 2 < word.length && word[idx + 2] !== 'e') return true;
  }
  return false;
}

function buildPhonemes(word: string, detectedPatterns: DetectedPattern[]): Phoneme[] {
  const phonemes: Phoneme[] = [];
  const covered = new Array<boolean>(word.length).fill(false);

  // Sort patterns by grapheme length descending for greedy matching
  const sortedDetected = [...detectedPatterns].sort(
    (a, b) => b.grapheme.length - a.grapheme.length,
  );

  for (const dp of sortedDetected) {
    const entry = patterns.find(p => p.id === dp.id);
    if (!entry) continue;

    const grapheme = entry.grapheme;

    // Handle silent-e notation (e.g., "a_e")
    if (grapheme.includes('_')) {
      const vowel = grapheme[0];
      for (let i = 0; i < word.length - 2; i++) {
        if (word[i] === vowel && !covered[i] && isConsonant(word[i + 1]) && word[i + 2] === 'e') {
          phonemes.push({
            grapheme: word.slice(i, i + 3),
            phoneme: entry.phoneme,
            position: i,
            length: 3,
          });
          covered[i] = true;
          covered[i + 1] = true;
          covered[i + 2] = true;
          break;
        }
      }
      continue;
    }

    // For suffix patterns, match from the end
    if (entry.category === 'suffix' && word.endsWith(grapheme)) {
      const pos = word.length - grapheme.length;
      let alreadyCovered = false;
      for (let j = pos; j < word.length; j++) {
        if (covered[j]) { alreadyCovered = true; break; }
      }
      if (!alreadyCovered) {
        phonemes.push({
          grapheme,
          phoneme: entry.phoneme,
          position: pos,
          length: grapheme.length,
        });
        for (let j = pos; j < word.length; j++) covered[j] = true;
      }
      continue;
    }

    // For prefix patterns, match from the start
    if (entry.category === 'prefix' && word.startsWith(grapheme)) {
      let alreadyCovered = false;
      for (let j = 0; j < grapheme.length; j++) {
        if (covered[j]) { alreadyCovered = true; break; }
      }
      if (!alreadyCovered) {
        phonemes.push({
          grapheme,
          phoneme: entry.phoneme,
          position: 0,
          length: grapheme.length,
        });
        for (let j = 0; j < grapheme.length; j++) covered[j] = true;
      }
      continue;
    }

    // General substring match
    const idx = word.indexOf(grapheme);
    if (idx >= 0) {
      let alreadyCovered = false;
      for (let j = idx; j < idx + grapheme.length; j++) {
        if (covered[j]) { alreadyCovered = true; break; }
      }
      if (!alreadyCovered) {
        phonemes.push({
          grapheme,
          phoneme: entry.phoneme,
          position: idx,
          length: grapheme.length,
        });
        for (let j = idx; j < idx + grapheme.length; j++) covered[j] = true;
      }
    }
  }

  // Fill uncovered single letters with basic phonemes
  for (let i = 0; i < word.length; i++) {
    if (!covered[i]) {
      phonemes.push({
        grapheme: word[i],
        phoneme: `/${word[i]}/`,
        position: i,
        length: 1,
      });
    }
  }

  // Sort by position
  phonemes.sort((a, b) => a.position - b.position);

  return phonemes;
}

function computeDifficulty(
  word: string,
  detectedPatterns: DetectedPattern[],
  syllables: string[],
): number {
  let score = 0;

  // Base difficulty from word length (0-0.2)
  score += Math.min(word.length / 50, 0.2);

  // Syllable count contributes (0-0.2)
  score += Math.min((syllables.length - 1) * 0.05, 0.2);

  // Pattern count contributes (0-0.4)
  score += Math.min(detectedPatterns.length * 0.08, 0.4);

  // Certain categories are harder
  const hardCategories = new Set(['silent-letter', 'irregular', 'vowel-team', 'r-controlled']);
  const hardPatternCount = detectedPatterns.filter(p => hardCategories.has(p.category)).length;
  score += Math.min(hardPatternCount * 0.05, 0.2);

  return Math.min(Math.round(score * 100) / 100, 1.0);
}

function getRelatedWords(detectedPatterns: DetectedPattern[]): string[] {
  const words = new Set<string>();
  for (const dp of detectedPatterns) {
    const entry = patterns.find(p => p.id === dp.id);
    if (entry) {
      for (const ex of entry.examples) {
        words.add(ex);
      }
    }
  }
  return [...words].slice(0, 10);
}

function isConsonant(ch: string): boolean {
  return /^[bcdfghjklmnpqrstvwxyz]$/i.test(ch);
}

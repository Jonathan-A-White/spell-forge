// src/core/phonics/engine.ts — Main phonics analysis engine

import type { PhonicsResult, Phoneme, DetectedPattern } from '../../contracts/types.ts';
import { patterns, type PatternEntry } from './patterns.ts';
import { splitSyllables } from './syllabifier.ts';
import { generateHint } from './hints.ts';

// Patterns sorted by grapheme length descending so longer matches take priority
const sortedPatterns = [...patterns].sort(
  (a, b) => b.grapheme.length - a.grapheme.length,
);

// Patterns that use the "X_e" notation for silent-e (e.g., "a_e", "i_e")
const SILENT_E_PATTERNS = sortedPatterns.filter(
  p => p.category === 'long-vowel-silent-e' && p.grapheme.includes('_'),
);

// Non-silent-e patterns for direct substring matching
const DIRECT_PATTERNS = sortedPatterns.filter(
  p => !p.grapheme.includes('_'),
);

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

  // 1. Check silent-e patterns (a_e, i_e, o_e, u_e)
  detectSilentEPatterns(word, detected, usedIds);

  // 2. Check suffix patterns (match at end of word)
  detectPositionalPatterns(word, detected, usedIds, 'suffix');

  // 3. Check prefix patterns (match at start of word)
  detectPositionalPatterns(word, detected, usedIds, 'prefix');

  // 4. Check all other direct-match patterns
  detectDirectPatterns(word, detected, usedIds);

  return detected;
}

function detectSilentEPatterns(
  word: string,
  detected: DetectedPattern[],
  usedIds: Set<string>,
): void {
  if (!word.endsWith('e') || word.length < 4) return;

  for (const pattern of SILENT_E_PATTERNS) {
    if (usedIds.has(pattern.id)) continue;
    const vowel = pattern.grapheme[0];
    // Look for vowel-consonant-e pattern
    for (let i = 0; i < word.length - 2; i++) {
      if (
        word[i] === vowel &&
        isConsonant(word[i + 1]) &&
        word[i + 2] === 'e' &&
        (i + 2 === word.length - 1) // the 'e' is at the end (or near end)
      ) {
        // Verify this word is in the examples or it broadly matches
        detected.push({
          id: pattern.id,
          category: pattern.category,
          grapheme: pattern.grapheme,
          hint: pattern.hint,
        });
        usedIds.add(pattern.id);
        break;
      }
    }
  }
}

function detectPositionalPatterns(
  word: string,
  detected: DetectedPattern[],
  usedIds: Set<string>,
  position: 'prefix' | 'suffix',
): void {
  const matchPatterns = DIRECT_PATTERNS.filter(p => p.category === position);

  for (const pattern of matchPatterns) {
    if (usedIds.has(pattern.id)) continue;

    const grapheme = pattern.grapheme;
    const matches =
      position === 'suffix'
        ? word.endsWith(grapheme) && word.length > grapheme.length
        : word.startsWith(grapheme) && word.length > grapheme.length;

    if (matches) {
      detected.push({
        id: pattern.id,
        category: pattern.category,
        grapheme: pattern.grapheme,
        hint: pattern.hint,
      });
      usedIds.add(pattern.id);
    }
  }
}

function detectDirectPatterns(
  word: string,
  detected: DetectedPattern[],
  usedIds: Set<string>,
): void {
  const nonPositional = DIRECT_PATTERNS.filter(
    p => p.category !== 'suffix' && p.category !== 'prefix',
  );

  for (const pattern of nonPositional) {
    if (usedIds.has(pattern.id)) continue;

    if (word.includes(pattern.grapheme)) {
      // For short vowels, be more selective — only match if the vowel is in a
      // short-vowel context (not followed by another vowel or silent-e)
      if (pattern.category === 'short-vowel') {
        if (!isShortVowelContext(word, pattern)) continue;
      }

      detected.push({
        id: pattern.id,
        category: pattern.category,
        grapheme: pattern.grapheme,
        hint: pattern.hint,
      });
      usedIds.add(pattern.id);
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

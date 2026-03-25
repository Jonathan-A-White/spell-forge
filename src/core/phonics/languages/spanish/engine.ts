// src/core/phonics/languages/spanish/engine.ts — Spanish phonics analysis engine.

import type { PhonicsResult, Phoneme, DetectedPattern } from '../../../../contracts/types.ts';
import { spanishPatterns } from './patterns.ts';
import { splitSpanishSyllables } from './syllabifier.ts';

// Pre-sort patterns by grapheme length descending for greedy matching.
const SORTED_PATTERNS = [...spanishPatterns].sort(
  (a, b) => b.grapheme.length - a.grapheme.length,
);

// Context-sensitive consonant patterns (c, g) need special handling.
const CONTEXT_SENSITIVE_IDS = new Set([
  'es-c-soft', 'es-c-hard', 'es-g-soft', 'es-g-hard', 'es-gu-ei',
]);

/**
 * Analyze a Spanish word for phonics patterns, phonemes, syllables, and difficulty.
 */
export function analyzeSpanishWord(word: string): PhonicsResult {
  const lower = word.toLowerCase().trim();
  const syllables = splitSpanishSyllables(lower);
  const detectedPatterns = detectPatterns(lower);
  const phonemes = buildPhonemes(lower, detectedPatterns);
  const difficultyScore = computeDifficulty(lower, detectedPatterns, syllables);
  const scaffoldingHints = detectedPatterns.map((p) => p.hint);
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

// ─── Internal helpers ────────────────────────────────────────

function detectPatterns(word: string): DetectedPattern[] {
  const detected: DetectedPattern[] = [];
  const usedIds = new Set<string>();
  const covered = new Array<boolean>(word.length).fill(false);

  // Silent h
  detectSilentH(word, detected, usedIds, covered);

  // Digraphs first (ch, ll, rr, qu, gu)
  detectDigraphs(word, detected, usedIds, covered);

  // Context-sensitive consonants (c before e/i, g before e/i)
  detectContextConsonants(word, detected, usedIds, covered);

  // Diphthongs
  detectDiphthongs(word, detected, usedIds, covered);

  // Accented vowels
  detectAccents(word, detected, usedIds);

  // Special consonants (ñ, j, z, v, y, x)
  detectSpecialConsonants(word, detected, usedIds);

  return detected;
}

function detectSilentH(word: string, detected: DetectedPattern[], usedIds: Set<string>, covered: boolean[]): void {
  const pattern = spanishPatterns.find((p) => p.id === 'es-h-silent')!;
  for (let i = 0; i < word.length; i++) {
    if (word[i] === 'h' && !covered[i]) {
      // Don't match 'h' in 'ch'
      if (i > 0 && word[i - 1] === 'c') continue;
      if (!usedIds.has(pattern.id)) {
        detected.push({
          id: pattern.id,
          category: pattern.category,
          grapheme: pattern.grapheme,
          hint: pattern.hint,
        });
        usedIds.add(pattern.id);
      }
      covered[i] = true;
    }
  }
}

function detectDigraphs(word: string, detected: DetectedPattern[], usedIds: Set<string>, covered: boolean[]): void {
  const digraphPatterns = spanishPatterns.filter(
    (p) => p.category === 'es-digraph' && !CONTEXT_SENSITIVE_IDS.has(p.id),
  );

  for (const pattern of digraphPatterns) {
    const g = pattern.grapheme;
    let idx = word.indexOf(g);
    while (idx >= 0) {
      let anyCovered = false;
      for (let j = idx; j < idx + g.length; j++) {
        if (covered[j]) { anyCovered = true; break; }
      }
      if (!anyCovered && !usedIds.has(pattern.id)) {
        // For 'qu' and 'gu', verify they're before e/i
        if (pattern.id === 'es-qu' || pattern.id === 'es-gu-ei') {
          const nextChar = word[idx + g.length];
          if (nextChar !== 'e' && nextChar !== 'i' && nextChar !== '\u00e9' && nextChar !== '\u00ed') {
            idx = word.indexOf(g, idx + 1);
            continue;
          }
        }
        detected.push({
          id: pattern.id,
          category: pattern.category,
          grapheme: pattern.grapheme,
          hint: pattern.hint,
        });
        usedIds.add(pattern.id);
        for (let j = idx; j < idx + g.length; j++) covered[j] = true;
      }
      idx = word.indexOf(g, idx + 1);
    }
  }
}

function detectContextConsonants(word: string, detected: DetectedPattern[], usedIds: Set<string>, covered: boolean[]): void {
  for (let i = 0; i < word.length; i++) {
    if (covered[i]) continue;
    const ch = word[i];
    const next = word[i + 1] ?? '';
    const isSoftContext = 'ei\u00e9\u00ed'.includes(next);

    if (ch === 'c') {
      const id = isSoftContext ? 'es-c-soft' : 'es-c-hard';
      if (!usedIds.has(id)) {
        const pattern = spanishPatterns.find((p) => p.id === id)!;
        detected.push({ id, category: pattern.category, grapheme: pattern.grapheme, hint: pattern.hint });
        usedIds.add(id);
      }
    } else if (ch === 'g' && !covered[i]) {
      // Skip if this 'g' is part of 'gu' digraph already covered
      if (i + 1 < word.length && word[i + 1] === 'u' && covered[i + 1]) continue;
      const id = isSoftContext ? 'es-g-soft' : 'es-g-hard';
      if (!usedIds.has(id)) {
        const pattern = spanishPatterns.find((p) => p.id === id)!;
        detected.push({ id, category: pattern.category, grapheme: pattern.grapheme, hint: pattern.hint });
        usedIds.add(id);
      }
    }
  }
}

function detectDiphthongs(word: string, detected: DetectedPattern[], usedIds: Set<string>, covered: boolean[]): void {
  const diphthongPatterns = spanishPatterns.filter((p) => p.category === 'es-diphthong');
  for (const pattern of diphthongPatterns) {
    if (usedIds.has(pattern.id)) continue;
    const g = pattern.grapheme;
    const idx = word.indexOf(g);
    if (idx >= 0 && !covered[idx] && !covered[idx + 1]) {
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

function detectAccents(word: string, detected: DetectedPattern[], usedIds: Set<string>): void {
  const accentPatterns = spanishPatterns.filter((p) => p.category === 'es-accent');
  for (const pattern of accentPatterns) {
    if (usedIds.has(pattern.id)) continue;
    if (word.includes(pattern.grapheme)) {
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

function detectSpecialConsonants(word: string, detected: DetectedPattern[], usedIds: Set<string>): void {
  const specials = spanishPatterns.filter(
    (p) => p.category === 'es-special-consonant' && !CONTEXT_SENSITIVE_IDS.has(p.id),
  );
  for (const pattern of specials) {
    if (usedIds.has(pattern.id)) continue;
    if (word.includes(pattern.grapheme)) {
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

function buildPhonemes(word: string, detectedPatterns: DetectedPattern[]): Phoneme[] {
  const phonemes: Phoneme[] = [];
  const covered = new Array<boolean>(word.length).fill(false);

  // Match multi-character patterns first (greedy)
  for (const dp of detectedPatterns) {
    const entry = spanishPatterns.find((p) => p.id === dp.id);
    if (!entry || entry.grapheme.length <= 1) continue;

    const idx = word.indexOf(entry.grapheme);
    if (idx < 0) continue;

    let anyCovered = false;
    for (let j = idx; j < idx + entry.grapheme.length; j++) {
      if (covered[j]) { anyCovered = true; break; }
    }
    if (anyCovered) continue;

    phonemes.push({
      grapheme: entry.grapheme,
      phoneme: entry.phoneme,
      position: idx,
      length: entry.grapheme.length,
    });
    for (let j = idx; j < idx + entry.grapheme.length; j++) covered[j] = true;
  }

  // Fill remaining characters with basic phonemes
  for (let i = 0; i < word.length; i++) {
    if (!covered[i]) {
      const ch = word[i];
      // Look up single-char pattern
      const entry = SORTED_PATTERNS.find(
        (p) => p.grapheme === ch && p.grapheme.length === 1,
      );
      phonemes.push({
        grapheme: ch,
        phoneme: entry?.phoneme ?? `/${ch}/`,
        position: i,
        length: 1,
      });
    }
  }

  phonemes.sort((a, b) => a.position - b.position);
  return phonemes;
}

function computeDifficulty(
  word: string,
  detectedPatterns: DetectedPattern[],
  syllables: string[],
): number {
  let score = 0;

  // Word length (0-0.15) — Spanish words tend to be longer
  score += Math.min(word.length / 60, 0.15);

  // Syllable count (0-0.2)
  score += Math.min((syllables.length - 1) * 0.04, 0.2);

  // Accent marks add difficulty (kids often forget them)
  const accentCount = detectedPatterns.filter((p) => p.category === 'es-accent').length;
  score += Math.min(accentCount * 0.1, 0.25);

  // Silent h
  if (detectedPatterns.some((p) => p.id === 'es-h-silent')) {
    score += 0.1;
  }

  // Context-sensitive consonants (c/z, g/j confusion)
  const contextCount = detectedPatterns.filter(
    (p) => p.category === 'es-special-consonant',
  ).length;
  score += Math.min(contextCount * 0.05, 0.15);

  // b/v confusion
  if (detectedPatterns.some((p) => p.id === 'es-v')) {
    score += 0.05;
  }

  return Math.min(Math.round(score * 100) / 100, 1.0);
}

function getRelatedWords(detectedPatterns: DetectedPattern[]): string[] {
  const words = new Set<string>();
  for (const dp of detectedPatterns) {
    const entry = spanishPatterns.find((p) => p.id === dp.id);
    if (entry) {
      for (const ex of entry.examples) words.add(ex);
    }
  }
  return [...words].slice(0, 10);
}

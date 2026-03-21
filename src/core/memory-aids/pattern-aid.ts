// src/core/memory-aids/pattern-aid.ts — "Pattern Spotter" memory aid

import type {
  PatternAid,
  PatternSegment,
  PatternTip,
  DetectedPattern,
  Phoneme,
} from '../../contracts/types.ts';
import { analyzeWord } from '../phonics/engine.ts';
import { findPatternById } from '../phonics/patterns.ts';

/**
 * Generate a pattern-highlighting aid for a word.
 * Highlights common English spelling patterns within the word
 * with color coding and teaching tips.
 */
export function generatePatternAid(word: string): PatternAid {
  const lower = word.toLowerCase().trim();
  const analysis = analyzeWord(lower);

  // Limit to 3 unique patterns so highlights and tips stay in sync
  const limitedPatterns = limitUniquePatterns(analysis.patterns, 3);

  const segments = buildSegments(lower, analysis.phonemes, limitedPatterns);
  const tips = buildTips(limitedPatterns);

  return {
    type: 'pattern',
    segments,
    tips,
  };
}

/**
 * Build colored segments of the word where detected patterns
 * are highlighted with different color indices.
 */
function buildSegments(
  word: string,
  phonemes: Phoneme[],
  detectedPatterns: DetectedPattern[],
): PatternSegment[] {
  // Create a map of position → pattern info using phonemes
  // (phonemes have position data from the analysis engine)
  const positionMap = new Array<{ patternId: string; colorIndex: number } | null>(word.length).fill(null);

  // Assign colors to patterns (1-indexed, max 4 colors)
  const patternColorMap = new Map<string, number>();
  let colorCounter = 0;
  for (const dp of detectedPatterns) {
    if (!patternColorMap.has(dp.id)) {
      colorCounter++;
      patternColorMap.set(dp.id, ((colorCounter - 1) % 4) + 1);
    }
  }

  // Map phonemes that correspond to detected patterns onto positions
  for (const phoneme of phonemes) {
    // Find a matching detected pattern for this phoneme's grapheme
    const matchingPattern = detectedPatterns.find(dp => {
      // Handle silent-e notation: "a_e" grapheme maps to 3-char phoneme grapheme
      if (dp.grapheme.includes('_')) {
        const vowel = dp.grapheme[0];
        return phoneme.grapheme.length === 3 &&
          phoneme.grapheme[0] === vowel &&
          phoneme.grapheme[2] === 'e';
      }
      return dp.grapheme === phoneme.grapheme;
    });

    if (matchingPattern) {
      const color = patternColorMap.get(matchingPattern.id) ?? 1;
      for (let i = phoneme.position; i < phoneme.position + phoneme.length && i < word.length; i++) {
        positionMap[i] = { patternId: matchingPattern.id, colorIndex: color };
      }
    }
  }

  // Build segments by grouping consecutive characters with same pattern
  const segments: PatternSegment[] = [];
  let i = 0;
  while (i < word.length) {
    const info = positionMap[i];
    const patternId = info?.patternId ?? null;
    const colorIndex = info?.colorIndex ?? 0;

    let text = word[i];
    let j = i + 1;
    while (j < word.length) {
      const nextInfo = positionMap[j];
      const nextPatternId = nextInfo?.patternId ?? null;
      if (nextPatternId === patternId) {
        text += word[j];
        j++;
      } else {
        break;
      }
    }

    segments.push({ text, patternId, colorIndex });
    i = j;
  }

  return segments;
}

/**
 * Build teaching tips for detected patterns.
 */
function buildTips(detectedPatterns: DetectedPattern[]): PatternTip[] {
  const tips: PatternTip[] = [];
  const seen = new Set<string>();

  for (const dp of detectedPatterns) {
    // Skip duplicate graphemes (e.g., two short vowels)
    if (seen.has(dp.grapheme)) continue;
    seen.add(dp.grapheme);

    const entry = findPatternById(dp.id);
    const displayGrapheme = dp.grapheme.includes('_')
      ? dp.grapheme.replace('_', '·')
      : dp.grapheme;

    tips.push({
      pattern: displayGrapheme,
      hint: dp.hint,
      examples: entry?.examples.slice(0, 3) ?? [],
    });
  }

  return tips;
}

/**
 * Keep only patterns whose grapheme is among the first `max` unique graphemes.
 * This ensures highlights and tips stay in sync (no color without a tip).
 */
function limitUniquePatterns(patterns: DetectedPattern[], max: number): DetectedPattern[] {
  const seen = new Set<string>();
  const allowedGraphemes = new Set<string>();

  for (const dp of patterns) {
    if (!seen.has(dp.grapheme)) {
      if (seen.size >= max) break;
      seen.add(dp.grapheme);
      allowedGraphemes.add(dp.grapheme);
    }
  }

  return patterns.filter(dp => allowedGraphemes.has(dp.grapheme));
}

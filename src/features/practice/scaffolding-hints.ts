// src/features/practice/scaffolding-hints.ts — Hints shown when scaffolding is active
//
// Builds the rule hints for re-presented missed words and adaptive support.
// Hints only — never syllable chunks or the spelling itself, so the retrieval
// attempt stays genuine. When the word carries a morphological suffix, the
// first hint shows the base word + suffix decomposition (e.g. "jumping =
// jump + ing") — morphology instruction transfers to untrained words.

import type { DetectedPattern, Word } from '../../contracts/types';

const MAX_HINTS = 2;

/**
 * Suffix pattern ids that mark true morphological suffixes (inflections and
 * derivations with a meaningful base word). Phonics-chunk "suffixes" like
 * -tion or -ture are excluded — "na + tion" is not a real decomposition.
 */
const MORPHOLOGICAL_SUFFIX_IDS = new Set([
  'sx-ing',
  'sx-ed-d',
  'sx-ed-t',
  'sx-ed-id',
  'sx-ly',
  'sx-ful',
  'sx-less',
  'sx-ness',
  'sx-ment',
  'sx-able',
  'sx-er-comp',
  'sx-est',
  'sx-en',
  'sx-es',
  'sx-s',
]);

/**
 * Hints for the current word while scaffolding is active: a base + suffix
 * decomposition when one can be shown safely, then the word's pattern hints,
 * capped so a young child isn't overwhelmed.
 */
export function getScaffoldingHints(word: Word): string[] {
  const decomposition = getSuffixDecompositionHint(word.text, word.patterns);
  const patternHints = word.patterns.map((p) => p.hint);
  const hints = decomposition ? [decomposition, ...patternHints] : patternHints;
  return hints.slice(0, MAX_HINTS);
}

/**
 * Build a "base + suffix" hint for the first morphological suffix pattern,
 * or null when stripping the suffix wouldn't leave the base word intact.
 */
export function getSuffixDecompositionHint(
  text: string,
  patterns: DetectedPattern[],
): string | null {
  const word = text.toLowerCase().trim();

  for (const pattern of patterns) {
    if (pattern.category !== 'suffix') continue;
    if (!MORPHOLOGICAL_SUFFIX_IDS.has(pattern.id)) continue;

    const suffix = pattern.grapheme;
    if (!word.endsWith(suffix) || word.length <= suffix.length) continue;

    const base = word.slice(0, word.length - suffix.length);
    if (baseIsIntact(base, suffix)) {
      return `${word} = ${base} + ${suffix}`;
    }
  }

  return null;
}

/**
 * Whether the letters before the suffix form the unchanged base word.
 * Suffix spelling rules alter the base in ways we can't reverse without a
 * dictionary, so any base that *could* have been altered is rejected —
 * skipping a valid decomposition is fine, showing a wrong one is not.
 */
function baseIsIntact(base: string, suffix: string): boolean {
  if (base.length < 3) return false;

  const last = base[base.length - 1];
  const prev = base[base.length - 2];

  // Doubling rule leftover ("hopping" → "hopp"): indistinguishable from a
  // genuine double ("spelling" → "spell") without a dictionary.
  if (isConsonant(last) && last === prev) return false;

  // y → i change ("happiness" → "happi").
  if (last === 'i') return false;

  if (isVowel(suffix[0])) {
    // Drop-e rule ("making" → "mak"): a base ending consonant-vowel-consonant
    // may have lost its silent e — can't tell "mak" from "jump"-style bases.
    if (
      isConsonant(last) &&
      isVowel(prev) &&
      isConsonant(base[base.length - 3])
    ) {
      return false;
    }
    // A surviving final e before a vowel suffix means the engine mis-split
    // ("agreed" → "agre" + "ed" instead of "agree" + "d").
    if (last === 'e' && isConsonant(prev)) return false;
  }

  return true;
}

function isVowel(ch: string): boolean {
  // Word-final y acts as a vowel ("play" + "ing")
  return /^[aeiouy]$/i.test(ch);
}

function isConsonant(ch: string): boolean {
  return /^[bcdfghjklmnpqrstvwxz]$/i.test(ch);
}

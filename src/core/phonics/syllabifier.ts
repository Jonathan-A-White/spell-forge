// src/core/phonics/syllabifier.ts — English syllabification

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);

const COMMON_PREFIXES = [
  'un', 're', 'pre', 'dis', 'mis', 'over', 'under', 'out', 'sub', 'super',
  'trans', 'non', 'inter', 'fore', 'de', 'be', 'ex', 'im', 'in', 'en',
];

const COMMON_SUFFIXES = [
  'tion', 'sion', 'ness', 'ment', 'able', 'ible', 'ful', 'less', 'ous',
  'ious', 'ing', 'ture', 'ly', 'ed', 'er', 'est', 'al', 'en',
];

// Consonant clusters that should not be split (valid onsets)
const ONSET_CLUSTERS = new Set([
  'bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr',
  'sc', 'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'sw', 'tr', 'tw', 'wr',
  'scr', 'spl', 'spr', 'str', 'shr', 'thr', 'sch', 'chr',
  'ch', 'sh', 'th', 'wh', 'ph', 'qu', 'kn', 'gn',
]);

function isVowel(ch: string): boolean {
  return VOWELS.has(ch.toLowerCase());
}

function isConsonant(ch: string): boolean {
  return /[a-z]/i.test(ch) && !isVowel(ch);
}

function canBeOnset(cluster: string): boolean {
  if (cluster.length <= 1) return true;
  return ONSET_CLUSTERS.has(cluster.toLowerCase());
}

/**
 * Split a word into syllables using English syllabification heuristics.
 * Handles VC/CV splits, consonant clusters, and common prefixes/suffixes.
 */
export function splitSyllables(word: string): string[] {
  const lower = word.toLowerCase().trim();

  if (lower.length <= 3) return [lower];

  // Handle silent-e: don't count trailing "e" as a syllable nucleus
  const hasTrailingSilentE =
    lower.endsWith('e') &&
    lower.length > 3 &&
    isConsonant(lower[lower.length - 2]) &&
    !lower.endsWith('le');

  // Try suffix-aware splitting
  let suffix = '';
  let stem = lower;
  for (const sx of COMMON_SUFFIXES) {
    if (lower.endsWith(sx) && lower.length > sx.length + 1) {
      suffix = sx;
      stem = lower.slice(0, lower.length - sx.length);
      break;
    }
  }

  // Try prefix-aware splitting
  let prefix = '';
  for (const px of COMMON_PREFIXES) {
    if (stem.startsWith(px) && stem.length > px.length + 1) {
      // The remaining stem after removing prefix should start with a consonant
      // or be a valid word start
      const remainder = stem.slice(px.length);
      if (remainder.length >= 2) {
        prefix = px;
        stem = remainder;
        break;
      }
    }
  }

  // Core syllabification on the stem
  const syllables = syllabifyCore(stem, hasTrailingSilentE && !suffix);

  // Re-attach prefix and suffix
  if (prefix && syllables.length > 0) {
    syllables.unshift(prefix);
  }
  if (suffix) {
    // Suffixes like "-tion", "-sion", "-ture" are single syllables
    // Suffixes like "-able", "-ible" might be two but treat as one for simplicity
    syllables.push(suffix);
  }

  // Filter empty strings
  return syllables.filter(s => s.length > 0);
}

function syllabifyCore(word: string, hasSilentE: boolean): string[] {
  if (word.length <= 3) return [word];

  const effectiveEnd = hasSilentE ? word.length - 1 : word.length;
  const syllables: string[] = [];
  let current = '';

  let i = 0;
  while (i < word.length) {
    current += word[i];

    // Check if we've found a vowel (potential syllable nucleus)
    if (i < effectiveEnd && isVowel(word[i])) {
      // Consume consecutive vowels (vowel teams)
      while (i + 1 < word.length && isVowel(word[i + 1])) {
        i++;
        current += word[i];
      }

      // Now look at consonants following the vowel
      const consStart = i + 1;
      let consEnd = consStart;
      while (consEnd < effectiveEnd && isConsonant(word[consEnd])) {
        consEnd++;
      }

      const consonantCount = consEnd - consStart;

      // If no more vowels follow, this is the last syllable
      if (consEnd >= effectiveEnd) {
        // Grab remaining characters
        for (let j = i + 1; j < word.length; j++) {
          current += word[j];
        }
        syllables.push(current);
        return syllables;
      }

      if (consonantCount === 0) {
        // V/V — split between vowels (rare, e.g., "idea" -> "i-dea")
        syllables.push(current);
        current = '';
      } else if (consonantCount === 1) {
        // VC/V — consonant goes with next syllable (open syllable rule)
        syllables.push(current);
        current = '';
      } else {
        // Multiple consonants — find the split point
        const consonants = word.slice(consStart, consEnd);
        let splitAt = 1; // default: first consonant stays with current syllable

        // Try to find a valid onset for the next syllable
        for (let k = consonants.length - 1; k >= 1; k--) {
          const potentialOnset = consonants.slice(k);
          if (canBeOnset(potentialOnset)) {
            splitAt = k;
            break;
          }
        }

        // Add consonants before split to current syllable
        for (let j = consStart; j < consStart + splitAt; j++) {
          current += word[j];
        }
        syllables.push(current);
        current = '';

        // The remaining consonants will be picked up in the next iteration
        i = consStart + splitAt - 1;
      }
    }

    i++;
  }

  if (current.length > 0) {
    syllables.push(current);
  }

  return syllables;
}

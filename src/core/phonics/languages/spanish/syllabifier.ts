// src/core/phonics/languages/spanish/syllabifier.ts — Spanish syllabification.
// Spanish follows very regular rules:
//   1. Syllables prefer CV (consonant-vowel) structure.
//   2. A single consonant between vowels goes with the next syllable (CV.CV).
//   3. Two consonants between vowels: first stays, second goes (VC.CV), UNLESS
//      they form a valid onset cluster (e.g., "br", "pl", "tr").
//   4. Diphthongs (strong+weak or weak+strong) stay together.
//   5. An accent on a weak vowel breaks the diphthong (hiatus).

const STRONG_VOWELS = new Set(['a', 'e', 'o']);
const WEAK_VOWELS = new Set(['i', 'u']);
const ACCENTED: Record<string, string> = {
  '\u00e1': 'a', '\u00e9': 'e', '\u00ed': 'i', '\u00f3': 'o', '\u00fa': 'u', '\u00fc': 'u',
};

/** Valid two-consonant onsets in Spanish */
const ONSET_CLUSTERS = new Set([
  'bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr',
  'pl', 'pr', 'tl', 'tr',
  'ch', 'll',
]);

function baseVowel(ch: string): string {
  return ACCENTED[ch] ?? ch;
}

function isVowel(ch: string): boolean {
  const base = baseVowel(ch);
  return STRONG_VOWELS.has(base) || WEAK_VOWELS.has(base);
}

function isConsonant(ch: string): boolean {
  return /^[a-z\u00f1]$/i.test(ch) && !isVowel(ch);
}

function isStrongVowel(ch: string): boolean {
  return STRONG_VOWELS.has(baseVowel(ch));
}

/** An accented weak vowel next to another vowel = hiatus (separate syllables). */
function isAccentedWeak(ch: string): boolean {
  return ch === '\u00ed' || ch === '\u00fa';
}

/**
 * Can two adjacent vowels form a diphthong (stay in same syllable)?
 * Rules: strong+weak, weak+strong, weak+weak — UNLESS the weak vowel is accented.
 */
function isDiphthong(a: string, b: string): boolean {
  if (isAccentedWeak(a) || isAccentedWeak(b)) return false;
  if (isStrongVowel(a) && isStrongVowel(b)) return false;
  return true;
}

function canBeOnset(cluster: string): boolean {
  if (cluster.length <= 1) return true;
  if (cluster.length === 2) return ONSET_CLUSTERS.has(cluster.toLowerCase());
  return false;
}

/**
 * Split a Spanish word into syllables.
 */
export function splitSpanishSyllables(word: string): string[] {
  const lower = word.toLowerCase().trim();
  if (lower.length <= 2) return [lower];

  const chars = [...lower]; // spread handles multi-byte correctly
  const syllables: string[] = [];
  let current = '';
  let i = 0;

  while (i < chars.length) {
    current += chars[i];

    if (isVowel(chars[i])) {
      // Consume diphthongs/triphthongs
      while (i + 1 < chars.length && isVowel(chars[i + 1]) && isDiphthong(chars[i], chars[i + 1])) {
        i++;
        current += chars[i];
      }

      // Count consonants after this vowel nucleus
      const consStart = i + 1;
      let consEnd = consStart;
      while (consEnd < chars.length && isConsonant(chars[consEnd])) {
        consEnd++;
      }
      const consCount = consEnd - consStart;

      // If no more vowels follow, grab everything remaining
      if (consEnd >= chars.length) {
        for (let j = i + 1; j < chars.length; j++) {
          current += chars[j];
        }
        syllables.push(current);
        return syllables;
      }

      // Check if what follows consonants is a vowel (for splitting)
      const nextIsVowel = consEnd < chars.length && isVowel(chars[consEnd]);
      if (!nextIsVowel) {
        // No vowel after consonants — keep going
        for (let j = consStart; j < consEnd; j++) {
          current += chars[j];
        }
        i = consEnd - 1;
      } else if (consCount === 0) {
        // Two vowels adjacent — check hiatus vs diphthong
        if (i + 1 < chars.length && isVowel(chars[i + 1]) && !isDiphthong(chars[i], chars[i + 1])) {
          syllables.push(current);
          current = '';
        }
        // If it's a diphthong, we already consumed it above
      } else if (consCount === 1) {
        // Single consonant between vowels: goes with next syllable (CV rule)
        syllables.push(current);
        current = '';
      } else {
        // Multiple consonants between vowels
        const consonants = chars.slice(consStart, consEnd).join('');

        // Try to maximize the onset of the next syllable
        let splitAt = 1; // default: first consonant stays
        if (consCount === 2 && canBeOnset(consonants)) {
          splitAt = 0; // both go with next syllable
        } else if (consCount >= 2) {
          // Check if last two form a valid onset
          const lastTwo = consonants.slice(-2);
          if (canBeOnset(lastTwo)) {
            splitAt = consCount - 2;
          }
        }

        // Add consonants before split to current syllable
        for (let j = 0; j < splitAt; j++) {
          current += chars[consStart + j];
        }
        syllables.push(current);
        current = '';
        i = consStart + splitAt - 1;
      }
    }

    i++;
  }

  if (current.length > 0) {
    syllables.push(current);
  }

  return syllables.filter((s) => s.length > 0);
}

// src/ocr/utils.ts — word cleaning utilities for OCR output

const ALLOWED_SHORT_WORDS = new Set(['a', 'i']);

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

/** Minimum length for a token to be considered a word (except allowed short words). */
const MIN_WORD_LENGTH = 3;

/** Maximum consecutive consonants allowed in a plausible English word. */
const MAX_CONSECUTIVE_CONSONANTS = 4;

/**
 * Clean raw OCR text into a deduplicated list of normalized words.
 *
 * Steps:
 *  1. Split by whitespace / newlines
 *  2. Lowercase
 *  3. Strip non-alphabetic characters (keep internal hyphens)
 *  4. Trim leftover whitespace
 *  5. Drop tokens that fail plausibility checks (too short, no vowels,
 *     excessive consonant clusters, or repeated characters)
 *  6. Deduplicate (preserving first-occurrence order)
 */
export function cleanWords(rawText: string): string[] {
  const tokens = rawText.split(/\s+/);

  const seen = new Set<string>();
  const result: string[] = [];

  for (const token of tokens) {
    const cleaned = normalizeToken(token);
    if (cleaned === '') continue;
    if (!isPlausibleWord(cleaned)) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
  }

  return result;
}

/**
 * Normalize a single token:
 *  - lowercase
 *  - strip leading / trailing non-alpha characters
 *  - remove non-alpha characters that are NOT internal hyphens
 */
function normalizeToken(token: string): string {
  const lowered = token.toLowerCase();

  // Keep only alphabetic chars and hyphens that sit between letters
  let out = '';
  for (let i = 0; i < lowered.length; i++) {
    const ch = lowered[i];
    if (isAlpha(ch)) {
      out += ch;
    } else if (ch === '-' && i > 0 && i < lowered.length - 1 && isAlpha(lowered[i - 1]) && isAlpha(lowered[i + 1])) {
      out += ch;
    }
  }

  return out.trim();
}

/**
 * Check whether a cleaned token looks like a plausible English word rather than
 * OCR noise.  Heuristics:
 *  - Allowed short words ("a", "i") always pass
 *  - Must be at least MIN_WORD_LENGTH characters
 *  - Must contain at least one vowel
 *  - Must not have more than MAX_CONSECUTIVE_CONSONANTS consonants in a row
 *  - Must not consist of the same character repeated (e.g. "rrr", "eee")
 */
function isPlausibleWord(word: string): boolean {
  if (ALLOWED_SHORT_WORDS.has(word)) return true;
  if (word.length < MIN_WORD_LENGTH) return false;

  // Must contain at least one vowel
  let hasVowel = false;
  let consecutiveConsonants = 0;
  let maxConsonantRun = 0;

  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    if (ch === '-') {
      consecutiveConsonants = 0;
      continue;
    }
    if (VOWELS.has(ch)) {
      hasVowel = true;
      consecutiveConsonants = 0;
    } else {
      consecutiveConsonants++;
      if (consecutiveConsonants > maxConsonantRun) {
        maxConsonantRun = consecutiveConsonants;
      }
    }
  }

  if (!hasVowel) return false;
  if (maxConsonantRun > MAX_CONSECUTIVE_CONSONANTS) return false;

  // Reject tokens where every character is the same (e.g. "aaa", "eee")
  if (isAllSameChar(word)) return false;

  return true;
}

/** Check if a string consists of a single character repeated. */
function isAllSameChar(s: string): boolean {
  for (let i = 1; i < s.length; i++) {
    if (s[i] !== s[0]) return false;
  }
  return true;
}

function isAlpha(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z');
}

/**
 * Normalize whitespace in raw OCR text (collapse runs of whitespace to a single space, trim).
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Header keywords that commonly appear in spelling-list titles.
 * Matched case-insensitively.
 */
const HEADER_KEYWORDS =
  /\b(?:unit|week|wk|list|lesson|chapter|spelling|test|vocabulary|vocab|grade|term)\b/i;

/**
 * Attempt to extract a list / title name from the raw OCR text.
 *
 * Heuristic: scan the first few non-empty lines for one that looks like a
 * heading rather than a spelling word.  A heading line typically:
 *  - Contains a number  OR  a recognised header keyword
 *  - Is relatively short (≤ 60 characters)
 *  - Appears before the bulk of the word list
 *
 * Returns the cleaned-up heading string, or `null` if nothing looks like a
 * title.
 */
export function extractListName(rawText: string): string | null {
  const lines = rawText
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Only inspect the first 3 lines — a title should appear near the top
  const candidates = lines.slice(0, 3);

  for (const line of candidates) {
    if (line.length > 60) continue; // too long for a title

    const hasKeyword = HEADER_KEYWORDS.test(line);
    const hasNumber = /\d/.test(line);

    if (hasKeyword || hasNumber) {
      // Light cleanup: collapse whitespace, keep alphanumeric + basic punctuation
      const cleaned = line
        .replace(/[^\w\s,.\-:]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      return cleaned || null;
    }
  }

  return null;
}

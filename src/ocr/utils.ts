// src/ocr/utils.ts — word cleaning utilities for OCR output

const ALLOWED_SINGLE_CHARS = new Set(['a', 'i']);

/**
 * Clean raw OCR text into a deduplicated list of normalized words.
 *
 * Steps:
 *  1. Split by whitespace / newlines
 *  2. Lowercase
 *  3. Strip non-alphabetic characters (keep internal hyphens)
 *  4. Trim leftover whitespace
 *  5. Drop single-character tokens (except "a" and "I"/lowercase "i")
 *  6. Deduplicate (preserving first-occurrence order)
 */
export function cleanWords(rawText: string): string[] {
  const tokens = rawText.split(/\s+/);

  const seen = new Set<string>();
  const result: string[] = [];

  for (const token of tokens) {
    const cleaned = normalizeToken(token);
    if (cleaned === '') continue;
    if (cleaned.length === 1 && !ALLOWED_SINGLE_CHARS.has(cleaned)) continue;
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

function isAlpha(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z');
}

/**
 * Normalize whitespace in raw OCR text (collapse runs of whitespace to a single space, trim).
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

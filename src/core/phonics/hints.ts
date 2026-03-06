// src/core/phonics/hints.ts — Hint generation from pattern database

import type { DetectedPattern } from '../../contracts/types.ts';
import { findPatternById } from './patterns.ts';

/**
 * Generate a teaching hint for a detected pattern.
 * Returns the hint string from the pattern database, or a generic fallback.
 */
export function generateHint(pattern: DetectedPattern): string {
  const entry = findPatternById(pattern.id);
  if (entry) {
    return entry.hint;
  }
  // Fallback: use the hint stored on the DetectedPattern itself
  return pattern.hint;
}

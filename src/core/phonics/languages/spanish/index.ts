// src/core/phonics/languages/spanish/index.ts — Barrel exports

export { analyzeSpanishWord } from './engine.ts';
export { splitSpanishSyllables } from './syllabifier.ts';
export { spanishPatterns, findSpanishPatternById } from './patterns.ts';
export type { SpanishPatternEntry } from './patterns.ts';

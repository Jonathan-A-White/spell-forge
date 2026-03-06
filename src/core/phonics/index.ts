// src/core/phonics/index.ts — Barrel exports

export { analyzeWord, getPatternFamily } from './engine.ts';
export { generateHint } from './hints.ts';
export { splitSyllables } from './syllabifier.ts';
export { patterns, findPatternById } from './patterns.ts';
export type { PatternEntry } from './patterns.ts';

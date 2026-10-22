// src/learn/spelling — The spelling graph: nodes, items and the grade bands, data and pure code with no screen (docs/spelling-graph.md).

export { SPELLING_NODES, nodesInBand, spellingGraph } from './graph.ts';
export { GRADE_BANDS, MIN_ITEMS, bandLevel, itemShowsPattern, nodeProblems, spellingNode } from './items.ts';
export type { GradeBand, SolidRule, SpellingItem, SpellingNode } from './items.ts';
export { PHONICS_NODES } from './nodes-phonics.ts';
export { PATTERN_NODES } from './nodes-patterns.ts';

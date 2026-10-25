// src/learn/spelling — The spelling graph: nodes, items and the grade bands, data and pure code with no screen (docs/spelling-graph.md).

export { SPELLING_NODES, nodesInBand, spellingGraph } from './graph.ts';
export { GRADE_BANDS, MIN_ITEMS, STRATEGY_KINDS, bandLevel, itemShowsPattern, nodeProblems, spellingNode } from './items.ts';
export type { GradeBand, SolidRule, SpellingItem, SpellingNode, StrategyKind } from './items.ts';
export { PHONICS_NODES } from './nodes-phonics.ts';
export { PATTERN_NODES } from './nodes-patterns.ts';
export { MEMORY_AID_STRATEGIES, STRATEGY_NODES } from './nodes-strategies.ts';
export type { MemoryAidStrategy } from './nodes-strategies.ts';

// src/learn/maths — The maths graph: nodes, items and the grade bands, data and pure code with no screen (docs/maths-graph.md).

export { MATHS_NODES, mathsGraph, nodesInBand } from './graph.ts';
export {
  GRADE_BANDS,
  MIN_ITEMS,
  bandLevel,
  checkAnswer,
  itemAt,
  mathsNode,
  nodeProblems,
  wrongAnswerFor,
} from './items.ts';
export type { GradeBand, MathsItem, MathsNode, SolidRule } from './items.ts';
export { NUMBER_NODES } from './nodes-number.ts';

// src/learn/maths — The maths graph: nodes, items and the grade bands, data and pure code with no screen (docs/maths-graph.md).

export { COMPETITION_NODES, MATHS_NODES, mathsGraph, nodesInBand } from './graph.ts';
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
export { ALGEBRA_NODES, HEART_OF_ALGEBRA, PASSPORT_TO_ADVANCED_MATH } from './nodes-algebra.ts';
export { OPERATION_NODES, PROBLEM_SOLVING_AND_DATA_ANALYSIS } from './nodes-operations.ts';
export { ADDITIONAL_TOPICS_IN_MATH, GEOMETRY_NODES } from './nodes-geometry.ts';
export { DATA_NODES } from './nodes-data.ts';
export { AMC_TOPICS, COMPETITION_THEORY_NODES } from './nodes-competition.ts';
export { COMPETITION, MATHS_GOALS, PROBLEM_KIND_NODES, SAT_DOMAINS, SAT_MATHS_800, mathsScaffold } from './goals.ts';
export type { Operation, ProblemKind, ProblemKindNode } from './goals.ts';

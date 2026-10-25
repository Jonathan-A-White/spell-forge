// src/learn/maths/graph.ts — The maths graph: the node files assembled and validated over learn-kit's graph (docs/maths-graph.md).
// Add a node file's list to MATHS_NODES below; validate refuses a cycle, an unknown need, or a need of a higher level at load.

import { validate } from 'learn-kit/graph';
import { nodeProblems, type GradeBand, type MathsNode } from './items.ts';
import { ALGEBRA_NODES } from './nodes-algebra.ts';
import { NUMBER_NODES } from './nodes-number.ts';
import { OPERATION_NODES } from './nodes-operations.ts';

/** Every node of the maths graph, the youngest band first. */
export const MATHS_NODES: readonly MathsNode[] = [...NUMBER_NODES, ...OPERATION_NODES, ...ALGEBRA_NODES];

const problems = MATHS_NODES.flatMap(nodeProblems);
if (problems.length > 0) throw new Error(`Not a maths graph: ${problems.join('; ')}`);

/** The maths graph, validated: a directed acyclic graph of MATHS_NODES. */
export const mathsGraph = validate(MATHS_NODES);

/** The nodes of one grade band, in the graph's order. */
export function nodesInBand(band: GradeBand): readonly MathsNode[] {
  return MATHS_NODES.filter((node) => node.band === band);
}

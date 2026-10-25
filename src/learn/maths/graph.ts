// src/learn/maths/graph.ts — The maths graph: the node files assembled and validated over learn-kit's graph (docs/maths-graph.md).
// Add a node file's list to MATHS_NODES below; validate refuses a cycle, an unknown need, or a need of a higher level at load.

import { validate } from 'learn-kit/graph';
import { nodeProblems, type GradeBand, type MathsNode } from './items.ts';
import { ALGEBRA_NODES } from './nodes-algebra.ts';
import { COMPETITION_THEORY_NODES } from './nodes-competition.ts';
import { DATA_NODES } from './nodes-data.ts';
import { GEOMETRY_NODES } from './nodes-geometry.ts';
import { NUMBER_NODES } from './nodes-number.ts';
import { OPERATION_NODES } from './nodes-operations.ts';

/** Every node of the maths graph: the strands one after another, each with its own bands, the competition tier's among them. */
export const MATHS_NODES: readonly MathsNode[] = [
  ...NUMBER_NODES,
  ...OPERATION_NODES,
  ...ALGEBRA_NODES,
  ...GEOMETRY_NODES,
  ...DATA_NODES,
  ...COMPETITION_THEORY_NODES,
];

const problems = MATHS_NODES.flatMap(nodeProblems);
if (problems.length > 0) throw new Error(`Not a maths graph: ${problems.join('; ')}`);

/** The maths graph, validated: a directed acyclic graph of MATHS_NODES. */
export const mathsGraph = validate(MATHS_NODES);

/** The nodes of one grade band, in the graph's order. */
export function nodesInBand(band: GradeBand): readonly MathsNode[] {
  return MATHS_NODES.filter((node) => node.band === band);
}

/** The competition tier: the AMC 8 and AMC 10 nodes of every strand (number theory, algebra, geometry, counting and probability). */
export const COMPETITION_NODES: readonly MathsNode[] = nodesInBand('competition');

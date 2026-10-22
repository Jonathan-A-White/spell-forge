// src/learn/spelling/graph.ts — The spelling graph: the node files assembled and validated over learn-kit's graph (docs/spelling-graph.md).
// Add a node file's list to SPELLING_NODES below; validate refuses a cycle, an unknown need, or a need of a higher level at load.

import { validate } from 'learn-kit/graph';
import { nodeProblems, type GradeBand, type SpellingNode } from './items.ts';
import { PHONICS_NODES } from './nodes-phonics.ts';

/** Every node of the spelling graph, the youngest band first. */
export const SPELLING_NODES: readonly SpellingNode[] = [...PHONICS_NODES];

const problems = SPELLING_NODES.flatMap(nodeProblems);
if (problems.length > 0) throw new Error(`Not a spelling graph: ${problems.join('; ')}`);

/** The spelling graph, validated: a directed acyclic graph of SPELLING_NODES. */
export const spellingGraph = validate(SPELLING_NODES);

/** The nodes of one grade band, in the graph's order. */
export function nodesInBand(band: GradeBand): readonly SpellingNode[] {
  return SPELLING_NODES.filter((node) => node.band === band);
}

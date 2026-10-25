// src/learn/maths/goals.ts — The maths goals a child can choose with the tutor, as sets of nodes of the maths graph, and the sweep of the
// problem kinds the tutor handles today (docs/maths-graph.md). A goal is @learn-kit/learner's Goal: an id, a title and the nodes it aims
// at; `mathsScaffold` is the path from the roots to them for what the child has solid. His words: "I want to get an 800 on the math SAT";
// "competitive ... at the ... math competitions". No problem is copied from any test or contest: the SAT goal names the College Board's
// SAT Math content domains and the competition goal the AMC 8 and AMC 10 topic lists, by name only.

import { scaffold, type Goal, type GoalScaffold } from 'learn-kit/learner';
import { mathsGraph, nodesInBand } from './graph.ts';
import type { MathsNode } from './items.ts';
import { HEART_OF_ALGEBRA, PASSPORT_TO_ADVANCED_MATH } from './nodes-algebra.ts';
import { ADDITIONAL_TOPICS_IN_MATH } from './nodes-geometry.ts';
import { PROBLEM_SOLVING_AND_DATA_ANALYSIS } from './nodes-operations.ts';

/** The SAT Math content domains by name, with the tag that marks a node as preparing for one. */
export const SAT_DOMAINS = [
  { name: 'Heart of Algebra', tag: HEART_OF_ALGEBRA },
  { name: 'Problem Solving and Data Analysis', tag: PROBLEM_SOLVING_AND_DATA_ANALYSIS },
  { name: 'Passport to Advanced Math', tag: PASSPORT_TO_ADVANCED_MATH },
  { name: 'Additional Topics in Math', tag: ADDITIONAL_TOPICS_IN_MATH },
] as const;

const citesADomain = (node: MathsNode): boolean => SAT_DOMAINS.some((domain) => node.tags?.includes(domain.tag));

/** An 800 on the maths SAT: every 9-12 node that prepares for a SAT Math content domain, and so everything those rest on. */
export const SAT_MATHS_800: Goal = {
  id: 'sat-maths-800',
  title: 'An 800 on the maths SAT',
  targets: nodesInBand('9-12').filter(citesADomain).map((node) => node.id),
};

/** Being competitive at the maths competitions: the whole competition tier (AMC 8 and AMC 10 topics), and so everything it rests on. */
export const COMPETITION: Goal = {
  id: 'competition',
  title: 'Competitive at maths competitions',
  targets: nodesInBand('competition').map((node) => node.id),
};

/** The goals the tutor offers for maths. */
export const MATHS_GOALS: readonly Goal[] = [SAT_MATHS_800, COMPETITION];

/**
 * The path still to go to a goal over the maths graph, from the roots up, for a child whose solid nodes are `solid`. A child with nothing
 * solid gets the whole goal, starting from the nodes that rest on nothing; a node leaves the path (and its hints and slower pace with it)
 * as it goes solid.
 */
export function mathsScaffold(goal: Goal, solid: ReadonlySet<string>): GoalScaffold<MathsNode> {
  return scaffold(goal, mathsGraph, solid);
}

// ─── The sweep of problem kinds ───────────────────────────

/** The kinds the tutor-turn grind gives a problem (`problem_kind`): a story with words, or a bare sum. */
export type ProblemKind = 'word' | 'plain';

/** The four operations a problem the tutor handles today comes down to. */
export type Operation = 'add' | 'subtract' | 'multiply' | 'divide';

/** One kind of problem the maths loop and the tutor-turn grind handle today, the node it practises, and the problems that show it. */
export interface ProblemKindNode {
  kind: ProblemKind;
  operation: Operation;
  /** The node of the maths graph that the problem is on. */
  node: string;
  /** The problems (the `target_text` of grinds/examples/tutor-turn/ and grinds/tutor-turn.eval/) that are of this kind; a bare sum has none today. */
  problems: readonly string[];
}

const STICKERS_TAKEN =
  'The main character in the story has 12 stickers. She gives 5 of them to her friend. How many stickers does she have left?';
const STICKERS_AWAY = 'The main character in the story has 12 stickers. She gives 5 of them away. How many stickers does she have left?';
const BOY_STICKERS = 'A boy had 15 stickers. He gave 6 to his friend. How many stickers does he have left?';
const MARBLES = 'A girl had 24 marbles. She gave 9 of them to her friend. How many marbles does she have left?';
const BOOKS = 'A library had 52 books on a shelf. Children borrowed 25 of them. How many books are left on the shelf?';
const PENCILS = 'There are 24 pencils in a box. A teacher shares them equally between 4 tables. How many pencils does each table get?';
const SHELLS = 'A girl puts 8 shells in the bucket and finds 6 more on the sand. How many shells does she have now?';
const CARROTS = 'A gardener plants 6 rows of carrots with 5 carrots in each row. How many carrots are there altogether?';

/**
 * Every problem kind the maths loop (src/features/tutor/math-loop.tsx) and tutor-turn's examples and evals handle today, mapped to a node:
 * the loop checks any answer to any problem, so the kinds are the ones the grind is shown, a story with words (`word`) or a bare sum
 * (`plain`) over each of the four operations on whole numbers. The first five hold the problems the grinds send.
 */
export const PROBLEM_KIND_NODES: readonly ProblemKindNode[] = [
  { kind: 'word', operation: 'subtract', node: 'subtract-within-20', problems: [STICKERS_TAKEN, STICKERS_AWAY, BOY_STICKERS] },
  { kind: 'word', operation: 'subtract', node: 'subtract-two-digit', problems: [MARBLES, BOOKS] },
  { kind: 'word', operation: 'divide', node: 'divide-equal-groups', problems: [PENCILS] },
  { kind: 'word', operation: 'add', node: 'add-within-20', problems: [SHELLS] },
  { kind: 'word', operation: 'multiply', node: 'multiply-equal-groups', problems: [CARROTS] },
  { kind: 'plain', operation: 'add', node: 'add-two-digit', problems: [] },
  { kind: 'plain', operation: 'subtract', node: 'subtract-two-digit', problems: [] },
  { kind: 'plain', operation: 'multiply', node: 'times-tables', problems: [] },
  { kind: 'plain', operation: 'divide', node: 'divide-equal-groups', problems: [] },
];

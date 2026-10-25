// The maths goals (mw-79en7t.56): sat-maths-800 and competition as sets of nodes of the maths graph, scaffolded by
// @learn-kit/learner from the roots; and the sweep of problem kinds the maths loop and the tutor-turn grind handle today, each
// mapped to a node (docs/maths-graph.md).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GoalError, checkGoal, goalNodes, goalProgress, scaffold } from 'learn-kit/learner';
import {
  AMC_TOPICS,
  COMPETITION,
  MATHS_GOALS,
  MATHS_NODES,
  PROBLEM_KIND_NODES,
  SAT_DOMAINS,
  SAT_MATHS_800,
  mathsGraph,
  mathsScaffold,
  nodesInBand,
} from '../../src/learn/maths';

const roots = MATHS_NODES.filter((n) => n.needs.length === 0).map((n) => n.id);

describe('the maths goals', () => {
  it('are sat-maths-800 and competition, in the learner kit’s Goal shape', () => {
    expect(MATHS_GOALS.map((g) => g.id)).toEqual(['sat-maths-800', 'competition']);
    expect(SAT_MATHS_800.id).toBe('sat-maths-800');
    expect(COMPETITION.id).toBe('competition');
    for (const goal of MATHS_GOALS) {
      expect(goal.title.trim().length, goal.id).toBeGreaterThan(0);
      expect(goal.targets.length, goal.id).toBeGreaterThan(0);
    }
  });

  it('resolve to nodes that exist: the learner kit finds no problem with either goal', () => {
    for (const goal of MATHS_GOALS) {
      expect(() => checkGoal(goal, mathsGraph), goal.id).not.toThrow();
      for (const target of goal.targets) expect(mathsGraph.byId.has(target), `${goal.id} aims at ${target}`).toBe(true);
    }
    expect(() => checkGoal({ id: 'nowhere', title: 'Nowhere', targets: ['not-a-node'] }, mathsGraph)).toThrow(GoalError);
  });

  it('put the SAT goal on the 9-12 nodes of the four SAT Math content domains, each domain by name', () => {
    expect(SAT_DOMAINS.map((d) => d.name)).toEqual([
      'Heart of Algebra',
      'Problem Solving and Data Analysis',
      'Passport to Advanced Math',
      'Additional Topics in Math',
    ]);
    for (const domain of SAT_DOMAINS) {
      expect(domain.tag).toMatch(/^sat:/);
      const aimed = SAT_MATHS_800.targets.filter((t) => mathsGraph.byId.get(t)!.tags?.includes(domain.tag));
      expect(aimed.length, domain.name).toBeGreaterThan(0);
    }
    for (const target of SAT_MATHS_800.targets) expect(mathsGraph.byId.get(target)!.band, target).toBe('9-12');
    // every 9-12 node that cites a domain is aimed at, so no domain is left half-covered
    const cited = nodesInBand('9-12').filter((n) => SAT_DOMAINS.some((d) => n.tags?.includes(d.tag)));
    expect([...SAT_MATHS_800.targets].sort()).toEqual(cited.map((n) => n.id).sort());
  });

  it('put the competition goal on the competition tier, which cites the AMC 8 and AMC 10 topic lists', () => {
    expect([...COMPETITION.targets].sort()).toEqual(nodesInBand('competition').map((n) => n.id).sort());
    for (const topic of AMC_TOPICS) expect(COMPETITION.targets.some((t) => mathsGraph.byId.get(t)!.tags?.includes(topic.tag)), topic.name).toBe(true);
  });

  it('cover far more than the targets: each goal reaches down to the youngest nodes', () => {
    for (const goal of MATHS_GOALS) {
      const covered = goalNodes(goal, mathsGraph).map((n) => n.id);
      expect(covered.length, goal.id).toBeGreaterThan(goal.targets.length);
      for (const root of roots) expect(covered, `${goal.id} reaches ${root}`).toContain(root);
    }
  });
});

describe('the scaffold of a maths goal (@learn-kit/learner)', () => {
  it('starts from the roots for a learner with nothing solid, and the path is the whole goal in teaching order', () => {
    for (const goal of MATHS_GOALS) {
      const path = mathsScaffold(goal, new Set());
      const covered = goalNodes(goal, mathsGraph).map((n) => n.id);
      expect(path.steps.map((s) => s.node.id), goal.id).toEqual(covered);
      expect(path.solid, goal.id).toEqual([]);
      expect(path.progress, goal.id).toBe(0);
      const ready = path.steps.filter((s) => s.ready).map((s) => s.node.id);
      expect(ready.length, goal.id).toBeGreaterThan(0);
      for (const id of ready) expect(roots, `${goal.id}: ${id} is ready with nothing solid`).toContain(id);
      expect(path.steps[0].node.needs, goal.id).toEqual([]);
      const seen = new Set<string>();
      for (const step of path.steps) {
        for (const need of step.node.needs) expect(seen.has(need), `${goal.id}: ${step.node.id} before ${need}`).toBe(true);
        seen.add(step.node.id);
      }
    }
  });

  it('is shorter for a learner with the youngest bands solid, and drops a node’s supports once it is solid', () => {
    for (const goal of MATHS_GOALS) {
      const none = mathsScaffold(goal, new Set());
      const solid = new Set(MATHS_NODES.filter((n) => n.level <= 3).map((n) => n.id));
      const some = mathsScaffold(goal, solid);
      expect(some.steps.length, goal.id).toBeLessThan(none.steps.length);
      expect(some.progress, goal.id).toBeGreaterThan(0);
      expect(some.progress, goal.id).toBeLessThan(1);
      for (const step of some.steps) expect(solid.has(step.node.id), `${goal.id}: ${step.node.id} is solid`).toBe(false);
      expect(some.steps.every((s) => s.supports.length > 0)).toBe(true);
    }
  });

  it('takes everything solid to progress 1 and an empty path', () => {
    for (const goal of MATHS_GOALS) {
      const all = new Set(goalNodes(goal, mathsGraph).map((n) => n.id));
      expect(goalProgress(goal, mathsGraph, all), goal.id).toBe(1);
      expect(scaffold(goal, mathsGraph, all).steps).toEqual([]);
    }
  });

  it('shows hints with every step not yet solid', () => {
    const path = mathsScaffold(SAT_MATHS_800, new Set());
    for (const step of path.steps) expect(step.supports, step.node.id).toContain('hints');
  });
});

// ─── The sweep of problem kinds ───────────────────────────

const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

/** Every target_text the maths loop and tutor-turn's examples and evals send today, from the files. */
function problemsInGrinds(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const keep = (text: unknown, file: string) => {
    if (typeof text !== 'string' || text.trim() === '') return;
    found.set(text, [...(found.get(text) ?? []), file]);
  };
  for (const name of readdirSync('grinds/examples/tutor-turn').filter((f) => f.endsWith('.json'))) {
    const file = join('grinds/examples/tutor-turn', name);
    keep((read(file) as { request?: { target_text?: string } }).request?.target_text, file);
  }
  for (const dir of readdirSync('grinds/tutor-turn.eval')) {
    for (const name of readdirSync(join('grinds/tutor-turn.eval', dir)).filter((f) => f.startsWith('input'))) {
      const file = join('grinds/tutor-turn.eval', dir, name);
      keep((read(file) as { target_text?: string }).target_text, file);
    }
  }
  return found;
}

describe('the sweep of problem kinds', () => {
  it('maps every problem the tutor-turn examples and evals send to a node of the graph', () => {
    const problems = problemsInGrinds();
    expect(problems.size).toBeGreaterThan(0);
    const mapped = new Set(PROBLEM_KIND_NODES.flatMap((k) => k.problems));
    for (const [problem, files] of problems) expect(mapped.has(problem), `${problem} (${files[0]})`).toBe(true);
  });

  it('lists no problem that the grinds do not send, and maps each kind to a node that exists', () => {
    const problems = problemsInGrinds();
    for (const kind of PROBLEM_KIND_NODES) {
      expect(mathsGraph.byId.has(kind.node), `${kind.kind} ${kind.operation} → ${kind.node}`).toBe(true);
      for (const problem of kind.problems) expect(problems.has(problem), `${problem} is no longer sent`).toBe(true);
    }
  });

  it('covers every problem_kind the tutor-turn answer allows, and the four operations', () => {
    const schema = read('grinds/tutor-turn.answer.schema.json') as { properties: { problem_kind: { enum: string[] } } };
    const kinds = new Set(PROBLEM_KIND_NODES.map((k) => k.kind));
    for (const kind of schema.properties.problem_kind.enum) expect(kinds.has(kind as 'word' | 'plain'), kind).toBe(true);
    for (const kind of ['word', 'plain'] as const) {
      const ops = new Set(PROBLEM_KIND_NODES.filter((k) => k.kind === kind).map((k) => k.operation));
      expect([...ops].sort(), kind).toEqual(['add', 'divide', 'multiply', 'subtract']);
    }
  });

  it('puts each word problem on the node of its operation: the subtraction on a take-away node, the share on a divide node', () => {
    const nodeOf = (problem: string) => PROBLEM_KIND_NODES.find((k) => k.problems.includes(problem))!;
    // the photo example reads the pencils problem off its picture: it is the share above
    const photo = read('grinds/examples/tutor-turn/problem-in-photo.json') as { expect: { problem_kind: string; target_text: { matches: string } } };
    const photoKind = PROBLEM_KIND_NODES.find((k) => k.problems.some((p) => new RegExp(photo.expect.target_text.matches.replace('(?i)', ''), 'i').test(p)))!;
    expect(photoKind.kind).toBe(photo.expect.problem_kind);
    expect(nodeOf('A library had 52 books on a shelf. Children borrowed 25 of them. How many books are left on the shelf?').operation).toBe('subtract');
    expect(nodeOf('There are 24 pencils in a box. A teacher shares them equally between 4 tables. How many pencils does each table get?').node).toBe(
      'divide-equal-groups',
    );
  });
});

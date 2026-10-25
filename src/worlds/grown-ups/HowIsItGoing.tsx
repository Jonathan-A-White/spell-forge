// src/worlds/grown-ups/HowIsItGoing.tsx: how it is going, per world (spelling, maths): the goal's progress from
// @learn-kit/learner's scaffolding, the frontier in the nodes' child-facing names, how many nodes are solid and the
// last week's drills. A world with no data says so in one line. It draws what it is given; where the solid nodes
// and the drill count come from is the caller's.

import { frontierOf, type Graph, type GraphNode } from 'learn-kit/graph';
import { scaffold, type Goal } from 'learn-kit/learner';
import { mathsGraph } from '../../learn/maths';
import { spellingGraph } from '../../learn/spelling';
import { FirstLine } from './first-line';

/** What one world is known to have done. */
export interface WorldProgress {
  /** The ids of the nodes the child is solid on. */
  solid: ReadonlySet<string>;
  /** The goal the child works toward in this world, when they have chosen one. */
  goal?: Goal;
  /** How many drills they did in the last seven days. */
  drillsLastWeek?: number;
}

export interface HowIsItGoingProps {
  spelling?: WorldProgress;
  maths?: WorldProgress;
}

type NamedNode = GraphNode & { name: string };

/** The most frontier nodes named: a few, so the line stays one a parent reads at a glance. */
const FRONTIER_SHOWN = 3;

function countOf(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function WorldSection({ title, graph, progress }: { title: string; graph: Graph<NamedNode>; progress?: WorldProgress }) {
  const solid = new Set([...(progress?.solid ?? [])].filter((id) => graph.byId.has(id)));
  const drills = progress?.drillsLastWeek ?? 0;

  if (solid.size === 0 && drills === 0) {
    return (
      <section aria-label={title} className="bg-sf-surface border border-sf-border rounded-xl p-4">
        <h2 className="text-lg font-bold text-sf-heading mb-1">{title}</h2>
        <p data-testid="no-data" className="text-sm text-sf-muted">
          Nothing to show for {title.toLowerCase()} yet.
        </p>
      </section>
    );
  }

  const goal = progress?.goal;
  const path = goal ? scaffold(goal, graph, solid) : undefined;
  const next = path ? path.steps.filter((step) => step.ready).map((step) => step.node) : frontierOf(graph, solid);
  const shown = next.slice(0, FRONTIER_SHOWN);

  return (
    <section aria-label={title} className="bg-sf-surface border border-sf-border rounded-xl p-4 space-y-2">
      <h2 className="text-lg font-bold text-sf-heading">{title}</h2>
      {goal && path && (
        <p data-testid="goal-progress" className="text-sm text-sf-text">
          Aiming at: {goal.title}. {Math.round(path.progress * 100)}% of the way there.
        </p>
      )}
      <div className="text-sm text-sf-text">
        <p>{shown.length > 0 ? 'Working on next:' : 'Nothing left to learn next here.'}</p>
        {shown.length > 0 && (
          <ul className="list-disc pl-5">
            {shown.map((node) => (
              <li key={node.id}>{node.name}</li>
            ))}
          </ul>
        )}
      </div>
      <p data-testid="solid-count" className="text-sm text-sf-text">
        Solid so far: {countOf(solid.size, 'skill', 'skills')} of {graph.nodes.length}.
      </p>
      <p data-testid="last-week" className="text-sm text-sf-text">
        {drills === 0 ? 'No drills in the last week.' : `${countOf(drills, 'drill', 'drills')} in the last week.`}
      </p>
    </section>
  );
}

export function HowIsItGoing({ spelling, maths }: HowIsItGoingProps) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-sf-heading">How is it going?</h1>
      <FirstLine>Where your child is in each subject, in plain words.</FirstLine>
      <WorldSection title="Spelling" graph={spellingGraph} progress={spelling} />
      <WorldSection title="Maths" graph={mathsGraph} progress={maths} />
    </div>
  );
}

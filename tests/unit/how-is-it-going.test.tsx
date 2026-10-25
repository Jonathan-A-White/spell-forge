// mw-79en7t.50 (Kestrel 17b): How is it going, per world: the goal's progress, the frontier in plain words, the solid
// count and the last week's drills; a world with no data says so in one line.
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { frontierOf, order } from 'learn-kit/graph';
import { goalProgress } from 'learn-kit/learner';
import { HowIsItGoing } from '../../src/worlds/grown-ups/HowIsItGoing';
import { spellingGraph } from '../../src/learn/spelling';
import { SAT_MATHS_800, mathsGraph } from '../../src/learn/maths';

/** The first `count` nodes of a graph's teaching order: solid, and so closed under what they rest on. */
const solidPrefix = (graph: typeof spellingGraph | typeof mathsGraph, count: number) => new Set(order(graph).slice(0, count));

describe('How is it going', () => {
  it('shows a spelling learner with 12 solid nodes: the frontier by name, the count, the last week', () => {
    const solid = solidPrefix(spellingGraph, 12);
    const frontier = frontierOf(spellingGraph, solid);
    expect(frontier.length).toBeGreaterThan(0);
    render(<HowIsItGoing spelling={{ solid, drillsLastWeek: 5 }} />);

    const section = within(screen.getByRole('region', { name: 'Spelling' }));
    expect(section.getByTestId('solid-count').textContent).toMatch(/\b12\b/);
    for (const node of frontier.slice(0, 3)) expect(section.getByText(node.name)).toBeTruthy();
    expect(section.getByTestId('last-week').textContent).toMatch(/\b5\b/);
  });

  it('shows the goal\'s progress for a world with a goal', () => {
    const solid = solidPrefix(mathsGraph, 20);
    const percent = Math.round(goalProgress(SAT_MATHS_800, mathsGraph, solid) * 100);
    render(<HowIsItGoing maths={{ solid, goal: SAT_MATHS_800, drillsLastWeek: 0 }} />);

    const section = within(screen.getByRole('region', { name: 'Maths' }));
    expect(section.getByText(SAT_MATHS_800.title, { exact: false })).toBeTruthy();
    expect(section.getByTestId('goal-progress').textContent).toContain(`${percent}%`);
    expect(section.getByTestId('last-week').textContent).toMatch(/no drills/i);
  });

  it('says in one line that a world with no data has none', () => {
    render(<HowIsItGoing spelling={{ solid: new Set(), drillsLastWeek: 0 }} />);

    const spelling = screen.getByRole('region', { name: 'Spelling' });
    expect(within(spelling).getByTestId('no-data').textContent).toBe('Nothing to show for spelling yet.');
    expect(within(spelling).queryByTestId('solid-count')).toBeNull();
    // a world the caller gave nothing for is the same
    const maths = screen.getByRole('region', { name: 'Maths' });
    expect(within(maths).getByTestId('no-data').textContent).toBe('Nothing to show for maths yet.');
  });

  it('ignores solid ids that are no node of the graph', () => {
    render(<HowIsItGoing spelling={{ solid: new Set(['no-such-node']), drillsLastWeek: 0 }} />);
    expect(within(screen.getByRole('region', { name: 'Spelling' })).getByTestId('no-data')).toBeTruthy();
  });
});

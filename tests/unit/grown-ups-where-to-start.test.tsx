// mw-w87e3oc.1, AC1 to AC4: Grown-ups > Math: where to start lists the topics by band in the child's words, searchable, with what he has solid
// ticked; 'Start here' on a topic places him there (what it needs solid, the placement done); 'Redo the placement test' clears the placement.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { memoryStore, type GraphStore } from 'learn-kit/graph';
import { db } from '../../src/data/db';
import { profileRepo } from '../../src/data/repositories';
import { ParentScreen } from '../../src/worlds/grown-ups/parent-screen';
import { WhereToStart } from '../../src/worlds/grown-ups/where-to-start';
import { createMathsFlow, memoryKeep, placeAt, type MathsKeep } from '../../src/worlds/maths';
import { mathsGraph } from '../../src/learn/maths';
import { below } from 'learn-kit/graph';

let store: GraphStore;
let keep: MathsKeep;
let id: string;

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
  store = memoryStore();
  keep = memoryKeep();
  id = (await profileRepo.createLearner('Sam', 'dragon-forge', {} as never)).id;
});
afterEach(cleanup);

async function openRow(): Promise<void> {
  render(<WhereToStart profileId={id} store={store} keep={keep} />);
  fireEvent.click(screen.getByRole('button', { name: /Math: where to start/ }));
  await screen.findByRole('heading', { name: 'Grades 3 to 5' });
  await screen.findByText(/Pick the topic Sam is on now/);
}

describe('the row', () => {
  it('is on the Grown-ups screen', async () => {
    render(<ParentScreen profileId={id} onBack={() => undefined} />);
    expect(await screen.findByRole('button', { name: /Math: where to start/ })).toBeInTheDocument();
  });

  it('lists the topics by band in the child\'s words, and ticks what he has solid', async () => {
    await store.put('skip-counting', { level: 'solid', since: 1, how: 'drill' });
    await openRow();
    expect(screen.getByRole('button', { name: 'Times tables' })).toBeInTheDocument();
    const name = (mathsGraph.byId.get('skip-counting') as { name: string }).name;
    expect(await screen.findByRole('button', { name: new RegExp(`^${name}\\s*\\(solid\\)$`) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Times tables' })).toBeInTheDocument();
  });

  it('is searchable', async () => {
    await openRow();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search the topics' }), { target: { value: 'times tab' } });
    expect(screen.getByRole('button', { name: 'Times tables' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sharing into equal groups' })).toBeNull();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search the topics' }), { target: { value: 'zzzz' } });
    expect(screen.getByText('No topic matches that.')).toBeInTheDocument();
  });
});

describe('Start here', () => {
  it("asks first, then places Sam at the topic: its needs solid, the placement done, and his next sitting starts there", async () => {
    await openRow();
    fireEvent.click(screen.getByRole('button', { name: 'Times tables' }));
    const confirm = screen.getByRole('group', { name: /Place Sam at Times tables/ });
    expect((await store.entries()).size).toBe(0); // nothing is written until confirmed
    fireEvent.click(within(confirm).getByRole('button', { name: 'Start here' }));
    expect(await screen.findByText('Sam will start at Times tables.')).toBeInTheDocument();
    const closure = below(mathsGraph, 'times-tables').map((n) => n.id);
    for (const need of closure) expect((await store.get(need))?.level).toBe('solid');
    expect((await keep.load()).placement?.done).toBe('finished');
    const q = await createMathsFlow({ store, keep, now: () => 1, seed: 3 }).question();
    expect(q?.nodeId).toBe('times-tables');
    expect(q?.stage).toBe('frontier');
  });

  it('Cancel writes nothing', async () => {
    await openRow();
    fireEvent.click(screen.getByRole('button', { name: 'Times tables' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect((await store.entries()).size).toBe(0);
    expect((await keep.load()).placement).toBeNull();
  });
});

describe('Redo the placement test', () => {
  it('clears the placement so the next entry runs it again', async () => {
    await placeAt({ store, keep }, 'times-tables');
    await openRow();
    fireEvent.click(screen.getByRole('button', { name: 'Redo the placement test' }));
    expect(await screen.findByText('Sam will do the placement test again next time.')).toBeInTheDocument();
    expect((await keep.load()).placement).toBeNull();
    const q = await createMathsFlow({ store, keep, now: () => 1, seed: 3 }).question();
    expect(q?.stage).toBe('placement');
  });
});

// mw-w87e3oc.2, AC3: Grown-ups > Math: Times tables shows a tick for each table, x0 to x12, to open or close one.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { db } from '../../src/data/db';
import { ParentScreen } from '../../src/worlds/grown-ups/parent-screen';
import { TimesTablesRow } from '../../src/worlds/grown-ups/times-tables-row';
import { memoryKeep, type MathsKeep } from '../../src/worlds/maths';

let keep: MathsKeep;

beforeEach(async () => {
  await db.delete();
  await db.open();
  localStorage.clear();
  keep = memoryKeep();
});
afterEach(cleanup);

async function openRow(): Promise<void> {
  render(<TimesTablesRow profileId="p1" keep={keep} />);
  fireEvent.click(screen.getByRole('button', { name: /Times tables/ }));
  await screen.findByRole('checkbox', { name: '×0 table' });
}

const box = (n: number): HTMLInputElement => screen.getByRole('checkbox', { name: `×${n} table` }) as HTMLInputElement;

describe('the Times tables row', () => {
  it('is on the Grown-ups screen', async () => {
    render(<ParentScreen profileId="p1" onBack={() => undefined} />);
    expect(await screen.findByRole('button', { name: /Times tables/ })).toBeInTheDocument();
  });

  it('has a tick for each table from x0 to x12', async () => {
    await openRow();
    expect(screen.getAllByRole('checkbox')).toHaveLength(13);
    for (let n = 0; n <= 12; n += 1) expect(box(n)).toBeInTheDocument();
  });

  it('ticks the open tables the child has', async () => {
    await keep.save({ placement: null, tries: {}, tables: [1, 2] });
    await openRow();
    await waitFor(() => expect(box(1).checked).toBe(true));
    expect(box(2).checked).toBe(true);
    expect(box(3).checked).toBe(false);
  });

  it('says so when no table is chosen yet, and ticks none', async () => {
    await openRow();
    expect(await screen.findByText(/Math mixes the tables from ×2 to ×10/)).toBeInTheDocument();
    expect(box(1).checked).toBe(false);
  });

  it('ticking a table opens it and unticking closes it, kept for the child', async () => {
    await keep.save({ placement: null, tries: {}, tables: [1] });
    await openRow();
    await waitFor(() => expect(box(1).checked).toBe(true));
    fireEvent.click(box(2));
    await waitFor(async () => expect((await keep.load()).tables).toEqual([1, 2]));
    expect(box(2).checked).toBe(true);
    fireEvent.click(box(1));
    await waitFor(async () => expect((await keep.load()).tables).toEqual([2]));
    expect(box(1).checked).toBe(false);
  });

  it('closing the last open table goes back to the mix', async () => {
    await keep.save({ placement: null, tries: {}, tables: [3] });
    await openRow();
    await waitFor(() => expect(box(3).checked).toBe(true));
    fireEvent.click(box(3));
    await waitFor(async () => expect((await keep.load()).tables).toBeUndefined());
  });
});

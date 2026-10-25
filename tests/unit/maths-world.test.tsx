// Kestrel 19a (mw-79en7t.57), AC2: the Maths world hosts the flow's questions, tells the tutor where the child is (M37: its name and the
// node, never the answer), and runs its timers through useVisibleInterval (M10).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStore } from 'learn-kit/graph';
import * as visibleInterval from '../../src/shell/visible-interval';
import { MathsWorld } from '../../src/worlds/maths/MathsWorld';
import type { ScreenReport } from '../../src/worlds/maths/maths-report';
import { createMathsFlow, memoryKeep, type MathsFlow } from '../../src/worlds/maths/maths-flow';

vi.mock('../../src/shell/visible-interval', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/shell/visible-interval')>();
  return { ...actual, useVisibleInterval: vi.fn(actual.useVisibleInterval) };
});

const NOW = Date.UTC(2026, 9, 25, 9, 0, 0);

let flow: MathsFlow;
let reports: ScreenReport[];

beforeEach(() => {
  flow = createMathsFlow({ store: memoryStore(), keep: memoryKeep(), now: () => NOW, seed: 3 });
  reports = [];
  vi.mocked(visibleInterval.useVisibleInterval).mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Draws the world (in the type form, the box these tests fill: 19b's other forms are tried in maths-flow.test.ts) and lets its first question arrive. */
const renderWorld = () => act(async () => void render(<MathsWorld flow={flow} forms={['type']} report={(r) => reports.push(r)} />));

/** A tap on a button, with the promises it starts let run. */
const tap = (name: string) => act(async () => void fireEvent.click(screen.getByRole('button', { name })));

const type = (value: string) => fireEvent.change(screen.getByLabelText('Your answer'), { target: { value } });

describe('MathsWorld', () => {
  it("shows the placement's first question with a way to answer it", async () => {
    await renderWorld();
    expect(await screen.findByRole('heading', { name: 'Maths' })).toBeInTheDocument();
    const q = (await flow.question())!;
    expect(await screen.findByText(q.item.problem)).toBeInTheDocument();
    expect(screen.getByLabelText('Your answer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check' })).toBeInTheDocument();
    expect(screen.getByText(/see what you know/i)).toBeInTheDocument();
  });

  it('tells the tutor its name and the node the child is on, and not the answer', async () => {
    await renderWorld();
    const q = (await flow.question())!;
    await screen.findByText(q.item.problem);
    const report = reports[reports.length - 1];
    expect(report.name).toBe('Maths');
    expect(report.facts.join('\n')).toContain(q.nodeName);
    expect(report.facts.join('\n')).toContain(q.item.problem);
    expect(report.facts.join('\n')).not.toContain(`answer: ${q.item.answer}`);
    expect(JSON.stringify(report)).not.toContain(q.item.hint);
  });

  it('reports again when the question changes', async () => {
    await renderWorld();
    const first = (await flow.question())!;
    await screen.findByText(first.item.problem);
    const before = reports.length;
    type(first.item.answer);
    await tap('Check');
    await tap('Next');
    const second = (await flow.question())!;
    await screen.findByText(second.item.problem);
    expect(reports.length).toBeGreaterThan(before);
    expect(reports[reports.length - 1].facts.join('\n')).toContain(second.item.problem);
  });

  it('says so when the answer is right, and checks it on the phone', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await renderWorld();
    const q = (await flow.question())!;
    await screen.findByText(q.item.problem);
    type(q.item.answer);
    await tap('Check');
    expect(await screen.findByRole('status')).toHaveTextContent(/right/i);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('a wrong answer gets the hint and a way on, not a dead end', async () => {
    await renderWorld();
    const q = (await flow.question())!;
    await screen.findByText(q.item.problem);
    type(`${q.item.answer}x`);
    await tap('Check');
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(q.item.hint);
    expect(status).not.toHaveTextContent(/wrong/i);
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('"Not sure" is an answer too, so the child never has to type', async () => {
    await renderWorld();
    const q = (await flow.question())!;
    await screen.findByText(q.item.problem);
    await tap('Not sure');
    expect(await screen.findByRole('status')).toHaveTextContent(q.item.hint);
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });

  it('shows the hint on request, and a right answer after it is still met with "Right"', async () => {
    await renderWorld();
    const q = (await flow.question())!;
    await screen.findByText(q.item.problem);
    await tap('Hint');
    expect(screen.getByText(q.item.hint)).toBeInTheDocument();
    type(q.item.answer);
    await tap('Check');
    expect(await screen.findByRole('status')).toHaveTextContent(/right/i);
  });

  it('takes its timers from useVisibleInterval: paused while a question is showing', async () => {
    await renderWorld();
    const q = (await flow.question())!;
    await screen.findByText(q.item.problem);
    const calls = vi.mocked(visibleInterval.useVisibleInterval).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1][1]).toBeNull();
  });

  it('with nothing to ask it looks again on a visible interval, and shows the next question when one comes due', async () => {
    const asks: Array<MathsFlow['question']> = [];
    let ready = false;
    const q = (await flow.question())!;
    const waiting: MathsFlow = {
      ...flow,
      question: async () => {
        asks.push(flow.question);
        return ready ? q : null;
      },
    };
    vi.useFakeTimers();
    render(<MathsWorld flow={waiting} report={(r) => reports.push(r)} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('status')).toHaveTextContent(/all done/i);
    const intervals = vi.mocked(visibleInterval.useVisibleInterval).mock.calls.map((c) => c[1]);
    expect(intervals.some((ms) => typeof ms === 'number')).toBe(true);
    ready = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(screen.getByText(q.item.problem)).toBeInTheDocument();
  });
});

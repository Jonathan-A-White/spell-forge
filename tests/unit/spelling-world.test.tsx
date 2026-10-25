// Kestrel 15c (mw-79en7t.47), AC2: the Spelling world hosts the flow's turns, shows the node's picture beside the drill when one is kept and
// nothing when not, tells the tutor its name and the node (M37, never the words), and runs its timers through useVisibleInterval (M10).
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStore } from 'learn-kit/graph';
import { readFileSync } from 'node:fs';
import { db } from '../../src/data/db';
import { currentScreen } from '../../src/shell/report-screen';
import { setLicenceStatus } from '../../src/shell/licence-gate';
import * as visibleInterval from '../../src/shell/visible-interval';
import { SpellingWorld } from '../../src/worlds/spelling/SpellingWorld';
import type { GameContext, GameItem } from '../../src/worlds/spelling/drill-forms';
import { createSpellingFlow, memoryKeep, type SpellingFlow, type SpellingTurn } from '../../src/worlds/spelling/spelling-flow';

vi.mock('../../src/shell/visible-interval', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/shell/visible-interval')>();
  return { ...actual, useVisibleInterval: vi.fn(actual.useVisibleInterval) };
});

const NOW = Date.UTC(2026, 9, 25, 9, 0, 0);
const SVG = readFileSync('tests/fixtures/pictures/agapao.svg', 'utf8');

let flow: SpellingFlow;

beforeEach(async () => {
  flow = createSpellingFlow({ store: memoryStore(), keep: memoryKeep(), now: () => NOW, seed: 3 });
  vi.mocked(visibleInterval.useVisibleInterval).mockClear();
  await db.delete();
  await db.open();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setLicenceStatus(undefined);
});

/** A stand-in for the games: a button that finishes the round with every word right. */
const stubGame = (_form: string, items: readonly GameItem[], ctx: GameContext) =>
  createElement('button', { onClick: () => ctx.onComplete({ correct: items.length, total: items.length }) }, 'Finish round');

type Props = Partial<Parameters<typeof SpellingWorld>[0]>;
const renderWorld = (props: Props = {}) => act(async () => void render(<SpellingWorld flow={flow} openGame={stubGame} {...props} />));
const tap = (name: string | RegExp) => act(async () => void fireEvent.click(screen.getByRole('button', { name })));

/** Gets the child past the placement (he spells nothing), so that what is asked next is a drill. */
async function intoTheDrill(): Promise<SpellingTurn> {
  for (let q = await flow.question(); q && q.stage === 'placement'; q = await flow.question()) await flow.answer({ correct: 0, total: 1 });
  return (await flow.question())!;
}

describe('SpellingWorld, the placement', () => {
  it('asks the word to be heard and two spellings to pick, with no picture', async () => {
    const picture = vi.fn(async () => SVG);
    await renderWorld({ picture });
    const q = (await flow.question())!;
    expect(await screen.findByRole('heading', { name: 'Spelling' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: q.items[0].word })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: q.items[0].distractor })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hear/i })).toBeInTheDocument();
    expect(screen.getByText(/see what you know/i)).toBeInTheDocument();
    expect(screen.queryByTestId('mnemonic-picture')).toBeNull();
    expect(picture).not.toHaveBeenCalled();
  });

  it('speaks the word when asked (and when the question arrives), through the onSpeak it is given', async () => {
    const onSpeak = vi.fn();
    await renderWorld({ onSpeak });
    const q = (await flow.question())!;
    await screen.findByRole('button', { name: q.items[0].word });
    expect(onSpeak).toHaveBeenCalledWith(q.items[0].word);
    onSpeak.mockClear();
    await tap(/hear/i);
    expect(onSpeak).toHaveBeenCalledWith(q.items[0].word);
  });

  it('a right pick is met with "Right", a wrong one with the word and a way on, never a dead end', async () => {
    await renderWorld();
    const q = (await flow.question())!;
    await tap(q.items[0].distractor);
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(q.items[0].word);
    expect(status).not.toHaveTextContent(/wrong/i);
    await tap('Next');
    expect(await screen.findByRole('heading', { name: 'Spelling' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('a right pick says so', async () => {
    await renderWorld();
    const q = (await flow.question())!;
    await tap(q.items[0].word);
    expect(await screen.findByRole('status')).toHaveTextContent(/right/i);
  });
});

describe('SpellingWorld, the drill', () => {
  it('opens the node as its game form, and a finished round is told and moves on', async () => {
    const q = await intoTheDrill();
    const opened: string[] = [];
    await renderWorld({ openGame: (form, items, ctx) => (opened.push(form), stubGame(form, items, ctx)) });
    await screen.findByRole('button', { name: 'Finish round' });
    expect(opened[0]).toBe(q.form);
    await tap('Finish round');
    expect(await screen.findByRole('status')).toHaveTextContent(/right|well done/i);
    await tap('Next');
    expect(await screen.findByRole('button', { name: 'Finish round' })).toBeInTheDocument();
  });

  it("shows the node's picture beside the drill when one is kept", async () => {
    const q = await intoTheDrill();
    const picture = vi.fn(async () => SVG);
    await renderWorld({ picture });
    const img = await screen.findByTestId('mnemonic-picture');
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('src')).toContain('data:image/svg+xml');
    expect(picture).toHaveBeenCalledWith({ id: q.nodeId, name: q.nodeName, words: q.items.map((i) => i.word) });
  });

  it('shows nothing when no picture is kept, and the drill goes on', async () => {
    await intoTheDrill();
    await renderWorld({ picture: async () => undefined });
    await screen.findByRole('button', { name: 'Finish round' });
    expect(screen.queryByTestId('mnemonic-picture')).toBeNull();
  });

  it('shows nothing when the picture cannot be had at all', async () => {
    await intoTheDrill();
    await renderWorld({ picture: async () => Promise.reject(new Error('no mill')) });
    expect(await screen.findByRole('button', { name: 'Finish round' })).toBeInTheDocument();
    expect(screen.queryByTestId('mnemonic-picture')).toBeNull();
  });

  it('by default asks the picture module: a kept picture shows, and with no licence and none kept there is none', async () => {
    const q = await intoTheDrill();
    setLicenceStatus({ state: 'none', checkedAt: new Date(NOW).toISOString() });
    await renderWorld();
    await screen.findByRole('button', { name: 'Finish round' }).catch(() => undefined);
    expect(screen.queryByTestId('mnemonic-picture')).toBeNull();
    cleanup();

    await db.mnemonicPictures.put({ nodeId: q.nodeId, svg: SVG, createdAt: new Date(NOW) });
    await renderWorld();
    expect(await screen.findByTestId('mnemonic-picture')).toBeInTheDocument();
  });
});

describe('SpellingWorld, telling the tutor where the child is (M37)', () => {
  it('reports its name and the node, and not the words', async () => {
    const q = await intoTheDrill();
    await renderWorld();
    await screen.findByRole('button', { name: 'Finish round' });
    const report = currentScreen()!;
    expect(report.name).toBe('Spelling');
    expect(report.facts.join('\n')).toContain(q.nodeName);
    for (const item of q.items) expect(JSON.stringify(report)).not.toContain(item.word);
  });

  it('reports the placement without its word, and again when the turn changes', async () => {
    await renderWorld();
    const q = (await flow.question())!;
    await screen.findByRole('button', { name: q.items[0].word });
    const first = currentScreen()!;
    expect(first.name).toBe('Spelling');
    expect(first.facts.join('\n')).toContain(q.nodeName);
    expect(JSON.stringify(first)).not.toContain(q.items[0].word);
    await tap(q.items[0].word);
    await tap('Next');
    const next = (await flow.question())!;
    await screen.findByRole('button', { name: next.items[0].word });
    expect(currentScreen()!.facts.join('\n')).toContain(next.nodeName);
  });

  it('forgets the report when the world goes', async () => {
    await renderWorld();
    await screen.findByRole('heading', { name: 'Spelling' });
    cleanup();
    expect(currentScreen()).toBeUndefined();
  });
});

describe('SpellingWorld, its timers (M10)', () => {
  it('takes them from useVisibleInterval, paused while a turn is showing', async () => {
    await renderWorld();
    const q = (await flow.question())!;
    await screen.findByRole('button', { name: q.items[0].word });
    const calls = vi.mocked(visibleInterval.useVisibleInterval).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1][1]).toBeNull();
  });

  it('with nothing to ask it looks again on a visible interval, and shows the next turn when one comes due', async () => {
    const q = await intoTheDrill();
    let ready = false;
    const waiting: SpellingFlow = { ...flow, question: async () => (ready ? q : null) };
    vi.useFakeTimers();
    render(<SpellingWorld flow={waiting} openGame={stubGame} picture={async () => undefined} />);
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
    expect(screen.getByRole('button', { name: 'Finish round' })).toBeInTheDocument();
  });
});

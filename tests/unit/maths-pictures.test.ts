// Kestrel 19d (mw-79en7t.60), AC1: a maths concept's picture comes through src/learn/mnemonic-pictures.ts, the one module: asked once for a
// concept however many questions it has, reused, and drawn beside the Maths world's question and the homework picture. A fake grind stands in
// for the mill. A picture is decoration: with none to be had the screen is whole without it.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStore } from 'learn-kit/graph';
import { db } from '../../src/data/db';
import { mnemonicPicture, type MnemonicNode, type MnemonicPictureRequest } from '../../src/learn/mnemonic-pictures';
import { tutorRepo } from '../../src/data/repositories';
import { PROBLEM_KIND_NODES } from '../../src/learn/maths';
import { Homework } from '../../src/worlds/maths/homework';
import { setLicenceStatus } from '../../src/shell/licence-gate';
import { MathsWorld } from '../../src/worlds/maths/MathsWorld';
import { conceptNode, conceptWords } from '../../src/worlds/maths/maths-pictures';
import { createMathsFlow, memoryKeep, type MathsFlow } from '../../src/worlds/maths/maths-flow';

const picture = readFileSync('tests/fixtures/pictures/agapao.svg', 'utf8');
const NOW = Date.UTC(2026, 9, 25, 9, 0, 0);

const fakeGrind = (svg: unknown = picture) => vi.fn<(request: MnemonicPictureRequest) => Promise<unknown>>().mockResolvedValue({ svg });

let flow: MathsFlow;

/** Plays the placement through with a child who gets every one right, so that what follows is the frontier (the placement shows no pictures). */
async function pastThePlacement(over: MathsFlow): Promise<void> {
  for (let q = await over.question(); q && q.stage === 'placement'; q = await over.question()) await over.answer(q.item.answer);
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  flow = createMathsFlow({ store: memoryStore(), keep: memoryKeep(), now: () => NOW, seed: 3 });
  await pastThePlacement(flow);
});
afterEach(() => {
  cleanup();
  setLicenceStatus(undefined);
});

const renderWorld = (ask: ReturnType<typeof fakeGrind>) =>
  act(async () => void render(createElement(MathsWorld, { flow, forms: ['type'], picture: (node: MnemonicNode) => mnemonicPicture(node, { ask }) })));

describe('a concept as the picture module is asked about it', () => {
  it('is the maths node: its id, its name, and words drawn from the name', () => {
    const node = conceptNode('count-to-5')!;
    expect(node.id).toBe('count-to-5');
    expect(node.name).toBe('Counting up to 5');
    expect(node.words).toEqual(['counting']);
  });

  it('names no concept the graph does not hold', () => {
    expect(conceptNode('not-a-node')).toBeUndefined();
  });

  it('always has at least one word to draw from, none of them the small words of a name', () => {
    expect(conceptWords('Which group has more')).toEqual(['group', 'more']);
    expect(conceptWords('1 + 2')).toEqual(['1 + 2']);
  });
});

describe('the Maths world with a concept picture', () => {
  it('shows none in the placement, which visits many concepts, and asks the mill for none', async () => {
    const fresh = createMathsFlow({ store: memoryStore(), keep: memoryKeep(), now: () => NOW, seed: 3 });
    const ask = fakeGrind();
    await act(async () => void render(createElement(MathsWorld, { flow: fresh, forms: ['type'], picture: (node: MnemonicNode) => mnemonicPicture(node, { ask }) })));
    expect((await fresh.question())!.stage).toBe('placement');
    await screen.findByText((await fresh.question())!.item.problem);
    expect(screen.queryByTestId('mnemonic-picture')).toBeNull();
    expect(ask).not.toHaveBeenCalled();
  });

  it('asks the grind once for the concept and draws the picture beside the question', async () => {
    const ask = fakeGrind();
    await renderWorld(ask);
    const q = (await flow.question())!;
    await screen.findByText(q.item.problem);
    const img = await screen.findByTestId('mnemonic-picture');
    expect(img.getAttribute('src')).toContain(encodeURIComponent('<svg'));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0][0]).toMatchObject({ schemaVersion: '1', nodeId: q.nodeId, name: q.nodeName });
  });

  it('reuses it: the same concept on the next question, or on another visit, makes no second call', async () => {
    const ask = fakeGrind();
    await renderWorld(ask);
    const first = (await flow.question())!;
    await screen.findByTestId('mnemonic-picture');
    cleanup();
    await renderWorld(ask);
    await screen.findByText((await flow.question())!.item.problem);
    await screen.findByTestId('mnemonic-picture');
    expect(ask.mock.calls.filter(([r]) => r.nodeId === first.nodeId)).toHaveLength(1);
  });

  it('shows no picture, and still the question, when the grind fails or the SVG breaks a rule', async () => {
    await renderWorld(fakeGrind('<svg><text>2</text></svg>'));
    const q = (await flow.question())!;
    expect(await screen.findByText(q.item.problem)).toBeInTheDocument();
    expect(screen.queryByTestId('mnemonic-picture')).toBeNull();
    expect(await db.mnemonicPictures.count()).toBe(0);
  });

  it('keeps the picture off the answer: the markup beside the question holds no hint and no answer', async () => {
    await renderWorld(fakeGrind());
    const q = (await flow.question())!;
    const img = await screen.findByTestId('mnemonic-picture');
    expect(img.getAttribute('alt')).toBe('');
    expect(img.outerHTML).not.toContain(q.item.hint);
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    expect(screen.getByText(q.item.hint)).toBeInTheDocument();
  });
});

describe('the homework picture with a concept picture', () => {
  const PROBLEM = PROBLEM_KIND_NODES[1].problems[1];
  const NODE = PROBLEM_KIND_NODES[1].node;

  async function renderHomework(ask: ReturnType<typeof fakeGrind>, props: { node?: string; targetText?: string } = {}) {
    const session = await tutorRepo.createSession({ profileId: 'p1', strictness: 'meaning-gated', problemKind: 'word', targetText: PROBLEM });
    await act(async () => {
      render(createElement(Homework, { session, targetText: PROBLEM, turns: [], deps: { say: async () => undefined }, onFinished: () => undefined, picture: (node: MnemonicNode) => mnemonicPicture(node, { ask }), ...props }));
    });
  }

  it("draws the picture of the problem's concept beside it, asking the grind once for that node", async () => {
    const ask = fakeGrind();
    await renderHomework(ask);
    expect(await screen.findByTestId('mnemonic-picture')).toBeInTheDocument();
    expect(screen.getByText(PROBLEM)).toBeInTheDocument();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0][0].nodeId).toBe(NODE);
  });

  it('uses the node it is handed over the one it finds for the problem', async () => {
    const ask = fakeGrind();
    await renderHomework(ask, { node: 'count-to-5' });
    await screen.findByTestId('mnemonic-picture');
    expect(ask.mock.calls[0][0].nodeId).toBe('count-to-5');
  });

  it('shows no picture, and asks for none, for a problem the graph has not seen', async () => {
    const ask = fakeGrind();
    await renderHomework(ask, { targetText: 'A problem nobody has written down.' });
    expect(screen.getByText('A problem nobody has written down.')).toBeInTheDocument();
    expect(screen.queryByTestId('mnemonic-picture')).toBeNull();
    expect(ask).not.toHaveBeenCalled();
  });

  it('with no licence makes no call and shows a kept picture only', async () => {
    setLicenceStatus({ state: 'none', checkedAt: Date.now() } as never);
    const ask = fakeGrind();
    await renderHomework(ask);
    expect(screen.queryByTestId('mnemonic-picture')).toBeNull();
    expect(ask).not.toHaveBeenCalled();
  });
});

describe('one module asks for the pictures', () => {
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
    });

  it("names the grind ('mnemonic-picture') in src/learn/mnemonic-pictures.ts only", () => {
    const naming = sources('src').filter((file) => /['"`]mnemonic-picture['"`]/.test(readFileSync(file, 'utf8')) && !/data-testid="mnemonic-picture"/.test(readFileSync(file, 'utf8')));
    expect(naming).toEqual(['src/learn/mnemonic-pictures.ts']);
  });

  it('has no second copy: the maths world reaches the picture only through that module', () => {
    for (const file of sources('src/worlds/maths')) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/sendGrist|readAnswer|mnemonicPictures|svg-rules/);
    }
    expect(readFileSync('src/worlds/maths/maths-pictures.ts', 'utf8')).toContain("from '../../learn/mnemonic-pictures'");
  });
});

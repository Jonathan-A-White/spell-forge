// Kestrel 19a (mw-79en7t.57), AC1: the maths flow runs the placement on first entry, then the frontier and the due reviews through
// @learn-kit/drill over the maths graph; an answer is checked locally against the item (no network), a right one counts toward solid
// by the node's own rule and a wrong one does not.
// Kestrel 19b (mw-79en7t.58), AC1: the hear, see and do forms of the maths drill each render an item; hear speaks the problem through
// voice-kit's speak in the language named; do takes the answer dragged (number tiles) or spoken (the Composer, typing off), and either
// is checked locally through the flow. Speech and the microphone are voice-kit's honest fakes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { stop } from 'voice-kit/speech';
import { installSpeech, type SpeechFake } from 'voice-kit/testing/speech';
import { clips, installMic } from 'voice-kit/testing/mic';
import { MemoryFreshStore, asked, isToConfirm, type FreshStore } from 'learn-kit/fresh';
import { DAY, memoryStore, validate, type GraphStore } from 'learn-kit/graph';
import { checkAnswer, mathsGraph, mathsNode, problemKey, wrongAnswerFor, type MathsItem, type MathsNode } from '../../src/learn/maths';
import { MathsWorld } from '../../src/worlds/maths/MathsWorld';
import { MATHS_FORM_IDS, askForms, formFor, openForm, spokenAnswer, type AskProps } from '../../src/worlds/maths/drill-forms';
import {
  createMathsFlow,
  memoryKeep,
  triesSolid,
  type MathsFlow,
  type MathsKeep,
  type MathsQuestion,
} from '../../src/worlds/maths/maths-flow';

const NOW = Date.UTC(2026, 9, 25, 9, 0, 0);
const levelOf = (id: string): number => (mathsGraph.byId.get(id) as MathsNode).level;
const nodeOf = (id: string): MathsNode => mathsGraph.byId.get(id) as MathsNode;

let store: GraphStore;
let keep: MathsKeep;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  store = memoryStore();
  keep = memoryKeep();
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function flowOver(over: Partial<Parameters<typeof createMathsFlow>[0]> = {}): MathsFlow {
  return createMathsFlow({ store, keep, now: () => NOW, seed: 7, ...over });
}

/** The right answer of a question, as the child would give it. */
const rightOf = (q: MathsQuestion): string => q.item.answer;

/** Plays the placement to its end with a child who knows every node of level `knows` or below. Returns the questions asked. */
async function placeChild(flow: MathsFlow, knows: number): Promise<MathsQuestion[]> {
  const asked: MathsQuestion[] = [];
  for (let q = await flow.question(); q && q.stage === 'placement'; q = await flow.question()) {
    asked.push(q);
    await flow.answer(levelOf(q.nodeId) <= knows ? rightOf(q) : wrongAnswerFor(q.item));
    expect(asked.length).toBeLessThan(40);
  }
  return asked;
}

describe('the placement, on first entry', () => {
  it('opens with a placement question about a node, with its problem and its hint but not asking for a network', async () => {
    const q = await flowOver().question();
    expect(q).not.toBeNull();
    expect(q!.stage).toBe('placement');
    expect(q!.item.problem).not.toBe('');
    expect(q!.nodeName).toBe(nodeOf(q!.nodeId).name);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('asks the same question until it is answered', async () => {
    const flow = flowOver();
    const first = await flow.question();
    expect((await flow.question())!.key).toBe(first!.key);
  });

  it('writes what the child passed as solid, and then moves on to the frontier', async () => {
    const flow = flowOver();
    const asked = await placeChild(flow, 1);
    expect(asked.length).toBeGreaterThan(0);

    const states = await store.entries();
    const solid = [...states].filter(([, s]) => s.level === 'solid').map(([id]) => id);
    expect(solid.length).toBeGreaterThan(0);
    expect(solid.every((id) => levelOf(id) <= 1)).toBe(true);
    // the placement is over: what follows is the frontier
    const next = await flow.question();
    expect(next!.stage).toBe('frontier');
    expect(states.get(next!.nodeId)?.level).not.toBe('solid');
    // and everything its node rests on is solid
    for (const need of nodeOf(next!.nodeId).needs) expect(states.get(need)?.level).toBe('solid');
  });

  it('a child who knows nothing is placed at the bottom: the frontier is a node that needs nothing', async () => {
    const flow = flowOver();
    await placeChild(flow, -1);
    const next = await flow.question();
    expect(next!.stage).toBe('frontier');
    expect(nodeOf(next!.nodeId).needs).toEqual([]);
    expect([...(await store.entries())].some(([, s]) => s.level === 'solid')).toBe(false);
  });

  it('is asked once: a flow made again over what was kept goes straight to the frontier', async () => {
    await placeChild(flowOver(), 1);
    const again = await flowOver().question();
    expect(again!.stage).toBe('frontier');
  });

  it('is picked up where it was left: a flow made again over a half-done placement asks the next question', async () => {
    const flow = flowOver();
    const first = await flow.question();
    await flow.answer(rightOf(first!));
    const again = await flowOver().question();
    expect(again!.stage).toBe('placement');
    expect(again!.key).not.toBe(first!.key);
  });

  it('does not ask what the store already holds solid', async () => {
    const solidAlready = mathsGraph.nodes.filter((n) => n.level === 0).map((n) => n.id);
    for (const id of solidAlready) await store.put(id, { level: 'solid', since: NOW, how: 'tested-out' });
    const asked = await placeChild(flowOver(), 99);
    expect(asked.some((q) => solidAlready.includes(q.nodeId))).toBe(false);
  });
});

describe('frontier drills, checked on the phone', () => {
  async function placedAtBottom(): Promise<MathsFlow> {
    const flow = flowOver();
    await placeChild(flow, -1);
    return flow;
  }

  it('a right answer is right by the item, whether it is a number word, a digit or a spelling the checker reads', async () => {
    const flow = await placedAtBottom();
    const q = (await flow.question())!;
    const result = await flow.answer(`  ${q.item.answer.toUpperCase()}  `);
    expect(result.right).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a right answer counts toward solid: the node is solid once it has the right count of its rule, and not before', async () => {
    const flow = await placedAtBottom();
    const first = (await flow.question())!;
    const node = nodeOf(first.nodeId);
    let rights = 0;
    // answer the node's questions right as they come; other nodes' questions are answered wrong so they stay out of the way
    for (let i = 0; i < 80 && (await store.get(node.id))?.level !== 'solid'; i++) {
      const q = (await flow.question())!;
      if (q.nodeId === node.id) {
        const before = (await store.get(node.id))?.level;
        const result = await flow.answer(rightOf(q));
        rights += 1;
        expect(result.right).toBe(true);
        expect(result.counted).toBe(true);
        if (rights < node.solid.right) expect(before).not.toBe('solid');
        expect(result.solid).toBe(rights >= node.solid.right);
      } else {
        await flow.answer(wrongAnswerFor(q.item));
      }
    }
    expect(rights).toBe(node.solid.right);
    expect((await store.get(node.id))?.level).toBe('solid');
  });

  it('a wrong answer does not count: the node stays unsolid however many are given', async () => {
    const flow = await placedAtBottom();
    const first = (await flow.question())!;
    const node = nodeOf(first.nodeId);
    let seen = 0;
    for (let i = 0; i < 60; i++) {
      const q = (await flow.question())!;
      const result = await flow.answer(wrongAnswerFor(q.item));
      expect(result.right).toBe(false);
      expect(result.counted).toBe(false);
      expect(result.solid).toBe(false);
      if (q.nodeId === node.id) seen += 1;
    }
    expect(seen).toBeGreaterThan(0);
    expect((await store.get(node.id))?.level).not.toBe('solid');
    expect([...(await store.entries())].some(([, s]) => s.level === 'solid')).toBe(false);
  });

  it('a right answer given with a hint is not counted', async () => {
    const flow = await placedAtBottom();
    const q = (await flow.question())!;
    const result = await flow.answer(rightOf(q), { hinted: true });
    expect(result.right).toBe(true);
    expect(result.counted).toBe(false);
  });

  it('keeps the tries, so a flow made again goes on from them', async () => {
    const flow = await placedAtBottom();
    const q = (await flow.question())!;
    await flow.answer(rightOf(q));
    expect((await keep.load()).tries[q.nodeId]).toEqual([true]);
    const again = flowOver();
    await again.answer(wrongAnswerFor((await again.question())!.item));
    expect(Object.values((await keep.load()).tries).flat()).toContain(false);
  });

  it('never calls the network', async () => {
    const flow = await placedAtBottom();
    for (let i = 0; i < 6; i++) await flow.answer(rightOf((await flow.question())!));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// Kestrel 20a (mw-16yxp1k.1), AC2 and AC4: a node is proved on a problem he has not seen (learn-kit/fresh).
describe('proving on a fresh problem', () => {
  let fresh: FreshStore;

  beforeEach(() => {
    fresh = new MemoryFreshStore();
  });

  async function placedAtBottom(over: Partial<Parameters<typeof createMathsFlow>[0]> = {}): Promise<MathsFlow> {
    const flow = flowOver({ fresh, ...over });
    await placeChild(flow, -1);
    return flow;
  }

  /** Answers the questions of other nodes wrong, until one of `nodeId` comes. */
  async function questionOf(flow: MathsFlow, nodeId: string): Promise<MathsQuestion> {
    for (let i = 0; i < 40; i += 1) {
      const q = (await flow.question())!;
      if (q.nodeId === nodeId) return q;
      await flow.answer(wrongAnswerFor(q.item));
    }
    throw new Error(`no question of ${nodeId}`);
  }

  it('marks every problem asked under its node, the placement\'s too, by the problem as it is asked', async () => {
    const flow = flowOver({ fresh });
    const q = (await flow.question())!;
    expect(q.stage).toBe('placement');
    await flow.answer(rightOf(q));
    expect(await asked(fresh, q.nodeId)).toEqual([problemKey(q.item)]);
  });

  it('a miss, then a right on the problem again, marks the node to confirm and does not go solid or count', async () => {
    const flow = await placedAtBottom();
    const q1 = (await flow.question())!;
    const missed = await flow.answer(wrongAnswerFor(q1.item));
    expect(missed.verdict).toBe('missed');

    const again = (await flow.question())!;
    expect([again.nodeId, again.item.problem, again.repeat]).toEqual([q1.nodeId, q1.item.problem, true]);
    const result = await flow.answer(rightOf(again));
    expect(result.right).toBe(true);
    expect(result.verdict).toBe('to-confirm');
    expect(result.solid).toBe(false);
    expect(await isToConfirm(fresh, q1.nodeId)).toBe(true);
    expect((await keep.load()).tries[q1.nodeId]).toEqual([false]); // the seen right is no try
    expect((await store.get(q1.nodeId))?.review?.lapses).toBe(1); // and moved nothing on
  });

  it('the next ask is a different problem, and the node is solid only after a fresh right: not on the seen one, not before the rule is met', async () => {
    const flow = await placedAtBottom();
    const q1 = (await flow.question())!;
    const node = nodeOf(q1.nodeId);
    await flow.answer(wrongAnswerFor(q1.item));
    await flow.answer(rightOf((await flow.question())!)); // the repeat: to confirm
    const seen = new Set([problemKey(q1.item)]);

    let fresh_rights = 0;
    while (fresh_rights < node.solid.right) {
      const q = await questionOf(flow, node.id);
      expect(seen.has(problemKey(q.item))).toBe(false);
      seen.add(problemKey(q.item));
      const result = await flow.answer(rightOf(q));
      fresh_rights += 1;
      expect(result.verdict).toBe('known');
      expect(await isToConfirm(fresh, node.id)).toBe(false);
      // the miss is the first of the last `of` tries: the rule holds on the `right`th fresh right with the seen right never counted
      expect(result.solid).toBe(fresh_rights >= node.solid.right);
    }
    expect((await store.get(node.id))?.level).toBe('solid');
  });

  it('a fresh problem answered wrong while the node is to confirm returns it to its due reviews, and takes the mark off', async () => {
    const flow = await placedAtBottom();
    const q1 = (await flow.question())!;
    await flow.answer(wrongAnswerFor(q1.item));
    await flow.answer(rightOf((await flow.question())!));
    expect(await isToConfirm(fresh, q1.nodeId)).toBe(true);

    const q = await questionOf(flow, q1.nodeId);
    expect(q.item.problem).not.toBe(q1.item.problem);
    const result = await flow.answer(wrongAnswerFor(q.item));
    expect(result.verdict).toBe('missed');
    expect(result.solid).toBe(false);
    expect(await isToConfirm(fresh, q1.nodeId)).toBe(false);
    const row = (await store.get(q1.nodeId))!.review!;
    expect(row.lapses).toBe(2);
    expect(row.due).toBe(NOW + DAY);
    expect((await keep.load()).tries[q1.nodeId]).toEqual([false, false]);
  });

  it('a fresh right counts as ever when the node was never missed, and a right after a hint is no proof', async () => {
    const flow = await placedAtBottom();
    const q = (await flow.question())!;
    const hinted = await flow.answer(rightOf(q), { hinted: true });
    expect([hinted.right, hinted.counted, hinted.verdict]).toEqual([true, false, 'missed']);
    expect(await asked(fresh, q.nodeId)).toContain(problemKey(q.item));
    const next = await questionOf(flow, q.nodeId);
    expect((await flow.answer(rightOf(next))).verdict).toBe('known');
  });

  it('puts a missed problem once more, not a third time', async () => {
    const flow = await placedAtBottom();
    const q1 = (await flow.question())!;
    await flow.answer(wrongAnswerFor(q1.item));
    const again = (await flow.question())!;
    await flow.answer(wrongAnswerFor(again.item));
    const third = (await flow.question())!;
    expect(third.repeat).toBeUndefined();
    expect(third.item.problem === q1.item.problem && third.nodeId === q1.nodeId).toBe(false);
  });

  it('never asks a problem of a node twice while it has others he has not seen', async () => {
    const flow = await placedAtBottom();
    const first = (await flow.question())!;
    const problems = new Set<string>();
    for (let i = 0; i < 16; i += 1) {
      const q = await questionOf(flow, first.nodeId);
      expect(problems.has(problemKey(q.item))).toBe(false);
      problems.add(problemKey(q.item));
      await flow.answer(rightOf(q));
      if ((await store.get(first.nodeId))?.level === 'solid') break;
    }
    expect(problems.size).toBeGreaterThanOrEqual(nodeOf(first.nodeId).solid.right);
  });

  it('starts a node\'s ledger over when its generator has no problem left that he has not seen, so it can still be proved', async () => {
    const tiny = mathsNode({ id: 'tiny', band: 'preK', name: 'Tiny', item: (i) => [`What is ${i % 3} + 1?`, String((i % 3) + 1), 'Count on.'], solid: { right: 3, of: 4 } });
    const flow = flowOver({ fresh, graph: validate([tiny]) as never });
    for (let q = await flow.question(); q && q.stage === 'placement'; q = await flow.question()) await flow.answer(wrongAnswerFor(q.item));
    const seen: string[] = [];
    for (let i = 0; i < 12 && (await store.get('tiny'))?.level !== 'solid'; i += 1) {
      const q = (await flow.question())!;
      seen.push(q.item.problem);
      await flow.answer(rightOf(q));
    }
    expect((await store.get('tiny'))?.level).toBe('solid');
    expect(new Set(seen).size).toBe(3);
    expect(seen.length).toBeGreaterThan(3);
  });
});

describe('due reviews', () => {
  it('comes back to a solid node when its review falls due', async () => {
    const flow = flowOver();
    await placeChild(flow, 1);
    const solid = [...(await store.entries())].filter(([, s]) => s.level === 'solid');
    expect(solid.length).toBeGreaterThan(0);

    const later = createMathsFlow({ store, keep, seed: 7, now: () => NOW + 31 * DAY });
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const q = (await later.question())!;
      seen.add(q.stage);
      await later.answer(rightOf(q));
    }
    expect(seen.has('due')).toBe(true);
  });
});

describe('triesSolid', () => {
  const rule = { right: 3, of: 4 };
  it('is solid when the last tries hold the rule', () => {
    expect(triesSolid([true, true, true], rule)).toBe(true);
    expect(triesSolid([false, true, true, true], rule)).toBe(true);
  });
  it('is not solid on too few rights, or too few tries', () => {
    expect(triesSolid([true, true], rule)).toBe(false);
    expect(triesSolid([true, false, false, true], rule)).toBe(false);
    expect(triesSolid([], rule)).toBe(false);
  });
  it('looks only at the last `of` tries', () => {
    expect(triesSolid([true, true, true, false, false, true], rule)).toBe(false);
  });
});

// ─── Kestrel 19b: hear, see and do ────────────────────────

const ITEM: MathsItem = { problem: 'What is 7 plus 5?', answer: '12', hint: 'Count on from the bigger one.' };

/** A form with the answer kept as the world keeps it: `value` is the answer so far. */
function Harness(props: { form: string; item?: MathsItem; language?: string; onSpoken?: (said: string) => void; onValue?: (value: string) => void }) {
  const [value, setValue] = useState('');
  const { onValue } = props;
  useEffect(() => onValue?.(value), [onValue, value]);
  const ask: AskProps = {
    item: props.item ?? ITEM,
    language: props.language ?? 'en',
    value,
    onChange: setValue,
    onSpoken: props.onSpoken ?? (() => undefined),
  };
  return openForm(props.form as (typeof MATHS_FORM_IDS)[number], ask);
}
const show = (form: string, rest: Omit<Parameters<typeof Harness>[0], 'form'> = {}) => render(createElement(Harness, { form, ...rest }));

describe('the hear, see and do forms', () => {
  let speech: SpeechFake;
  let mic: ReturnType<typeof installMic>;

  beforeEach(async () => {
    speech = installSpeech(window, { msPerWord: 1, baseMs: 1, voicesDelayMs: 1 });
    mic = installMic(window, { clip: { ...clips.english, transcript: 'twelve' }, grantMs: 1, openMs: 1, silenceMs: 1 });
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  afterEach(() => {
    cleanup();
    act(() => stop());
    mic.uninstall();
    speech.uninstall();
    vi.restoreAllMocks();
  });

  it('registers the four forms for the kit, the type box beside the three new ones', () => {
    expect([...MATHS_FORM_IDS]).toEqual(['type', 'hear', 'see', 'do']);
    for (const id of MATHS_FORM_IDS) expect(askForms.get(id).id).toBe(id);
  });

  it('hear: draws the problem and a box, and speaks the problem in the language named', async () => {
    show('hear', { language: 'es' });
    expect(screen.getByText(ITEM.problem)).toBeInTheDocument();
    expect(screen.getByLabelText('Your answer')).toBeInTheDocument();
    await vi.waitFor(() => expect(speech.log.length).toBeGreaterThan(0));
    expect(speech.log[0].text).toBe(ITEM.problem);
    expect(speech.log[0].lang).toBe('es-ES');
  });

  it('hear: says it again on a tap', async () => {
    show('hear');
    await vi.waitFor(() => expect(speech.log).toHaveLength(1));
    await vi.waitFor(() => expect(speech.log[0].outcome).toBe('ended'));
    fireEvent.click(screen.getByRole('button', { name: 'Hear it again' }));
    await vi.waitFor(() => expect(speech.log).toHaveLength(2));
    expect(speech.log[1].lang).toBe('en-US');
  });

  it('see: draws the problem as a picture under the one scroll box, with a box for the answer', () => {
    const { container } = show('see');
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('role')).toBe('img');
    expect(svg!.getAttribute('aria-label')).toBe(ITEM.problem);
    expect(screen.getByText(ITEM.problem)).toBeInTheDocument();
    expect(svg!.getAttribute('viewBox')).toMatch(/^0 0 \d+ \d+$/);
    // no box of its own to scroll: a fixed pixel size or overflow would fight the Shell's one scroll box
    expect(svg!.getAttribute('width')).toBeNull();
    expect(container.querySelector('[style*="overflow"]')).toBeNull();
    expect(screen.getByLabelText('Your answer')).toBeInTheDocument();
  });

  it('see: breaks a long problem into lines of the picture, and speaks nothing', () => {
    const long = { ...ITEM, problem: 'A baker puts 24 buns on trays, 6 on each tray. How many trays does the baker fill?' };
    const { container } = show('see', { item: long });
    expect(container.querySelectorAll('svg text').length).toBeGreaterThan(1);
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toBe(long.problem);
    expect(speech.log).toEqual([]);
  });

  it('type: is the box it always was, with the problem as text', () => {
    show('type');
    expect(screen.getByText(ITEM.problem)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: '12' } });
    expect((screen.getByLabelText('Your answer') as HTMLInputElement).value).toBe('12');
  });

  it('do: draws the problem, number tiles and a hold-to-talk bar, and no keyboard', async () => {
    show('do');
    expect(screen.getByText(ITEM.problem)).toBeInTheDocument();
    for (const symbol of '0123456789') expect(screen.getByRole('button', { name: symbol })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Hold to say it' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(speech.log).toEqual([]);
  });

  it('do: takes a dragged answer, tile after tile into the answer, and the phone checks it', () => {
    const seen = { value: '' };
    show('do', { onValue: (v) => { seen.value = v; } });
    const zone = screen.getByTestId('answer-zone');
    const elementFromPoint = vi.fn(() => zone);
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: elementFromPoint });
    for (const symbol of ['1', '2']) {
      const tile = screen.getByRole('button', { name: symbol });
      fireEvent.pointerDown(tile, { pointerId: 1, clientX: 10, clientY: 300 });
      fireEvent.pointerMove(tile, { pointerId: 1, clientX: 60, clientY: 40 });
      fireEvent.pointerUp(tile, { pointerId: 1, clientX: 60, clientY: 40 });
    }
    expect(seen.value).toBe('12');
    expect(zone.textContent).toContain('12');
    expect(checkAnswer(ITEM, seen.value)).toBe(true);
    Reflect.deleteProperty(document, 'elementFromPoint');
  });

  it('do: a drag let go outside the answer places nothing, and a tap places the tile', () => {
    const seen = { value: '' };
    show('do', { onValue: (v) => { seen.value = v; } });
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => document.body });
    const tile = screen.getByRole('button', { name: '7' });
    fireEvent.pointerDown(tile, { pointerId: 1, clientX: 10, clientY: 300 });
    fireEvent.pointerUp(tile, { pointerId: 1, clientX: 200, clientY: 500 });
    expect(seen.value).toBe('');
    fireEvent.click(tile);
    expect(seen.value).toBe('7');
    Reflect.deleteProperty(document, 'elementFromPoint');
  });

  it('do: takes the last tile back, and all of them', () => {
    const seen = { value: '' };
    show('do', { onValue: (v) => { seen.value = v; } });
    for (const symbol of ['3', '/', '4']) fireEvent.click(screen.getByRole('button', { name: symbol }));
    expect(seen.value).toBe('3/4');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(seen.value).toBe('3/');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(seen.value).toBe('');
  });

  it('do: takes a spoken answer by holding the bar, and the phone checks it', { timeout: 20000 }, async () => {
    const said: string[] = [];
    show('do', { onSpoken: (s) => said.push(s) });
    const bar = await screen.findByRole('button', { name: 'Hold to say it' });
    fireEvent.pointerDown(bar, { pointerId: 1 });
    await screen.findByTestId('live-transcript');
    await vi.waitFor(() => expect(screen.getByTestId('live-transcript').textContent).toBe('twelve'), { timeout: 8000 });
    await act(async () => {
      fireEvent.pointerUp(bar, { pointerId: 1 });
    });
    await vi.waitFor(() => expect(said).toEqual(['twelve']));
    expect(checkAnswer(ITEM, said[0])).toBe(true);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('reads what is said as an answer: digits for number words round a point, a slash for over, no full stop', () => {
    expect(spokenAnswer('Twelve.')).toBe('twelve');
    expect(spokenAnswer(' 3 over 4 ')).toBe('3/4');
    expect(spokenAnswer('zero point three')).toBe('0.3');
    expect(spokenAnswer('2 to 3')).toBe('2 to 3');
  });

  it('chooses a form for a question the same way every time, and the tiles only for an answer made of them', () => {
    const q = { key: 'n:3', item: ITEM };
    expect(formFor(q)).toBe(formFor(q));
    const word: MathsItem = { problem: 'Which shape has three sides?', answer: 'triangle', hint: 'Count the corners.' };
    const picked = new Set<string>();
    for (let i = 0; i < 60; i++) picked.add(formFor({ key: `n:${i}`, item: word }));
    expect(picked.has('do')).toBe(false);
    expect(picked.size).toBe(3);
    const numbers = new Set<string>();
    for (let i = 0; i < 60; i++) numbers.add(formFor({ key: `n:${i}`, item: ITEM }));
    expect([...numbers].sort()).toEqual(['do', 'hear', 'see', 'type']);
    expect(formFor(q, ['type'])).toBe('type');
  });

  it('checks a dragged answer through the flow on the phone, with no call out', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const flow = flowOver();
    const q = (await flow.question())!;
    const seen = { value: '' };
    show('do', { item: q.item, onValue: (v) => { seen.value = v; } });
    for (const ch of q.item.answer) {
      const name = ch;
      if (/^[0-9./:-]$/.test(name)) fireEvent.click(screen.getByRole('button', { name }));
    }
    const answered = await flow.answer(seen.value);
    expect(answered.right).toBe(checkAnswer(q.item, q.item.answer));
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  describe('in the Maths world', () => {
    const question: MathsQuestion = { key: 'n:1', stage: 'frontier', nodeId: 'x', nodeName: 'Adding', form: 'type', item: ITEM };
    function stubFlow() {
      const given: string[] = [];
      const flow: MathsFlow = {
        question: async () => question,
        answer: async (said) => {
          given.push(said);
          return { right: checkAnswer(ITEM, said), counted: true, nodeId: 'x', stage: 'frontier', solid: false, placementOver: false };
        },
      };
      return { flow, given };
    }

    it('puts the question in the form it is given, and a spoken answer is checked at once', { timeout: 20000 }, async () => {
      const { flow, given } = stubFlow();
      await act(async () => void render(createElement(MathsWorld, { flow, forms: ['do'] })));
      const bar = await screen.findByRole('button', { name: 'Hold to say it' });
      expect(screen.queryByRole('textbox')).toBeNull();
      fireEvent.pointerDown(bar, { pointerId: 1 });
      await screen.findByTestId('live-transcript');
      await vi.waitFor(() => expect(screen.getByTestId('live-transcript').textContent).toBe('twelve'), { timeout: 8000 });
      await act(async () => {
        fireEvent.pointerUp(bar, { pointerId: 1 });
      });
      await vi.waitFor(() => expect(given).toEqual(['twelve']));
      expect(await screen.findByText(/Right/)).toBeInTheDocument();
    });

    it('checks tiles placed and then Check, and speaks the problem in the world\'s language for hear', async () => {
      const { flow, given } = stubFlow();
      const view = await act(async () => render(createElement(MathsWorld, { flow, forms: ['do'], language: 'es' })));
      for (const symbol of ['1', '2']) fireEvent.click(screen.getByRole('button', { name: symbol }));
      await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Check' })));
      expect(given).toEqual(['12']);
      expect(await screen.findByText(/Right/)).toBeInTheDocument();
      view.unmount();

      const again = stubFlow();
      await act(async () => void render(createElement(MathsWorld, { flow: again.flow, forms: ['hear'], language: 'es' })));
      await vi.waitFor(() => expect(speech.log.at(-1)?.lang).toBe('es-ES'));
      expect(speech.log.at(-1)?.text).toBe(ITEM.problem);
    });
  });
});

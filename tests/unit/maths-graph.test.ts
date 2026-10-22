// The maths graph's shape and its number nodes (preK to 5): the graph validates through learn-kit, the bands preK, K, 1-2 and 3-5
// have nodes, every node carries what docs/maths-graph.md says it does, and every item checks its own answer (mw-79en7t.54).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GraphError, order, validate } from 'learn-kit/graph';
import {
  GRADE_BANDS,
  MATHS_NODES,
  MIN_ITEMS,
  NUMBER_NODES,
  bandLevel,
  checkAnswer,
  itemAt,
  mathsGraph,
  nodeProblems,
  nodesInBand,
  wrongAnswerFor,
  type MathsNode,
} from '../../src/learn/maths';

const doc = readFileSync('docs/maths-graph.md', 'utf8');

/** How many generated items past the node's own are checked: the generator must hold for any index. */
const GENERATED = 24;

const everyItem = (node: MathsNode) => Array.from({ length: GENERATED }, (_, i) => itemAt(node, i));

describe('the maths graph', () => {
  it('validates through learn-kit: a DAG with no unknown needs', () => {
    expect(() => validate(MATHS_NODES)).not.toThrow();
    expect(mathsGraph.nodes).toHaveLength(MATHS_NODES.length);
    const sequence = order(mathsGraph);
    expect(sequence).toHaveLength(MATHS_NODES.length);
    for (const node of MATHS_NODES) {
      for (const need of node.needs) expect(sequence.indexOf(need)).toBeLessThan(sequence.indexOf(node.id));
    }
  });

  it('refuses a cycle and an unknown need, naming the node', () => {
    const base = MATHS_NODES[0];
    const cycle: MathsNode[] = [
      { ...base, id: 'a', needs: ['b'] },
      { ...base, id: 'b', needs: ['a'] },
    ];
    expect(() => validate(cycle)).toThrow(GraphError);
    const unknown: MathsNode[] = [{ ...base, id: 'lonely', needs: ['nowhere'] }];
    expect(() => validate(unknown)).toThrow(/lonely needs nowhere/);
  });

  it('has nodes in the bands preK, K, 1-2 and 3-5, the ones this story fills', () => {
    for (const band of ['preK', 'K', '1-2', '3-5'] as const) expect(nodesInBand(band).length, band).toBeGreaterThan(0);
  });

  it('lists the six grade bands from the youngest up, each a level above the one before', () => {
    expect(GRADE_BANDS).toEqual(['preK', 'K', '1-2', '3-5', '6-8', '9-12']);
    GRADE_BANDS.forEach((band, i) => expect(bandLevel(band)).toBe(i));
  });

  it('puts a node at its band level, and never has it need a node of a later band', () => {
    for (const node of MATHS_NODES) {
      expect(node.level, node.id).toBe(bandLevel(node.band));
      for (const need of node.needs) {
        expect(bandLevel(mathsGraph.byId.get(need)!.band), `${node.id} needs ${need}`).toBeLessThanOrEqual(bandLevel(node.band));
      }
    }
  });

  it('starts the youngest band from nothing, and every later node rests on something', () => {
    expect(nodesInBand('preK').some((n) => n.needs.length === 0)).toBe(true);
    for (const node of MATHS_NODES.filter((n) => n.needs.length === 0)) expect(node.band, node.id).toBe('preK');
  });

  it('gives every node at least 3 items, a solid rule and a child-facing name', () => {
    expect(MIN_ITEMS).toBe(3);
    for (const node of MATHS_NODES) {
      expect(node.items.length, node.id).toBeGreaterThanOrEqual(MIN_ITEMS);
      expect(node.solid.right, node.id).toBeGreaterThanOrEqual(1);
      expect(node.solid.of, node.id).toBeGreaterThanOrEqual(node.solid.right);
      expect(node.name.trim().length, node.id).toBeGreaterThan(0);
      expect(node.name, `${node.id} name is one line`).not.toMatch(/\n/);
    }
  });

  it('covers counting, place value, fractions and ratios', () => {
    const ids = NUMBER_NODES.map((n) => n.id).join(' ');
    for (const part of ['count', 'place-value', 'fraction', 'ratio']) expect(ids, part).toContain(part);
  });

  it('keeps ids unique and kebab-case', () => {
    const ids = MATHS_NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe('the items of a node', () => {
  it("checks each item's answer: its own is accepted, another is refused", () => {
    for (const node of MATHS_NODES) {
      for (const item of node.items) {
        expect(checkAnswer(item, item.answer), `${node.id}: ${item.problem}`).toBe(true);
        expect(checkAnswer(item, wrongAnswerFor(item)), `${node.id}: ${item.problem} refuses ${wrongAnswerFor(item)}`).toBe(false);
        const other = node.items.find((o) => !checkAnswer(item, o.answer));
        if (other) expect(checkAnswer(item, other.answer)).toBe(false);
      }
    }
  });

  it('holds for any index the generator is asked for, not only the first few', () => {
    for (const node of MATHS_NODES) {
      for (const item of everyItem(node)) {
        expect(checkAnswer(item, item.answer), `${node.id}: ${item.problem}`).toBe(true);
        expect(checkAnswer(item, wrongAnswerFor(item)), `${node.id}: ${item.problem}`).toBe(false);
      }
      expect(itemAt(node, 3), `${node.id} is deterministic`).toEqual(itemAt(node, 3));
    }
  });

  it('never lets a hint equal the answer, or say it', () => {
    for (const node of MATHS_NODES) {
      for (const item of everyItem(node)) {
        expect(item.hint.trim().length, `${node.id}: ${item.problem}`).toBeGreaterThan(0);
        expect(item.hint, `${node.id}: ${item.problem}`).not.toBe(item.answer);
        expect(checkAnswer(item, item.hint), `${node.id}: the hint ${item.hint} checks as the answer`).toBe(false);
      }
    }
  });

  it('asks different problems in a node', () => {
    for (const node of MATHS_NODES) {
      expect(new Set(node.items.map((i) => i.problem)).size, `${node.id} asks a problem twice`).toBe(node.items.length);
    }
  });

  it('accepts the other ways a child says the same answer', () => {
    const count = itemAt(NUMBER_NODES.find((n) => n.id === 'count-to-10')!, 0);
    expect(checkAnswer(count, ` ${count.answer}. `)).toBe(true);
    const word = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][Number(count.answer)];
    expect(checkAnswer(count, word)).toBe(true);
    const fraction = { problem: '?', answer: '1/2', hint: 'h' };
    expect(checkAnswer(fraction, '2/4')).toBe(true);
    expect(checkAnswer(fraction, '0.5')).toBe(true);
    expect(checkAnswer(fraction, '1/3')).toBe(false);
    const ratio = { problem: '?', answer: '3:2', hint: 'h' };
    expect(checkAnswer(ratio, '3 to 2')).toBe(true);
    expect(checkAnswer(ratio, '2:3')).toBe(false);
    expect(checkAnswer(ratio, '3/2')).toBe(false);
    const big = { problem: '?', answer: '1500', hint: 'h' };
    expect(checkAnswer(big, '1,500')).toBe(true);
    expect(checkAnswer({ problem: '?', answer: 'a', hint: 'h' }, ' A ')).toBe(true);
    expect(checkAnswer(big, '')).toBe(false);
  });

  it('names what is wrong with a bad node', () => {
    const base = MATHS_NODES[0];
    const bad: MathsNode = {
      ...base,
      id: 'bad',
      name: ' ',
      solid: { right: 5, of: 3 },
      items: [{ problem: 'What is 2 and 3?', answer: '5', hint: '5' }],
      item: () => ({ problem: 'What is 2 and 3?', answer: '5', hint: 'Count on from 2 to 5' }),
    };
    const problems = nodeProblems(bad).join('\n');
    expect(problems).toMatch(/bad: needs at least 3 items/);
    expect(problems).toMatch(/bad: no child-facing name/);
    expect(problems).toMatch(/bad: solid rule/);
    expect(problems).toMatch(/bad: hint .* is the answer/);
    for (const node of MATHS_NODES) expect(nodeProblems(node), node.id).toEqual([]);
  });
});

describe('docs/maths-graph.md', () => {
  it('names every grade band', () => {
    for (const band of GRADE_BANDS) expect(doc, band).toContain(`\`${band}\``);
  });

  it('names the node shape: its id, needs, solid rule, items and name, and the item', () => {
    for (const field of ['id', 'band', 'needs', 'solid', 'items', 'item', 'name']) expect(doc, field).toContain(`\`${field}\``);
    for (const part of ['problem', 'answer', 'hint']) expect(doc, part).toContain(`\`${part}\``);
  });

  it('says how to add a node', () => {
    expect(doc).toMatch(/^#+ .*add a node/im);
  });

  it('names every node file and the learn-kit graph it is validated over', () => {
    for (const file of ['graph.ts', 'items.ts', 'nodes-number.ts']) expect(doc, file).toContain(file);
    expect(doc).toContain('learn-kit/graph');
  });

  it('names every number node', () => {
    for (const node of NUMBER_NODES) expect(doc, node.id).toContain(`\`${node.id}\``);
  });
});

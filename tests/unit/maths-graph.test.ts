// The maths graph's shape and its nodes: the number nodes (preK to 5, mw-79en7t.54) and the operations and algebra nodes (K to 12,
// mw-79en7t.55). The graph validates through learn-kit, all six bands have nodes, every node carries what docs/maths-graph.md says it
// does, and every item checks its own answer.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GraphError, order, validate } from 'learn-kit/graph';
import { ALGEBRA_NODES, HEART_OF_ALGEBRA, PASSPORT_TO_ADVANCED_MATH } from '../../src/learn/maths/nodes-algebra.ts';
import { OPERATION_NODES } from '../../src/learn/maths/nodes-operations.ts';
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

  it('has nodes in every band, preK up to 9-12', () => {
    for (const band of GRADE_BANDS) expect(nodesInBand(band).length, band).toBeGreaterThan(0);
    expect(nodesInBand('6-8').length).toBeGreaterThan(0);
    expect(nodesInBand('9-12').length).toBeGreaterThan(0);
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
    for (const file of ['graph.ts', 'items.ts', 'nodes-number.ts', 'nodes-operations.ts', 'nodes-algebra.ts']) expect(doc, file).toContain(file);
    expect(doc).toContain('learn-kit/graph');
  });

  it('names every number, operations and algebra node', () => {
    for (const node of [...NUMBER_NODES, ...OPERATION_NODES, ...ALGEBRA_NODES]) expect(doc, node.id).toContain(`\`${node.id}\``);
  });

  it('names the two SAT Math domains the algebra nodes cite', () => {
    expect(doc).toContain('Heart of Algebra');
    expect(doc).toContain('Passport to Advanced Math');
  });
});

const byId = (id: string): MathsNode => {
  const node = MATHS_NODES.find((n) => n.id === id);
  if (!node) throw new Error(`no node ${id}`);
  return node;
};

const bandsOf = (nodes: readonly MathsNode[]) => new Set(nodes.map((n) => n.band));

describe('the operations nodes (K to 6-8)', () => {
  it('are in the graph, in the bands K, 1-2, 3-5 and 6-8', () => {
    expect(OPERATION_NODES.length).toBeGreaterThan(0);
    for (const node of OPERATION_NODES) expect(MATHS_NODES, node.id).toContain(node);
    for (const band of ['K', '1-2', '3-5', '6-8'] as const) expect(bandsOf(OPERATION_NODES).has(band), band).toBe(true);
    expect(bandsOf(OPERATION_NODES).has('preK')).toBe(false);
    expect(bandsOf(OPERATION_NODES).has('9-12')).toBe(false);
  });

  it('cover the four operations on whole numbers, fractions, decimals and negative numbers', () => {
    const ids = OPERATION_NODES.map((n) => n.id).join(' ');
    for (const part of ['add', 'subtract', 'multiply', 'divide', 'fractions', 'decimals', 'integers', 'exponents', 'percent']) {
      expect(ids, part).toContain(part);
    }
  });

  it('rest on the number nodes: counting first, then place value, fractions and ratios', () => {
    const numbers = new Set(NUMBER_NODES.map((n) => n.id));
    const first = byId('add-within-10');
    expect(first.needs.every((need) => numbers.has(need))).toBe(true);
    for (const id of ['add-two-digit', 'decimals-add-subtract', 'fractions-add-different-bottom', 'percent-of']) {
      expect(byId(id).needs.some((need) => numbers.has(need)), id).toBe(true);
    }
  });

  it('count up in steps: no operation is met before the one under it', () => {
    const sequence = order(mathsGraph);
    expect(sequence.indexOf('add-within-10')).toBeLessThan(sequence.indexOf('add-within-20'));
    expect(sequence.indexOf('add-within-20')).toBeLessThan(sequence.indexOf('add-two-digit'));
    expect(sequence.indexOf('times-tables')).toBeLessThan(sequence.indexOf('divide-equal-groups'));
    expect(sequence.indexOf('multiply-multi-digit')).toBeLessThan(sequence.indexOf('divide-with-remainders'));
  });

  it('give the right answer to plain sums, differences, products and quotients', () => {
    const arithmetic = /^(?:.*?: )?(\d+) ([+−×÷]) (\d+) = \?$/;
    for (const id of ['add-within-10', 'subtract-within-10', 'add-within-20', 'subtract-within-20', 'add-two-digit', 'subtract-two-digit', 'times-tables']) {
      let seen = 0;
      for (const item of everyItem(byId(id))) {
        const parts = arithmetic.exec(item.problem);
        if (!parts) continue; // a word-problem form of the same node
        seen += 1;
        const a = Number(parts[1]);
        const b = Number(parts[3]);
        const want = { '+': a + b, '−': a - b, '×': a * b, '÷': a / b }[parts[2] as '+' | '−' | '×' | '÷'];
        expect(item.answer, `${id}: ${item.problem}`).toBe(String(want));
      }
      expect(seen, `${id} has plain forms`).toBeGreaterThan(0);
    }
  });

  it('pins a few items by hand', () => {
    expect(itemAt(byId('add-within-10'), 0)).toMatchObject({ problem: '1 + 2 = ?', answer: '3' });
    expect(itemAt(byId('order-of-operations'), 0)).toMatchObject({ problem: '2 + 3 × 4 = ?', answer: '14' });
    expect(itemAt(byId('fractions-multiply'), 0)).toMatchObject({ problem: '1/2 × 3/4 = ?', answer: '3/8' });
    expect(itemAt(byId('fractions-divide'), 3)).toMatchObject({ problem: '3 ÷ 1/4 = ?', answer: '12' });
    expect(itemAt(byId('integers-multiply-divide'), 0)).toMatchObject({ problem: '−2 × (−3) = ?', answer: '6' });
    expect(itemAt(byId('percent-of'), 2)).toMatchObject({ problem: 'What is 50% of 160?', answer: '80' });
  });
});

describe('the algebra nodes (6-8 to 9-12)', () => {
  it('are in the graph, in the bands 6-8 and 9-12 only', () => {
    expect(ALGEBRA_NODES.length).toBeGreaterThan(0);
    for (const node of ALGEBRA_NODES) {
      expect(MATHS_NODES, node.id).toContain(node);
      expect(['6-8', '9-12'], node.id).toContain(node.band);
    }
    expect(bandsOf(ALGEBRA_NODES)).toEqual(new Set(['6-8', '9-12']));
  });

  it('go from expressions to equations to functions', () => {
    const ids = ALGEBRA_NODES.map((n) => n.id).join(' ');
    for (const part of ['expression', 'equations', 'inequalities', 'function', 'slope', 'systems', 'quadratic', 'exponent']) {
      expect(ids, part).toContain(part);
    }
  });

  it('rest on the operations: the first expression node needs order of operations, an equation needs the one before it', () => {
    expect(byId('evaluate-expression').needs).toContain('order-of-operations');
    expect(byId('two-step-equations').needs).toContain('one-step-equations');
    const operations = new Set(OPERATION_NODES.map((n) => n.id));
    expect(byId('evaluate-expression').needs.every((need) => operations.has(need))).toBe(true);
  });

  it('cites the SAT Math domains by name on the 9-12 nodes: Heart of Algebra and Passport to Advanced Math', () => {
    expect(HEART_OF_ALGEBRA).toBe('sat:heart-of-algebra');
    expect(PASSPORT_TO_ADVANCED_MATH).toBe('sat:passport-to-advanced-math');
    const heart = ALGEBRA_NODES.filter((n) => n.tags?.includes(HEART_OF_ALGEBRA));
    const passport = ALGEBRA_NODES.filter((n) => n.tags?.includes(PASSPORT_TO_ADVANCED_MATH));
    expect(heart.length).toBeGreaterThanOrEqual(5);
    expect(passport.length).toBeGreaterThanOrEqual(5);
    for (const node of nodesInBand('9-12')) {
      const cited = node.tags?.includes(HEART_OF_ALGEBRA) || node.tags?.includes(PASSPORT_TO_ADVANCED_MATH);
      expect(cited, `${node.id} names its SAT domain`).toBe(true);
    }
    for (const node of [...heart, ...passport]) expect(node.tags, node.id).toContain('maths');
  });

  it('solve the equations they set: the answer makes the equation true', () => {
    // "Solve for x: <left> = <right>", the left side one of x + k, x − k, kx, x/k, kx + b, kx − b, x/k + b
    const equation = /^Solve for x: (.+) = (−?\d+)$/;
    const left = /^(\d+)?x(?:\/(\d+))?(?: ([+−]) (\d+))?$/;
    for (const id of ['one-step-equations', 'two-step-equations']) {
      for (const item of everyItem(byId(id))) {
        const sides = equation.exec(item.problem);
        expect(sides, `${id}: ${item.problem}`).not.toBeNull();
        const parts = left.exec(sides![1]);
        expect(parts, `${id}: ${sides![1]}`).not.toBeNull();
        const x = Number(item.answer);
        const scaled = (x * Number(parts![1] ?? 1)) / Number(parts![2] ?? 1);
        const value = parts![3] === '+' ? scaled + Number(parts![4]) : parts![3] === '−' ? scaled - Number(parts![4]) : scaled;
        expect(value, `${id}: ${item.problem}`).toBe(Number(sides![2].replace('−', '-')));
      }
    }
  });

  it('pins a few items by hand', () => {
    expect(itemAt(byId('systems-of-equations'), 0)).toMatchObject({ problem: 'x + y = 3 and x − y = 1. What is x?', answer: '2' });
    expect(itemAt(byId('equations-both-sides'), 0)).toMatchObject({ problem: 'Solve for x: 6x + 3 = 3x − 6', answer: '-3' });
    expect(itemAt(byId('quadratic-by-square-roots'), 3)).toMatchObject({ problem: 'Solve (x + 2)² = 36. What is the smaller solution?', answer: '-8' });
    expect(itemAt(byId('exponential-growth'), 0).answer).toBe('16');
    const sqrt = itemAt(byId('square-roots'), 0);
    expect(Number(sqrt.answer) ** 2).toBe(Number(/√(\d+)/.exec(sqrt.problem)![1]));
  });
});

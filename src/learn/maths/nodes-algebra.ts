// src/learn/maths/nodes-algebra.ts — The algebra nodes of the maths graph, 6-8 and 9-12: expressions, equations and inequalities,
// rates and lines, then systems, quadratics, powers and functions. They rest on the operations nodes (nodes-operations.ts).
// The 9-12 nodes (and the 6-8 ones that lead to them) cite the two SAT Math content domains they prepare for, by name: Heart of Algebra
// (linear equations, inequalities, systems and linear functions) and Passport to Advanced Math (quadratics, exponents, non-linear
// functions). The problems are written here, none copied from any test. Each node's `item(i)` makes its i-th item as
// [problem, answer, hint] from the index alone; a hint is a nudge with no number or number word in it. docs/maths-graph.md says how to add a node.

import { cycle, neg, plus, sup } from './format.ts';
import { mathsNode, type MathsNode } from './items.ts';
import { PROBLEM_SOLVING_AND_DATA_ANALYSIS } from './nodes-operations.ts';

/** The tag of a node that prepares for the SAT Math domain Heart of Algebra. */
export const HEART_OF_ALGEBRA = 'sat:heart-of-algebra';

/** The tag of a node that prepares for the SAT Math domain Passport to Advanced Math. */
export const PASSPORT_TO_ADVANCED_MATH = 'sat:passport-to-advanced-math';

const HEART = [HEART_OF_ALGEBRA];
const PASSPORT = [PASSPORT_TO_ADVANCED_MATH];

/** A nonzero number from the list's mod: 0 becomes the fallback, so a root or term is never zero. */
const nonzero = (n: number, fallback: number): number => (n === 0 ? fallback : n);

// ─── 6-8: expressions, equations, rates, the plane, lines, function machines ───────

const LETTERS = ['n', 'x', 't', 'k'];

const middle: MathsNode[] = [
  mathsNode({
    id: 'evaluate-expression',
    band: '6-8',
    name: 'Using a letter for a number',
    needs: ['order-of-operations', 'missing-number-within-20'],
    item: (i) => {
      const v = cycle(LETTERS, i);
      const n = 2 + ((i * 3) % 8);
      const a = 2 + ((i * 3 + 1) % 5);
      const b = 1 + ((i * 7 + 2) % 4);
      const mode = i % 3;
      const expr = mode === 0 ? `${a}${v} + ${b}` : mode === 1 ? `${a}${v} − ${b}` : `${a}(${v} + ${b})`;
      const value = mode === 0 ? a * n + b : mode === 1 ? a * n - b : a * (n + b);
      return [
        `If ${v} = ${n}, what is ${expr}?`,
        String(value),
        'Put the number in place of the letter, remembering that a number next to a letter means multiply, then follow the order of operations.',
      ];
    },
  }),
  mathsNode({
    id: 'combine-like-terms',
    band: '6-8',
    name: 'Putting like terms together',
    needs: ['evaluate-expression'],
    item: (i) => {
      const a = 2 + ((i * 3) % 7);
      const c = 2 + ((i * 5 + 2) % 6);
      const b = 1 + ((i * 7 + 1) % 9);
      const d = 1 + ((i * 4 + 3) % 8);
      const sum = `${a}x + ${b} + ${c}x + ${d}`;
      return i % 2 === 0
        ? [`Put like terms together in ${sum}. How many x are there?`, String(a + c), 'Only terms with the same letter can be added. Add the numbers in front of the x terms.']
        : [`Put like terms together in ${sum}. What plain number, with no x, is left?`, String(b + d), 'Only terms with the same letter can be added. Add the plain numbers that have no letter.'];
    },
  }),
  mathsNode({
    id: 'distributive-property',
    band: '6-8',
    name: 'Multiplying a bracket',
    needs: ['combine-like-terms', 'multiply-multi-digit'],
    item: (i) => {
      const a = 2 + ((i * 3) % 7);
      const b = 2 + ((i * 5 + 1) % 8);
      const minus = i % 3 === 2;
      return [
        `${a}(x ${minus ? '−' : '+'} ${b}) = ${a}x ${minus ? '−' : '+'} __. What number goes in the blank?`,
        String(a * b),
        'Multiply the number outside the bracket by each thing inside, separately, and keep the sign that sits in front of each.',
      ];
    },
  }),
  mathsNode({
    id: 'one-step-equations',
    band: '6-8',
    name: 'One-step equations',
    needs: ['evaluate-expression', 'missing-number-within-20', 'divide-equal-groups'],
    tags: HEART,
    item: (i) => {
      const solution = 10 + ((i * 3) % 11);
      const k = 2 + ((i * 5 + 1) % 8);
      const q = 2 + ((i * 3) % 9);
      const [equation, answer, hint] = cycle<readonly [string, number, string]>(
        [
          [`x + ${k} = ${solution + k}`, solution, 'Undo the adding by taking the same amount away from both sides.'],
          [`x − ${k} = ${solution - k}`, solution, 'Undo the taking away by adding the same amount to both sides.'],
          [`${k}x = ${k * solution}`, solution, 'Undo the multiplying by dividing both sides by the same number.'],
          [`x/${k} = ${q}`, k * q, 'Undo the dividing by multiplying both sides by the same number.'],
        ],
        i,
      );
      return [`Solve for x: ${equation}`, String(answer), hint];
    },
  }),
  mathsNode({
    id: 'two-step-equations',
    band: '6-8',
    name: 'Equations that take two steps',
    needs: ['one-step-equations'],
    tags: HEART,
    item: (i) => {
      const solution = 2 + ((i * 3) % 11);
      const a = 2 + ((i * 5 + 1) % 7);
      const b = 1 + ((i * 7 + 2) % 4);
      const hint = 'Undo the adding or taking away first, then undo the multiplying or dividing. Do the same to both sides each time.';
      if (i % 3 === 0) return [`Solve for x: ${a}x + ${b} = ${a * solution + b}`, String(solution), hint];
      if (i % 3 === 1) return [`Solve for x: ${a}x − ${b} = ${a * solution - b}`, String(solution), hint];
      return [`Solve for x: x/${a} + ${b} = ${solution + b}`, String(a * solution), hint];
    },
  }),
  mathsNode({
    id: 'multi-step-equations',
    band: '6-8',
    name: 'Equations with a bracket',
    needs: ['two-step-equations', 'distributive-property', 'integers-add-subtract'],
    tags: HEART,
    item: (i) => {
      const solution = ((i * 3) % 11) - 4;
      const a = 2 + ((i * 3 + 1) % 5);
      const b = 1 + ((i * 7 + 2) % 6);
      const hint = 'Multiply out the bracket first, or divide both sides by the number outside it. Then finish as you would for a short equation.';
      if (i % 2 === 0) return [`Solve for x: ${a}(x + ${b}) = ${neg(a * (solution + b))}`, String(solution), hint];
      const c = 1 + ((i * 3 + 1) % 8);
      return [`Solve for x: ${a}(x − ${b}) + ${c} = ${neg(a * (solution - b) + c)}`, String(solution), hint];
    },
  }),
  mathsNode({
    id: 'equations-both-sides',
    band: '6-8',
    name: 'Letters on both sides',
    needs: ['multi-step-equations', 'integers-multiply-divide'],
    tags: HEART,
    item: (i) => {
      const solution = ((i * 3) % 10) - 3;
      const c = 2 + ((i * 5 + 1) % 4);
      const k = 1 + ((i * 3 + 2) % 5);
      const b = 1 + ((i * 7 + 2) % 9);
      const d = b + k * solution;
      return [
        `Solve for x: ${c + k}x + ${b} = ${c}x ${plus(d)}`,
        String(solution),
        'Move the x terms to the left side and the plain numbers to the right side, doing the same thing to both sides. Then divide.',
      ];
    },
  }),
  mathsNode({
    id: 'inequalities-one-step',
    band: '6-8',
    name: 'Bigger than, one step',
    needs: ['one-step-equations', 'compare-two-digit'],
    tags: HEART,
    item: (i) => {
      const s = 5 + ((i * 2) % 9);
      const k = 2 + ((i * 5 + 1) % 3);
      const hint = 'Solve it as if it were an equation first. The answer must be bigger than that number, never equal to it, so step up to the next whole number.';
      const mode = i % 3;
      const inequality = mode === 0 ? `x + ${k} > ${s + k}` : mode === 1 ? `x − ${k} > ${s - k}` : `${k}x > ${k * s}`;
      return [`What is the smallest whole number x that makes ${inequality} true?`, String(s + 1), hint];
    },
  }),
  mathsNode({
    id: 'unit-rate',
    band: '6-8',
    name: 'The price of one',
    needs: ['ratio-recipes', 'divide-equal-groups'],
    tags: [PROBLEM_SOLVING_AND_DATA_ANALYSIS],
    item: (i) => {
      const thing = cycle(['notebooks', 'pens', 'tickets', 'apples', 'stamps'], i);
      const q = 2 + ((i * 3) % 6);
      const rate = 2 + ((i * 5 + 1) % 9);
      if (i % 2 === 0) {
        return [`${q} ${thing} cost $${q * rate} altogether, and each costs the same. What does one cost, in dollars?`, String(rate), 'Share the total price equally among the items to find the price of a single item.'];
      }
      const m = q + 2 + (i % 4);
      return [
        `${q} ${thing} cost $${q * rate} altogether, and each costs the same. What do ${m} cost, in dollars?`,
        String(rate * m),
        'Find the price of a single item first, by sharing the total equally, then multiply it for as many as you want.',
      ];
    },
  }),
  mathsNode({
    id: 'proportional-equations',
    band: '6-8',
    name: 'y is always the same times x',
    needs: ['unit-rate', 'evaluate-expression'],
    tags: HEART,
    item: (i) => {
      const k = 2 + ((i * 3) % 7);
      const x = 2 + ((i * 5 + 1) % 8);
      return i % 2 === 0
        ? [`y = ${k}x. When x = ${x}, what is y?`, String(k * x), 'Put the number in place of x and multiply.']
        : [`y = ${k}x. When y = ${k * x}, what is x?`, String(x), 'Put the number in place of y, then undo the multiplying by dividing.'];
    },
  }),
  mathsNode({
    id: 'coordinate-plane',
    band: '6-8',
    name: 'Points on the plane',
    needs: ['integers-add-subtract'],
    item: (i) => {
      const dx = (1 + ((i * 5 + 1) % 6)) * (i % 3 === 0 ? -1 : 1);
      const dy = (1 + ((i * 7 + 2) % 6)) * (i % 2 === 0 ? -1 : 1);
      const units = (n: number): string => `${Math.abs(n)} unit${Math.abs(n) === 1 ? '' : 's'}`;
      const where = `A point is ${units(dx)} ${dx < 0 ? 'left' : 'right'} and ${units(dy)} ${dy < 0 ? 'down' : 'up'} from (0, 0).`;
      return i % 2 === 0
        ? [`${where} What is its y-coordinate?`, String(dy), 'The y-coordinate says how far up or down: up is positive and down is negative.']
        : [`${where} What is its x-coordinate?`, String(dx), 'The x-coordinate says how far across: right is positive and left is negative.'];
    },
  }),
  mathsNode({
    id: 'square-roots',
    band: '6-8',
    name: 'Square roots',
    needs: ['exponents'],
    item: (i) => {
      const n = 2 + ((i * 3) % 11);
      return i % 2 === 0
        ? [`What is √${n * n}?`, String(n), 'Look for the number that, multiplied by itself, makes the number under the root sign.']
        : [`x² = ${n * n}. What positive number is x?`, String(n), 'Look for the positive number that, multiplied by itself, makes the number on the right.'];
    },
  }),
  mathsNode({
    id: 'slope',
    band: '6-8',
    name: 'How steep a line is',
    needs: ['proportional-equations', 'coordinate-plane', 'integers-multiply-divide'],
    tags: HEART,
    item: (i) => {
      const m = (1 + ((i * 3) % 4)) * (i % 3 === 1 ? -1 : 1);
      const x1 = ((i * 2) % 5) - 3;
      const y1 = ((i * 3) % 7) - 4;
      const run = 1 + ((i * 5 + 1) % 3);
      return [
        `A straight line goes through (${neg(x1)}, ${neg(y1)}) and (${neg(x1 + run)}, ${neg(y1 + m * run)}). What is its slope?`,
        String(m),
        'Slope is the rise divided by the run: subtract the y-values, subtract the x-values in the same order, then divide.',
      ];
    },
  }),
  mathsNode({
    id: 'function-machines',
    band: '6-8',
    name: 'Function machines',
    needs: ['evaluate-expression', 'coordinate-plane'],
    tags: HEART,
    item: (i) => {
      const n = 2 + ((i * 3) % 8);
      const a = 2 + ((i * 3 + 1) % 5);
      const b = 1 + ((i * 7 + 2) % 4);
      const mode = i % 3;
      const rule = [`multiplies the number by ${a}, then adds ${b}`, `adds ${b}, then multiplies the result by ${a}`, `multiplies the number by ${a}, then takes away ${b}`][mode];
      const out = [a * n + b, (n + b) * a, a * n - b][mode];
      return [`A function machine ${rule}. If ${n} goes in, what comes out?`, String(out), 'Do the steps in the order the machine does them, step by step.'];
    },
  }),
];

// ─── 9-12: Heart of Algebra and Passport to Advanced Math ───────

const upper: MathsNode[] = [
  mathsNode({
    id: 'slope-intercept',
    band: '9-12',
    name: 'The equation of a line',
    needs: ['slope', 'function-machines', 'two-step-equations'],
    tags: HEART,
    item: (i) => {
      const m = (2 + ((i * 3) % 5)) * (i % 4 === 2 ? -1 : 1);
      const b = ((i * 7 + 2) % 12) - 5;
      const line = `y = ${neg(m)}x ${plus(b)}`;
      const t = 1 + ((i * 3) % 6);
      const mode = i % 3;
      if (mode === 0) {
        return [`A line has the equation ${line}. What is y when x = ${t}?`, String(m * t + b), 'Put the x-value in for x, multiply, then add the plain number, watching its sign.'];
      }
      if (mode === 1) {
        return [`A line has the equation ${line}. At what y-value does it cross the y-axis?`, String(b), 'On the y-axis, x is nothing at all, so only the plain number part is left.'];
      }
      return [`A line has the equation ${line}. By how much does y change when x goes up by 1?`, String(m), 'In slope-intercept form, the number in front of x tells how much y changes for each step across.'];
    },
  }),
  mathsNode({
    id: 'systems-of-equations',
    band: '9-12',
    name: 'Two equations at once',
    needs: ['equations-both-sides', 'slope-intercept'],
    tags: HEART,
    item: (i) => {
      const x = 2 + ((i * 3) % 8);
      const y = 1 + ((i * 5 + 2) % (x - 1));
      const system = `x + y = ${x + y} and x − y = ${x - y}`;
      return i % 2 === 0
        ? [`${system}. What is x?`, String(x), 'Add the equations together: the y terms cancel, and only x is left to solve for.']
        : [`${system}. What is y?`, String(y), 'Take the second equation away from the first: the x terms cancel, and only y is left, doubled.'];
    },
  }),
  mathsNode({
    id: 'inequalities-two-step',
    band: '9-12',
    name: 'Bigger than, two steps',
    needs: ['inequalities-one-step', 'two-step-equations'],
    tags: HEART,
    item: (i) => {
      const s = 2 + ((i * 3) % 8);
      const a = 2 + ((i * 3 + 1) % 5);
      const b = 1 + ((i * 7 + 2) % 9);
      const hint = 'Undo the adding or taking away first, then undo the multiplying, treating the sign as an equals sign. Then step up to the next whole number, because the answer cannot be equal.';
      const inequality = i % 2 === 0 ? `${a}x + ${b} > ${a * s + b}` : `${a}x − ${b} > ${a * s - b}`;
      return [`What is the smallest whole number x that makes ${inequality} true?`, String(s + 1), hint];
    },
  }),
  mathsNode({
    id: 'linear-models',
    band: '9-12',
    name: 'A fixed charge plus a rate',
    needs: ['slope-intercept', 'two-step-equations'],
    tags: HEART,
    item: (i) => {
      const fixed = 10 + 5 * ((i * 3) % 5);
      const rate = 2 + ((i * 5 + 1) % 9);
      const amount = 2 + ((i * 3) % 7);
      const [cost, unit] = cycle<readonly [string, string]>(
        [
          [`A taxi ride costs a fixed $${fixed} plus $${rate} for every kilometre`, 'kilometres'],
          [`A gym charges $${fixed} to join plus $${rate} for every month`, 'months'],
          [`A plumber charges $${fixed} to turn up plus $${rate} for every hour`, 'hours'],
        ],
        i,
      );
      return i % 2 === 0
        ? [`${cost}. What does it cost for ${amount} ${unit}?`, String(fixed + rate * amount), 'The fixed amount is paid once and the rate is paid for each. Write cost = rate × amount + fixed, then put the amount in.']
        : [`${cost}. The total came to $${fixed + rate * amount}. For how many ${unit} was that?`, String(amount), 'Take the fixed amount away from the total first, then divide what is left by the rate.'];
    },
  }),
  mathsNode({
    id: 'absolute-value-equations',
    band: '9-12',
    name: 'Equations with an absolute value',
    needs: ['two-step-equations', 'integers-add-subtract'],
    tags: HEART,
    item: (i) => {
      const c = nonzero(((i * 3) % 10) - 3, 4);
      const d = 1 + ((i * 5 + 2) % 6);
      const equation = `|x ${plus(-c)}| = ${d}`;
      return i % 2 === 0
        ? [`${equation}. What is the larger solution?`, String(c + d), 'Absolute value means a distance, so the inside can be the positive or the negative of the other side. Solve both and take the larger.']
        : [`${equation}. What is the smaller solution?`, String(c - d), 'Absolute value means a distance, so the inside can be the positive or the negative of the other side. Solve both and take the smaller.'];
    },
  }),
  mathsNode({
    id: 'multiply-binomials',
    band: '9-12',
    name: 'Multiplying two brackets',
    needs: ['distributive-property', 'combine-like-terms', 'integers-multiply-divide'],
    tags: PASSPORT,
    item: (i) => {
      const p = nonzero(((i * 3) % 12) - 5, 6);
      const q = nonzero(((i * 5 + 2) % 12) - 5, 7);
      return [
        `(x ${plus(p)})(x ${plus(q)}) = x² + __x ${plus(p * q)}. What number goes in the blank?`,
        String(p + q),
        'Multiply every part of the first bracket by every part of the second, then add together the parts that have a plain x.',
      ];
    },
  }),
  mathsNode({
    id: 'factoring-quadratics',
    band: '9-12',
    name: 'Breaking a quadratic into two brackets',
    needs: ['multiply-binomials'],
    tags: PASSPORT,
    item: (i) => {
      const p = 1 + ((i * 3) % 8);
      const q = (1 + ((i * 5 + 2) % 8)) * (i % 3 === 2 ? -1 : 1);
      return [
        `x² ${plus(p + q)}x ${plus(p * q)} = (x ${plus(p)})(x + __). What number goes in the blank?`,
        String(q),
        'The numbers in the brackets multiply to make the last number and add to make the middle number. Which number goes with the number you have?',
      ];
    },
  }),
  mathsNode({
    id: 'zero-product',
    band: '9-12',
    name: 'Solving a quadratic that is already in brackets',
    needs: ['factoring-quadratics', 'one-step-equations'],
    tags: PASSPORT,
    item: (i) => {
      const r1 = nonzero(((i * 3) % 9) - 4, 5);
      const r2 = nonzero(r1 + 1 + ((i * 5 + 2) % 6), r1 + 8);
      const equation = `(x ${plus(-r1)})(x ${plus(-r2)}) = 0`;
      const hint = 'When things multiply to make nothing, at least a single bracket must be nothing. Set each bracket equal to nothing and solve it.';
      return i % 2 === 0
        ? [`Solve ${equation}. What is the larger solution?`, String(Math.max(r1, r2)), hint]
        : [`Solve ${equation}. What is the smaller solution?`, String(Math.min(r1, r2)), hint];
    },
  }),
  mathsNode({
    id: 'quadratic-by-square-roots',
    band: '9-12',
    name: 'Solving a quadratic with a square root',
    needs: ['square-roots', 'one-step-equations', 'integers-add-subtract'],
    tags: PASSPORT,
    item: (i) => {
      const h = nonzero(((i * 3) % 8) - 3, 4);
      const k = 2 + ((i * 5 + 1) % 6);
      const equation = `(x ${plus(-h)})² = ${k * k}`;
      const hint = 'Take the square root of both sides. There are answers on both sides, the positive root and the negative root. Solve for x with each of them.';
      return i % 2 === 0
        ? [`Solve ${equation}. What is the larger solution?`, String(h + k), hint]
        : [`Solve ${equation}. What is the smaller solution?`, String(h - k), hint];
    },
  }),
  mathsNode({
    id: 'exponent-rules',
    band: '9-12',
    name: 'Rules for powers',
    needs: ['exponents', 'integers-add-subtract'],
    tags: PASSPORT,
    item: (i) => {
      const base = 2 + ((i * 3) % 4);
      const n = 2 + ((i * 3 + 2) % 3);
      const m = n + 1 + ((i * 5 + 1) % 4);
      const inner = 2 + ((i * 5 + 1) % 3);
      const mode = i % 3;
      if (mode === 0) {
        return [`${base}${sup(m)} × ${base}${sup(n)} = ${base} to the power of __. What number goes in the blank?`, String(m + n), 'When the same base is multiplied, the little numbers combine in a simple way. Think about writing each out in full.'];
      }
      if (mode === 1) {
        return [`(${base}${sup(inner)})${sup(n)} = ${base} to the power of __. What number goes in the blank?`, String(inner * n), 'A power of a power writes the base out in groups. Think of how many copies of the base there are in all.'];
      }
      return [`${base}${sup(m)} ÷ ${base}${sup(n)} = ${base} to the power of __. What number goes in the blank?`, String(m - n), 'Dividing cancels copies of the base from the top and the bottom. How many copies are left?'];
    },
  }),
  mathsNode({
    id: 'exponential-growth',
    band: '9-12',
    name: 'Growing by multiplying',
    needs: ['exponent-rules', 'linear-models'],
    tags: PASSPORT,
    item: (i) => {
      const start = 2 + ((i * 3) % 7);
      const factor = cycle([2, 3, 2], i);
      const periods = 2 + ((i * 5 + 1) % 3);
      return [
        `A colony of bacteria starts at ${start} and ${factor === 2 ? 'doubles' : 'triples'} every hour. How many are there after ${periods} hours?`,
        String(start * factor ** periods),
        'Each hour multiplies by the same growth factor. Multiply the start by the factor once for every hour, which is the factor raised to the power of the hours.',
      ];
    },
  }),
  mathsNode({
    id: 'function-notation',
    band: '9-12',
    name: 'Reading f of x',
    needs: ['function-machines', 'exponents', 'integers-multiply-divide'],
    tags: PASSPORT,
    item: (i) => {
      const n = ((i * 3) % 10) - 4;
      const a = 2 + ((i * 5 + 1) % 4);
      const b = ((i * 7 + 2) % 9) - 4;
      const mode = i % 3;
      const rule = [`${a}x ${plus(b)}`, `x² ${plus(b)}`, `${a}x² ${plus(b)}`][mode];
      const value = [a * n + b, n * n + b, a * n * n + b][mode];
      return [
        `f(x) = ${rule}. What is f(${neg(n)})?`,
        String(value),
        'Replace every x with the number in the brackets, keeping its sign, then work it out in the usual order. A square is worked out before anything is multiplied by it.',
      ];
    },
  }),
  mathsNode({
    id: 'quadratic-vertex',
    band: '9-12',
    name: 'The lowest point of a curve',
    needs: ['function-notation', 'quadratic-by-square-roots'],
    tags: PASSPORT,
    item: (i) => {
      const h = ((i * 3) % 9) - 4;
      const k = ((i * 5 + 1) % 10) - 5;
      const curve = `y = (x ${plus(-h)})² ${plus(k)}`;
      return i % 2 === 0
        ? [`The curve ${curve} has a lowest point. What is its lowest y-value?`, String(k), 'A square is never below nothing, and it is smallest when the bracket is nothing. What is left then?']
        : [`The curve ${curve} has a lowest point. At what x-value does it happen?`, String(h), 'A square is smallest when the bracket is nothing. Which x makes the bracket nothing?'];
    },
  }),
];

/** The algebra nodes, 6-8 up to 9-12: expressions, equations, inequalities, rates and lines, then systems, quadratics, powers and functions. */
export const ALGEBRA_NODES: readonly MathsNode[] = [...middle, ...upper];

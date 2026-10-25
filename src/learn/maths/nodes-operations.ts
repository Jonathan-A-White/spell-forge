// src/learn/maths/nodes-operations.ts — The operations nodes of the maths graph, K to 6-8: adding, subtracting, multiplying and
// dividing whole numbers, then fractions, decimals and negative numbers, up to percent. They rest on the number nodes
// (nodes-number.ts) and the algebra nodes (nodes-algebra.ts) rest on them. Each node's `item(i)` makes its i-th item as
// [problem, answer, hint] from the index alone; a hint is a nudge with no number or number word in it. docs/maths-graph.md says how to add a node.

import { cycle, frac, hundredths, neg, sup, tenths } from './format.ts';
import { mathsNode, type MathsNode } from './items.ts';

/** What the story problems of the early nodes count, a new kind as the index goes round. */
const CREATURES = ['cats', 'ducks', 'birds', 'frogs', 'fish'];

/** The SAT Math domain that percent problems belong to (the SAT's Problem Solving and Data Analysis). */
export const PROBLEM_SOLVING_AND_DATA_ANALYSIS = 'sat:problem-solving-and-data-analysis';

// ─── K: adding and taking away within 10 ───────

const kindergarten: MathsNode[] = [
  mathsNode({
    id: 'add-within-10',
    band: 'K',
    name: 'Adding up to 10',
    needs: ['count-to-10', 'one-more-one-less'],
    item: (i) => {
      const a = 1 + ((i * 3) % 7);
      const b = 1 + ((i * 5 + 1) % (10 - a));
      return [
        i % 2 === 0 ? `${a} + ${b} = ?` : `${a} ${cycle(CREATURES, i)} sit on a wall and ${b} more come. How many are on the wall now?`,
        String(a + b),
        'Start at the bigger number and count on the smaller number, a step at a time.',
      ];
    },
  }),
  mathsNode({
    id: 'subtract-within-10',
    band: 'K',
    name: 'Taking away up to 10',
    needs: ['add-within-10'],
    item: (i) => {
      const a = 3 + ((i * 3) % 8);
      const b = 1 + ((i * 5 + 1) % (a - 1));
      return [
        i % 2 === 0 ? `${a} − ${b} = ?` : `${a} ${cycle(CREATURES, i)} are swimming and ${b} swim away. How many are left?`,
        String(a - b),
        'Start at the big number and count back the number you take away.',
      ];
    },
  }),
];

// ─── 1-2: within 20, a missing number, two and three digits ───────

const early: MathsNode[] = [
  mathsNode({
    id: 'add-within-20',
    band: '1-2',
    name: 'Adding up to 20',
    needs: ['add-within-10', 'ten-and-ones'],
    item: (i) => {
      const a = 6 + ((i * 3) % 4);
      const b = 4 + ((i * 5 + 3) % (17 - a));
      return [`${a} + ${b} = ?`, String(a + b), 'Split the smaller number so the bigger one reaches a full group of tens, then add what is left over.'];
    },
  }),
  mathsNode({
    id: 'subtract-within-20',
    band: '1-2',
    name: 'Taking away up to 20',
    needs: ['subtract-within-10', 'add-within-20'],
    item: (i) => {
      const a = 11 + ((i * 3) % 9);
      const b = 3 + ((i * 5 + 2) % (a - 3));
      return [`${a} − ${b} = ?`, String(a - b), 'Count back to the tens first, then count back the rest. Or ask what you add to the small number to reach the big number.'];
    },
  }),
  mathsNode({
    id: 'missing-number-within-20',
    band: '1-2',
    name: 'What number is missing',
    needs: ['subtract-within-20'],
    item: (i) => {
      const a = 2 + ((i * 3) % 9);
      const missing = 3 + ((i * 5 + 1) % 7);
      const sum = a + missing;
      return [
        i % 2 === 0 ? `${a} + __ = ${sum}` : `__ + ${a} = ${sum}`,
        String(missing),
        'Start at the small number and count up to the big number. How many steps did you take?',
      ];
    },
  }),
  mathsNode({
    id: 'add-two-digit',
    band: '1-2',
    name: 'Adding bigger numbers',
    needs: ['add-within-20', 'place-value-two-digit'],
    item: (i) => {
      const a = 10 + ((i * 17 + 3) % 80);
      const b = 1 + ((i * 29 + 7) % (99 - a));
      return [`${a} + ${b} = ?`, String(a + b), 'Add the tens, add the ones, then put them together. If the ones fill a whole group of tens or more, move that group over.'];
    },
  }),
  mathsNode({
    id: 'subtract-two-digit',
    band: '1-2',
    name: 'Taking away bigger numbers',
    needs: ['subtract-within-20', 'add-two-digit'],
    item: (i) => {
      const a = 30 + ((i * 17 + 5) % 70);
      const b = 11 + ((i * 29 + 7) % (a - 11));
      return [`${a} − ${b} = ?`, String(a - b), 'Take the tens away first, then the ones. If you cannot take the ones, open up a group of tens.'];
    },
  }),
  mathsNode({
    id: 'add-subtract-within-1000',
    band: '1-2',
    name: 'Adding and taking away hundreds',
    needs: ['subtract-two-digit', 'place-value-hundreds'],
    item: (i) => {
      if (i % 2 === 0) {
        const a = 100 + ((i * 137 + 11) % 800);
        const b = 50 + ((i * 89 + 7) % (949 - a));
        return [`${a} + ${b} = ?`, String(a + b), 'Add the ones, then the tens, then the hundreds, carrying a group to the next place when a place is full.'];
      }
      const big = 300 + ((i * 137 + 11) % 700);
      const small = 50 + ((i * 89 + 7) % (big - 100));
      return [`${big} − ${small} = ?`, String(big - small), 'Take away place by place, starting from the ones, and borrow from the next place when you need to.'];
    },
  }),
];

// ─── 3-5: multiplying and dividing, big numbers, fractions and decimals ───────

const ITEMS_BAGGED = ['apples', 'marbles', 'stickers', 'pencils', 'shells'];

const middle: MathsNode[] = [
  mathsNode({
    id: 'multiply-equal-groups',
    band: '3-5',
    name: 'Equal groups',
    needs: ['skip-counting', 'add-within-20'],
    item: (i) => {
      const groups = 2 + ((i * 3) % 4);
      const each = 2 + ((i * 5 + 1) % 4);
      return [
        `There are ${groups} bags with ${each} ${cycle(ITEMS_BAGGED, i)} in each bag. How many ${cycle(ITEMS_BAGGED, i)} are there in all?`,
        String(groups * each),
        'Every bag has the same amount, so add that amount again and again, once for each bag.',
      ];
    },
  }),
  mathsNode({
    id: 'times-tables',
    band: '3-5',
    name: 'Times tables',
    needs: ['multiply-equal-groups'],
    item: (i) => {
      const a = 2 + ((i * 3 + 1) % 9);
      const b = 2 + ((i * 7 + 2) % 9);
      return [`${a} × ${b} = ?`, String(a * b), 'Skip count by the first number, as many jumps as the second number says. Or start from a fact you know and add a group.'];
    },
  }),
  mathsNode({
    id: 'divide-equal-groups',
    band: '3-5',
    name: 'Sharing into equal groups',
    needs: ['times-tables', 'fair-shares'],
    item: (i) => {
      const groups = 2 + ((i * 3 + 1) % 9);
      const each = 2 + ((i * 7 + 2) % 9);
      return [
        i % 2 === 0
          ? `${groups * each} ÷ ${groups} = ?`
          : `${groups * each} stickers are shared equally among ${groups} children. How many stickers does each child get?`,
        String(each),
        'Think of the times table backwards: which number of groups, multiplied by the share, makes the total?',
      ];
    },
  }),
  mathsNode({
    id: 'add-subtract-big',
    band: '3-5',
    name: 'Adding and taking away big numbers',
    needs: ['add-subtract-within-1000', 'place-value-thousands'],
    item: (i) => {
      if (i % 2 === 0) {
        const a = 1000 + ((i * 7919) % 80000);
        const b = 1000 + ((i * 6271 + 31) % (98999 - a));
        return [`${a} + ${b} = ?`, String(a + b), 'Line the numbers up by place value, then add from the ones place to the left, carrying as you go.'];
      }
      const big = 20000 + ((i * 7919 + 13) % 79000);
      const small = 1000 + ((i * 6271 + 31) % (big - 1001));
      return [`${big} − ${small} = ?`, String(big - small), 'Line the numbers up by place value, then take away from the ones place to the left, borrowing as you go.'];
    },
  }),
  mathsNode({
    id: 'multiply-multi-digit',
    band: '3-5',
    name: 'Multiplying bigger numbers',
    needs: ['times-tables', 'add-two-digit', 'place-value-thousands'],
    item: (i) => {
      const a = 12 + ((i * 13 + 7) % 88);
      const b = 2 + ((i * 3 + 1) % 8);
      return [`${a} × ${b} = ?`, String(a * b), 'Break the big number into tens and ones, multiply each part, then add the answers for both parts together.'];
    },
  }),
  mathsNode({
    id: 'divide-with-remainders',
    band: '3-5',
    name: 'Dividing with something left over',
    needs: ['divide-equal-groups', 'multiply-multi-digit'],
    item: (i) => {
      const size = 3 + ((i * 3 + 1) % 7);
      const groups = 3 + ((i * 5 + 2) % 8);
      const left = 1 + ((i * 2 + 1) % (size - 1));
      const total = size * groups + left;
      return i % 2 === 0
        ? [
            `${total} marbles go into bags of ${size}. How many full bags can you fill?`,
            String(groups),
            'Find the biggest times table fact that does not go over the total.',
          ]
        : [
            `${total} marbles go into bags of ${size}. How many marbles are left over?`,
            String(left),
            'Find the biggest times table fact that does not go over the total, then see how far the total is past it.',
          ];
    },
  }),
  mathsNode({
    id: 'order-of-operations',
    band: '3-5',
    name: 'Which sum do I do first',
    needs: ['times-tables', 'subtract-two-digit'],
    item: (i) => {
      const a = 2 + ((i * 3) % 8);
      const b = 2 + ((i * 5 + 1) % 7);
      const c = 2 + ((i * 7 + 2) % 6);
      const hint = 'Do what is inside brackets first, then multiplying and dividing, and last adding and taking away.';
      if (i % 3 === 0) return [`${a} + ${b} × ${c} = ?`, String(a + b * c), hint];
      if (i % 3 === 1) return [`(${a} + ${b}) × ${c} = ?`, String((a + b) * c), hint];
      const d = 1 + ((i * 7 + 2) % (a * b - 1));
      return [`${a} × ${b} − ${d} = ?`, String(a * b - d), hint];
    },
  }),
  mathsNode({
    id: 'decimals-add-subtract',
    band: '3-5',
    name: 'Adding and taking away decimals',
    needs: ['decimals-tenths', 'add-subtract-within-1000'],
    item: (i) => {
      const a = 11 + ((i * 17 + 3) % 90);
      if (i % 2 === 0) {
        const b = 1 + ((i * 11 + 4) % 80);
        return [`${tenths(a)} + ${tenths(b)} = ?`, tenths(a + b), 'Line up the decimal points so tenths sit under tenths, then add like whole numbers and keep the point in line.'];
      }
      const b = 1 + ((i * 11 + 4) % (a - 1));
      return [`${tenths(a)} − ${tenths(b)} = ?`, tenths(a - b), 'Line up the decimal points so tenths sit under tenths, then take away like whole numbers and keep the point in line.'];
    },
  }),
  mathsNode({
    id: 'fractions-add-different-bottom',
    band: '3-5',
    name: 'Adding fractions with different bottoms',
    needs: ['fractions-add-same-bottom', 'fractions-equivalent', 'times-tables'],
    item: (i) => {
      const [a, b, c, d] = cycle([[1, 2, 1, 4], [1, 3, 1, 6], [1, 2, 1, 3], [2, 3, 1, 6], [1, 4, 3, 8], [1, 2, 2, 5], [3, 4, 1, 8]], i);
      return [
        `${a}/${b} + ${c}/${d} = ?`,
        frac(a * d + c * b, b * d),
        'Find a bottom number both fractions can share, change each fraction to match it, then add the tops.',
      ];
    },
  }),
  mathsNode({
    id: 'fractions-multiply',
    band: '3-5',
    name: 'Multiplying fractions',
    needs: ['fraction-of-a-set', 'multiply-multi-digit'],
    item: (i) => {
      const [a, b, c, d] = cycle([[1, 2, 3, 4], [2, 3, 3, 5], [1, 3, 1, 4], [3, 4, 2, 5], [2, 5, 5, 6], [3, 8, 4, 9]], i);
      return [`${a}/${b} × ${c}/${d} = ?`, frac(a * c, b * d), 'Multiply the tops together and the bottoms together, then make the fraction as small as it will go.'];
    },
  }),
];

// ─── 6-8: dividing fractions, decimals, negative numbers, exponents, percent ───────

const upper: MathsNode[] = [
  mathsNode({
    id: 'fractions-divide',
    band: '6-8',
    name: 'Dividing fractions',
    needs: ['fractions-multiply', 'divide-equal-groups'],
    item: (i) => {
      const [a, b, c, d] = cycle([[1, 2, 1, 4], [3, 4, 1, 2], [2, 3, 1, 6], [3, 1, 1, 4], [1, 2, 3, 4], [3, 5, 3, 10], [5, 6, 1, 3]], i);
      const whole = (top: number, bottom: number): string => (bottom === 1 ? String(top) : `${top}/${bottom}`);
      return [`${whole(a, b)} ÷ ${whole(c, d)} = ?`, frac(a * d, b * c), 'Dividing by a fraction is the same as multiplying by its flip, with the top and bottom swapped.'];
    },
  }),
  mathsNode({
    id: 'decimals-multiply-divide',
    band: '6-8',
    name: 'Multiplying and dividing decimals',
    needs: ['decimals-add-subtract', 'multiply-multi-digit', 'divide-equal-groups'],
    item: (i) => {
      const t = 1 + ((i * 7 + 2) % 9);
      const w = 2 + ((i * 3) % 8);
      if (i % 3 === 0) {
        return [`${tenths(t)} × ${w} = ?`, tenths(t * w), 'Ignore the point and multiply as whole numbers, then put the point back so the same count of digits sit after it.'];
      }
      if (i % 3 === 1) {
        return [`${tenths(t * w)} ÷ ${w} = ?`, tenths(t), 'Ignore the point and share out as whole numbers, then put the point back so the same count of digits sit after it.'];
      }
      const u = 2 + ((i * 5 + 1) % 8);
      return [`${tenths(t + 1)} × ${tenths(u)} = ?`, hundredths((t + 1) * u), 'Ignore both points and multiply as whole numbers, then count the digits after the points in both numbers to place the point.'];
    },
  }),
  mathsNode({
    id: 'integers-add-subtract',
    band: '6-8',
    name: 'Adding and taking away negative numbers',
    needs: ['subtract-two-digit', 'compare-two-digit'],
    item: (i) => {
      const a = ((i * 7 + 2) % 19) - 9 || 5;
      const b = ((i * 5 + 4) % 17) - 8 || 3;
      const hint = 'Picture a number line: adding moves right and taking away moves left. Taking away a negative moves right instead.';
      if (i % 2 === 0) return [`${neg(a)} + ${b < 0 ? `(${neg(b)})` : b} = ?`, String(a + b), hint];
      return [`${neg(a)} − ${b < 0 ? `(${neg(b)})` : b} = ?`, String(a - b), hint];
    },
  }),
  mathsNode({
    id: 'integers-multiply-divide',
    band: '6-8',
    name: 'Multiplying and dividing negative numbers',
    needs: ['integers-add-subtract', 'times-tables', 'divide-equal-groups'],
    item: (i) => {
      const a = (2 + ((i * 3) % 8)) * (i % 2 === 0 ? -1 : 1);
      const b = (2 + ((i * 5 + 1) % 8)) * (i % 3 === 0 ? -1 : 1);
      const shown = (n: number): string => (n < 0 ? `(${neg(n)})` : String(n));
      const hint = 'Multiply or divide the sizes as usual. Numbers with the same sign give a positive answer, and different signs give a negative answer.';
      return i % 5 < 3 ? [`${neg(a)} × ${shown(b)} = ?`, String(a * b), hint] : [`${neg(a * b)} ÷ ${shown(b)} = ?`, String(a), hint];
    },
  }),
  mathsNode({
    id: 'exponents',
    band: '6-8',
    name: 'Powers of a number',
    needs: ['times-tables', 'multiply-multi-digit'],
    item: (i) => {
      const base = 2 + ((i * 3) % 4);
      const power = 2 + ((i * 5 + 1) % 3);
      return [
        `What is ${base}${sup(power)}?`,
        String(base ** power),
        'The little number says how many times the big number is written down and multiplied together.',
      ];
    },
  }),
  mathsNode({
    id: 'percent-of',
    band: '6-8',
    name: 'A percent of an amount',
    needs: ['fraction-of-a-set', 'decimals-multiply-divide', 'ratio-equivalent'],
    tags: [PROBLEM_SOLVING_AND_DATA_ANALYSIS],
    item: (i) => {
      const percent = cycle([10, 25, 50, 20, 75, 5], i);
      const k = 2 + ((i * 3) % 9);
      return [
        `What is ${percent}% of ${k * 20}?`,
        String((percent * k) / 5),
        'A percent is a part out of a hundred. Turn it into a fraction or a decimal, then take that part of the amount.',
      ];
    },
  }),
];

/** The operations nodes, K up to 6-8: adding, taking away, multiplying and dividing, in whole numbers, fractions, decimals and negatives. */
export const OPERATION_NODES: readonly MathsNode[] = [...kindergarten, ...early, ...middle, ...upper];

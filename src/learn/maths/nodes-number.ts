// src/learn/maths/nodes-number.ts — The number nodes of the maths graph for preK to 5: counting, place value, fractions, ratios.
// Each node's `item(i)` makes its i-th item as [problem, answer, hint] from the index alone, so the same index is the same item;
// the hint leads to the answer and never says it. docs/maths-graph.md says how to add a node.

import { mathsNode, type MathsNode } from './items.ts';

/** Things to count, a new kind each time the index goes round the first five. */
const THINGS = ['🍎', '⭐', '🐟', '🚗', '🌼'];

/** n of the kind of thing that index i uses. */
const things = (n: number, i: number): string => THINGS[Math.floor(i / 5) % THINGS.length].repeat(n);

/** "1 ten", "3 tens". */
const amount = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** The i-th of a short list, going round again past its end. */
const cycle = <T>(list: readonly T[], i: number): T => list[i % list.length];

// ─── preK: counting what is in front of him ───────

const preK: MathsNode[] = [
  mathsNode({
    id: 'count-to-5',
    band: 'preK',
    name: 'Counting up to 5',
    item: (i) => {
      const n = cycle([3, 1, 5, 2, 4], i);
      return [`How many? ${things(n, i)}`, String(n), 'Touch each thing once as you say its number, and do not skip any.'];
    },
  }),
  mathsNode({
    id: 'count-to-10',
    band: 'preK',
    name: 'Counting up to 10',
    needs: ['count-to-5'],
    item: (i) => {
      const n = 6 + ((i * 3) % 5);
      return [`How many? ${things(n, i)}`, String(n), 'Count the first row as a block, then keep counting on from there.'];
    },
  }),
  mathsNode({
    id: 'compare-groups',
    band: 'preK',
    name: 'Which group has more',
    needs: ['count-to-5'],
    item: (i) => {
      const a = cycle([3, 2, 5, 1, 4], i);
      const b = cycle([2, 4, 3, 5, 1], i);
      return [
        `Which row has more? Row A: ${things(a, i)} Row B: ${things(b, i)} Say A or B.`,
        a > b ? 'A' : 'B',
        'Match them up, pair by pair. The row with some left over has more.',
      ];
    },
  }),
];

// ─── K: numbers to 20, one more, comparing, ten and some more, fair shares ───────

const kindergarten: MathsNode[] = [
  mathsNode({
    id: 'numbers-to-20',
    band: 'K',
    name: 'Counting up to 20',
    needs: ['count-to-10'],
    item: (i) => {
      const n = 11 + ((i * 3) % 10);
      return [`How many? ${things(n, i)}`, String(n), 'Count the first full row as a block, then count on past it.'];
    },
  }),
  mathsNode({
    id: 'one-more-one-less',
    band: 'K',
    name: 'One more and one less',
    needs: ['count-to-10'],
    item: (i) => {
      const n = 2 + ((i * 3) % 8);
      return i % 2 === 0
        ? [`What is one more than ${n}?`, String(n + 1), 'Say the number, then say the next number when you count up.']
        : [`What is one less than ${n}?`, String(n - 1), 'Say the number, then say the number just before it when you count up.'];
    },
  }),
  mathsNode({
    id: 'compare-numbers',
    band: 'K',
    name: 'Which number is bigger',
    needs: ['compare-groups', 'count-to-10'],
    item: (i) => {
      const a = 1 + ((i * 3) % 10);
      let b = 1 + ((i * 7 + 4) % 10);
      if (a === b) b = (b % 10) + 1;
      return [`Which is bigger, ${a} or ${b}?`, String(Math.max(a, b)), 'The bigger number is the one you say later when you count up.'];
    },
  }),
  mathsNode({
    id: 'ten-and-ones',
    band: 'K',
    name: 'Ten and some more',
    needs: ['numbers-to-20'],
    item: (i) => {
      const k = 1 + ((i * 2) % 9);
      return [`What number is 10 and ${k} more?`, String(10 + k), 'Start at the big number and count on, one at a time.'];
    },
  }),
  mathsNode({
    id: 'fair-shares',
    band: 'K',
    name: 'Sharing fairly',
    needs: ['count-to-10'],
    item: (i) => {
      const friends = cycle([2, 2, 3, 2, 3], i);
      const each = cycle([3, 4, 2, 5, 3], i);
      return [
        `${friends} friends share ${friends * each} sweets fairly. How many sweets does each friend get?`,
        String(each),
        'Deal the sweets out one at a time to each friend, round and round, until none are left.',
      ];
    },
  }),
];

// ─── 1-2: place value, skip counting, comparing, halves and quarters ───────

const early: MathsNode[] = [
  mathsNode({
    id: 'place-value-two-digit',
    band: '1-2',
    name: 'Tens and ones',
    needs: ['ten-and-ones'],
    item: (i) => {
      const tens = 1 + ((i * 4 + 1) % 9);
      const ones = (i * 7 + 3) % 10;
      return [
        `What number is ${amount(tens, 'ten')} and ${amount(ones, 'one')}?`,
        String(tens * 10 + ones),
        'Write the tens digit first and the ones digit after it.',
      ];
    },
  }),
  mathsNode({
    id: 'place-value-hundreds',
    band: '1-2',
    name: 'Hundreds, tens and ones',
    needs: ['place-value-two-digit'],
    item: (i) => {
      const hundreds = 1 + ((i * 2) % 9);
      const tens = (i * 3 + 1) % 10;
      const ones = (i * 7 + 2) % 10;
      return [
        `What number is ${amount(hundreds, 'hundred')}, ${amount(tens, 'ten')} and ${amount(ones, 'one')}?`,
        String(hundreds * 100 + tens * 10 + ones),
        'Hundreds first, then tens, then ones. A zero holds the place of a part with none.',
      ];
    },
  }),
  mathsNode({
    id: 'skip-counting',
    band: '1-2',
    name: 'Counting in jumps',
    needs: ['numbers-to-20'],
    item: (i) => {
      const step = cycle([2, 5, 10], i);
      const start = step * (1 + (Math.floor(i / 3) % 4));
      return [
        `Count by ${step}s: ${start}, ${start + step}, ${start + 2 * step}, __`,
        String(start + 3 * step),
        'Each step jumps the same amount. Find the jump between two neighbours.',
      ];
    },
  }),
  mathsNode({
    id: 'compare-two-digit',
    band: '1-2',
    name: 'Which big number is bigger',
    needs: ['place-value-two-digit', 'compare-numbers'],
    item: (i) => {
      const a = 10 + ((i * 37) % 90);
      const swapped = (a % 10) * 10 + Math.floor(a / 10);
      const b = a % 10 === 0 || swapped === a ? a + 1 : swapped;
      return [`Which is bigger, ${a} or ${b}?`, String(Math.max(a, b)), 'Look at the tens first. Only look at the ones if the tens match.'];
    },
  }),
  mathsNode({
    id: 'halves-and-quarters',
    band: '1-2',
    name: 'Halves, thirds and quarters',
    needs: ['fair-shares'],
    item: (i) => {
      const [parts, taken] = cycle([[2, 1], [4, 1], [4, 3], [3, 1], [3, 2]], i);
      return [
        `A pizza is cut into ${parts} equal parts. You eat ${taken} of the parts. What fraction of the pizza did you eat?`,
        `${taken}/${parts}`,
        'The bottom number says how many equal parts there are. The top number says how many you took.',
      ];
    },
  }),
];

// ─── 3-5: bigger place value, rounding, tenths, fractions, ratios ───────

const PLACES = ['thousands', 'hundreds', 'tens', 'ones'];
const PLACE_VALUES = [1000, 100, 10, 1];

const middle: MathsNode[] = [
  mathsNode({
    id: 'place-value-thousands',
    band: '3-5',
    name: 'What a digit is worth',
    needs: ['place-value-hundreds'],
    item: (i) => {
      const digits = [0, 1, 2, 3].map((k) => 1 + ((i * (k + 2) + k * 3) % 9));
      const place = i % 4;
      return [
        `In ${digits.join('')}, what is the value of the digit in the ${PLACES[place]} place?`,
        String(digits[place] * PLACE_VALUES[place]),
        'Say which place the digit is in, then what one of that place is worth, then take that many.',
      ];
    },
  }),
  mathsNode({
    id: 'round-numbers',
    band: '3-5',
    name: 'Rounding a number',
    needs: ['place-value-thousands'],
    item: (i) => {
      const n = 100 + ((i * 137) % 900);
      const unit = i % 2 === 0 ? 10 : 100;
      return [
        `Round ${n} to the nearest ${unit}.`,
        String(Math.round(n / unit) * unit),
        'Look at the digit just to the right of the place you are rounding to. Halfway or more goes up.',
      ];
    },
  }),
  mathsNode({
    id: 'fractions-equivalent',
    band: '3-5',
    name: 'Different fractions that are the same',
    needs: ['halves-and-quarters'],
    item: (i) => {
      const bottom = cycle([2, 3, 4, 5, 4], i);
      const top = cycle([1, 1, 3, 2, 1], i);
      const times = 2 + (Math.floor(i / 5) % 3);
      return [
        `${top}/${bottom} = __/${bottom * times}`,
        String(top * times),
        'Whatever you multiply the bottom number by, multiply the top number by the same.',
      ];
    },
  }),
  mathsNode({
    id: 'fractions-compare',
    band: '3-5',
    name: 'Which fraction is bigger',
    needs: ['fractions-equivalent'],
    item: (i) => {
      const [a, b, c, d] = cycle([[1, 2, 1, 3], [3, 5, 2, 5], [2, 3, 2, 5], [4, 7, 5, 7], [1, 4, 1, 8]], i);
      const flip = Math.floor(i / 5) % 2 === 1;
      const [first, second] = flip ? [`${c}/${d}`, `${a}/${b}`] : [`${a}/${b}`, `${c}/${d}`];
      const bigger = a * d > c * b ? `${a}/${b}` : `${c}/${d}`;
      return [
        `Which is bigger, ${first} or ${second}?`,
        bigger,
        b === d
          ? 'The parts are the same size, so the fraction with more parts is bigger.'
          : 'You take the same number of parts, so the fraction with fewer cuts, and so bigger pieces, is bigger.',
      ];
    },
  }),
  mathsNode({
    id: 'fractions-add-same-bottom',
    band: '3-5',
    name: 'Adding fractions with the same bottom',
    needs: ['halves-and-quarters'],
    item: (i) => {
      const bottom = cycle([5, 8, 4, 10, 6], i);
      const a = cycle([1, 3, 1, 3, 2], i);
      const b = cycle([2, 2, 2, 4, 3], i);
      return [`${a}/${bottom} + ${b}/${bottom} = ?`, `${a + b}/${bottom}`, 'The pieces are the same size, so add up how many pieces there are and keep the size.'];
    },
  }),
  mathsNode({
    id: 'fraction-of-a-set',
    band: '3-5',
    name: 'A fraction of a group',
    needs: ['fair-shares', 'halves-and-quarters'],
    item: (i) => {
      const bottom = cycle([2, 3, 4, 5, 2], i);
      const each = cycle([4, 3, 2, 6, 5], i);
      return [
        `What is 1/${bottom} of ${bottom * each}?`,
        String(each),
        'Share the amount into equal groups, as many as the bottom number says, and look at a single group.',
      ];
    },
  }),
  mathsNode({
    id: 'decimals-tenths',
    band: '3-5',
    name: 'Tenths as a decimal',
    needs: ['halves-and-quarters', 'place-value-hundreds'],
    item: (i) => {
      const k = 1 + ((i * 2) % 9);
      return [`Write ${k}/10 as a decimal.`, `0.${k}`, 'Tenths are the first place after the point.'];
    },
  }),
  mathsNode({
    id: 'ratio-language',
    band: '3-5',
    name: 'Comparing two amounts with a ratio',
    needs: ['fair-shares', 'halves-and-quarters'],
    item: (i) => {
      const [red, blue] = cycle([[3, 2], [1, 4], [5, 3], [2, 5], [4, 1]], i);
      return [
        `There are ${red} red and ${blue} blue marbles. What is the ratio of red to blue? Write it like 1:2.`,
        `${red}:${blue}`,
        "Say the first thing's amount, then the second thing's, in the order the question asks.",
      ];
    },
  }),
  mathsNode({
    id: 'ratio-equivalent',
    band: '3-5',
    name: 'Ratios that match',
    needs: ['ratio-language', 'fractions-equivalent'],
    item: (i) => {
      const [a, b] = cycle([[1, 2], [3, 2], [2, 5], [3, 4], [1, 3]], i);
      const times = cycle([3, 2, 2, 3, 4], i);
      return [
        `The ratio ${a}:${b} is the same as ${a * times}:__`,
        String(b * times),
        'Both sides are multiplied by the same number. Find what the first side was multiplied by.',
      ];
    },
  }),
  mathsNode({
    id: 'ratio-recipes',
    band: '3-5',
    name: 'Making more of a recipe',
    needs: ['ratio-equivalent'],
    item: (i) => {
      const [flour, milk] = cycle([[2, 3], [1, 2], [3, 4], [2, 5], [4, 3]], i);
      const times = cycle([3, 4, 2, 3, 2], i);
      return [
        `A recipe uses ${flour} cups of flour for every ${milk} cups of milk. How much milk goes with ${flour * times} cups of flour?`,
        String(milk * times),
        'Find how many times more flour there is, then use that many times the milk.',
      ];
    },
  }),
];

/** The number nodes, preK up to 5: counting, place value, fractions and ratios, the youngest band first. */
export const NUMBER_NODES: readonly MathsNode[] = [...preK, ...kindergarten, ...early, ...middle];

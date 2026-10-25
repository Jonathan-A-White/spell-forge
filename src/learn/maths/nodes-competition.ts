// src/learn/maths/nodes-competition.ts — The competition tier of the maths graph, band `competition` (above 9-12): the AMC 8 and AMC 10
// kind of problem, by the four topic lists those contests are written from: Number Theory, Algebra, Geometry, and Counting and
// Probability. This file holds the tags that name the lists, and the number theory and algebra nodes; the geometry and counting nodes of the
// tier sit with their strands in nodes-geometry.ts and nodes-data.ts. No problem is copied from any contest: every problem is written
// here. Each node's `item(i)` makes its i-th item as [problem, answer, hint] from the index alone; a hint is a nudge with no number or
// number word in it. docs/maths-graph.md says how to add a node.

import { cycle, frac, sup } from './format.ts';
import { mathsNode, type MathsNode } from './items.ts';

/** The tag of a competition node in the AMC topic list Number Theory. */
export const AMC_NUMBER_THEORY = 'amc:number-theory';
/** The tag of a competition node in the AMC topic list Algebra. */
export const AMC_ALGEBRA = 'amc:algebra';
/** The tag of a competition node in the AMC topic list Geometry. */
export const AMC_GEOMETRY = 'amc:geometry';
/** The tag of a competition node in the AMC topic list Counting and Probability. */
export const AMC_COUNTING_AND_PROBABILITY = 'amc:counting-and-probability';

/** The four topic lists the AMC 8 and AMC 10 are written from, by name, with the tag each competition node carries. */
export const AMC_TOPICS = [
  { name: 'Number Theory', tag: AMC_NUMBER_THEORY },
  { name: 'Algebra', tag: AMC_ALGEBRA },
  { name: 'Geometry', tag: AMC_GEOMETRY },
  { name: 'Counting and Probability', tag: AMC_COUNTING_AND_PROBABILITY },
] as const;

const NUMBER_THEORY = [AMC_NUMBER_THEORY];
const ALGEBRA = [AMC_ALGEBRA];

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** The prime factors of n with their powers, smallest first: 12 as [[2, 2], [3, 1]]. */
function primePowers(n: number): [prime: number, power: number][] {
  const found: [number, number][] = [];
  let rest = n;
  for (let p = 2; p * p <= rest; p += 1) {
    let power = 0;
    while (rest % p === 0) {
      rest /= p;
      power += 1;
    }
    if (power > 0) found.push([p, power]);
  }
  if (rest > 1) found.push([rest, 1]);
  return found;
}

// ─── Number theory ───────────────────────────────────────

const FACTOR_NUMBERS = [12, 18, 20, 24, 28, 30, 36, 45, 48, 60, 72, 100];
const FACTORED_NUMBERS = [30, 42, 60, 84, 90, 126, 210, 66, 70, 78];
const MEETING_NUMBERS: readonly (readonly [number, number])[] = [
  [12, 18], [8, 20], [15, 25], [14, 21], [16, 24], [9, 12], [18, 30], [20, 28],
];

/** The units digit of base to the power exponent. */
function lastDigit(base: number, exponent: number): number {
  let digit = 1;
  for (let k = 0; k < exponent; k += 1) digit = (digit * base) % 10;
  return digit;
}

const numberTheory: MathsNode[] = [
  mathsNode({
    id: 'count-factors',
    band: 'competition',
    name: 'Counting the factors of a number',
    needs: ['divide-with-remainders', 'exponents'],
    tags: NUMBER_THEORY,
    item: (i) => {
      const n = cycle(FACTOR_NUMBERS, i);
      const count = primePowers(n).reduce((product, [, power]) => product * (power + 1), 1);
      return [
        `How many positive whole numbers divide ${n} exactly?`,
        String(count),
        'List the factors in pairs that multiply to the number, working up from the smallest until the pairs meet in the middle.',
      ];
    },
  }),
  mathsNode({
    id: 'prime-factors',
    band: 'competition',
    name: 'Breaking a number into primes',
    needs: ['count-factors'],
    tags: NUMBER_THEORY,
    item: (i) => {
      const n = cycle(FACTORED_NUMBERS, i);
      const sum = primePowers(n).reduce((total, [prime]) => total + prime, 0);
      return [
        `What is the sum of the different prime numbers that divide ${n}?`,
        String(sum),
        'Divide out the smallest prime again and again until nothing is left, and add each different prime once.',
      ];
    },
  }),
  mathsNode({
    id: 'gcd-lcm',
    band: 'competition',
    name: 'Greatest common factor and least common multiple',
    needs: ['prime-factors'],
    tags: NUMBER_THEORY,
    item: (i) => {
      const [a, b] = cycle(MEETING_NUMBERS, Math.floor(i / 2));
      return i % 2 === 0
        ? [
            `What is the least common multiple of ${a} and ${b}?`,
            String((a * b) / gcd(a, b)),
            'Write each number as primes, then take every prime the most times it shows up in either number.',
          ]
        : [
            `What is the greatest common factor of ${a} and ${b}?`,
            String(gcd(a, b)),
            'Write each number as primes, then keep only the primes both numbers share, as many times as both have them.',
          ];
    },
  }),
  mathsNode({
    id: 'remainders-and-last-digits',
    band: 'competition',
    name: 'Remainders and the last digit of a power',
    needs: ['exponents', 'divide-with-remainders', 'prime-factors'],
    tags: NUMBER_THEORY,
    item: (i) => {
      if (i % 2 === 0) {
        const base = cycle([2, 3, 7, 8, 9, 4], Math.floor(i / 2));
        const exponent = 10 + ((i * 7) % 41);
        return [
          `What is the units digit of ${base}${sup(exponent)}?`,
          String(lastDigit(base, exponent)),
          'The last digit repeats in a cycle as the power grows. Find how long the cycle is and where the exponent lands in it.',
        ];
      }
      const m = 3 + ((i * 2) % 7);
      const a = 100 + ((i * 37) % 800);
      const b = 100 + ((i * 53 + 11) % 800);
      return [
        `What is the remainder when ${a} × ${b} is divided by ${m}?`,
        String((a * b) % m),
        'Find the remainder of each number on its own first, multiply those remainders, then find the remainder of that product.',
      ];
    },
  }),
];

// ─── Algebra ─────────────────────────────────────────────

const WORK_PAIRS: readonly (readonly [number, number])[] = [
  [6, 3], [12, 4], [10, 15], [20, 30], [12, 6], [15, 10], [8, 8], [9, 18],
];
const SPEED_PAIRS: readonly (readonly [number, number])[] = [
  [40, 60], [30, 60], [60, 90], [20, 30], [50, 75], [10, 15],
];

const algebra: MathsNode[] = [
  mathsNode({
    id: 'arithmetic-sequences',
    band: 'competition',
    name: 'Terms and sums of a number pattern',
    needs: ['linear-models', 'multiply-multi-digit'],
    tags: ALGEBRA,
    item: (i) => {
      const mode = i % 3;
      if (mode === 0) {
        const first = 2 + ((i * 3) % 9);
        const step = 2 + ((i * 5) % 6);
        const n = 15 + ((i * 7) % 20);
        return [
          `A pattern starts ${first}, ${first + step}, ${first + 2 * step}, ${first + 3 * step}, and keeps going up by the same step. What is term number ${n}?`,
          String(first + (n - 1) * step),
          'Every term is the first term plus the step added a certain number of times: count how many steps it takes to get there from the first term.',
        ];
      }
      if (mode === 1) {
        const n = 20 + ((i * 3) % 40);
        return [
          `What is 1 + 2 + 3 + ... + ${n}?`,
          String((n * (n + 1)) / 2),
          'Pair the first number with the last, the second with the second from last: every pair has the same total.',
        ];
      }
      const first = 3 + ((i * 2) % 5);
      const step = 2 + ((i * 3) % 5);
      const n = 8 + 2 * ((i * 5) % 8);
      const last = first + (n - 1) * step;
      return [
        `What is ${first} + ${first + step} + ${first + 2 * step} + ... + ${last}, where each term is the same step above the one before?`,
        String((n * (first + last)) / 2),
        'Work out how many terms there are, then pair the first with the last: every pair has the same total.',
      ];
    },
  }),
  mathsNode({
    id: 'sum-and-product-of-roots',
    band: 'competition',
    name: 'Using the sum and product of the roots',
    needs: ['factoring-quadratics', 'zero-product'],
    tags: ALGEBRA,
    item: (i) => {
      const r = 1 + ((i * 3) % 8);
      const t = r + 1 + ((i * 5) % 4);
      const sum = r + t;
      const product = r * t;
      const equation = `x${sup(2)} − ${sum}x + ${product} = 0`;
      return i % 2 === 0
        ? [
            `The roots of ${equation} are r and t. What is r${sup(2)} + t${sup(2)}?`,
            String(sum * sum - 2 * product),
            'You need not find the roots: their sum and product can be read from the numbers in the equation. Square the sum, then take away a multiple of the product.',
          ]
        : [
            `The roots of ${equation} are r and t. What is (r − t)${sup(2)}?`,
            String(sum * sum - 4 * product),
            'You need not find the roots: their sum and product can be read from the numbers in the equation. Square the sum, then take away a multiple of the product.',
          ];
    },
  }),
  mathsNode({
    id: 'difference-of-squares',
    band: 'competition',
    name: 'Squares that cancel',
    needs: ['multiply-binomials', 'exponents'],
    tags: ALGEBRA,
    item: (i) => {
      if (i % 2 === 0) {
        const gap = 1 + ((i * 3) % 9);
        const big = 51 + ((i * 7) % 49);
        const small = big - gap;
        return [
          `What is ${big}${sup(2)} − ${small}${sup(2)}?`,
          String(big * big - small * small),
          'Do not square each number. A difference of squares splits into a pair of factors: the sum of the numbers and their difference.',
        ];
      }
      const middle = cycle([50, 100, 1000, 200, 500], Math.floor(i / 2));
      const away = 1 + ((i * 5) % 9);
      return [
        `What is ${middle - away} × ${middle + away}?`,
        String(middle * middle - away * away),
        'The numbers sit the same distance either side of a round number. That is a difference of squares in disguise.',
      ];
    },
  }),
  mathsNode({
    id: 'work-and-rates',
    band: 'competition',
    name: 'Working together, and average speed',
    needs: ['unit-rate', 'fractions-add-different-bottom', 'proportional-equations'],
    tags: ALGEBRA,
    item: (i) => {
      if (i % 2 === 0) {
        const [a, b] = cycle(WORK_PAIRS, Math.floor(i / 2));
        return [
          `Ann can paint a fence alone in ${a} hours and Ben can paint it alone in ${b} hours. Working together at those rates, how many hours do they take?`,
          frac(a * b, a + b),
          'Find the share of the fence each paints in an hour, add those shares, then flip to get the hours for the whole fence.',
        ];
      }
      const [u, v] = cycle(SPEED_PAIRS, Math.floor(i / 2));
      return [
        `A car drives to a town at ${u} km/h and drives back the same road at ${v} km/h. What is its average speed for the whole round trip, in km/h?`,
        frac(2 * u * v, u + v),
        'Do not just average the speeds. Pick any distance you like, find the total time there and back, then divide the total distance by it.',
      ];
    },
  }),
];

/** The number theory and algebra nodes of the competition tier. Its geometry and counting nodes are GEOMETRY_NODES and DATA_NODES. */
export const COMPETITION_THEORY_NODES: readonly MathsNode[] = [...numberTheory, ...algebra];

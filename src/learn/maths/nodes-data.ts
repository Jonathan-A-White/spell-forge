// src/learn/maths/nodes-data.ts — The data nodes of the maths graph, K to 9-12 and the competition tier: reading graphs, the mean, median
// and mode, probability, and counting. The 9-12 nodes cite the SAT Math domain Problem Solving and Data Analysis by name, and the
// competition nodes the AMC topic list Counting and Probability. The problems are written here, none copied from any test or contest.
// Each node's `item(i)` makes its i-th item as [problem, answer, hint] from the index alone; a hint is a nudge with no number or number
// word in it. docs/maths-graph.md says how to add a node.

import { cycle, frac, plus } from './format.ts';
import { mathsNode, type MathsNode } from './items.ts';
import { AMC_COUNTING_AND_PROBABILITY } from './nodes-competition.ts';
import { PROBLEM_SOLVING_AND_DATA_ANALYSIS } from './nodes-operations.ts';

const PSDA = [PROBLEM_SOLVING_AND_DATA_ANALYSIS];
const COMPETITION = [AMC_COUNTING_AND_PROBABILITY];

const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
const choose = (n: number, k: number): number => factorial(n) / (factorial(k) * factorial(n - k));

// ─── K to 3-5: graphs, sharing evenly, counting outfits ───────

const PAIRS: readonly (readonly [string, string])[] = [
  ['cats', 'dogs'], ['apples', 'pears'], ['red cars', 'blue cars'], ['stars', 'moons'], ['ducks', 'frogs'],
];

const early: MathsNode[] = [
  mathsNode({
    id: 'picture-graph',
    band: 'K',
    name: 'Reading a picture graph',
    needs: ['compare-numbers', 'subtract-within-10'],
    item: (i) => {
      const [x, y] = cycle(PAIRS, i);
      const more = 4 + ((i * 3) % 6);
      const fewer = 2 + ((i * 5 + 1) % (more - 3));
      return [
        `A picture graph shows ${more} ${x} and ${fewer} ${y}. How many more ${x} than ${y} are there?`,
        String(more - fewer),
        'Line the pictures up in pairs, a picture from each row. The pictures left over without a partner show the difference.',
      ];
    },
  }),
  mathsNode({
    id: 'bar-graph',
    band: '1-2',
    name: 'Reading a bar graph',
    needs: ['picture-graph', 'add-within-20', 'subtract-within-20'],
    item: (i) => {
      const [x, y] = cycle(PAIRS, i + 1);
      const tall = 6 + ((i * 3) % 6);
      const short = 1 + ((i * 5) % 5);
      return i % 2 === 0
        ? [
            `In a bar graph, the bar for ${x} reaches ${tall} and the bar for ${y} reaches ${short}. How many ${x} and ${y} are there altogether?`,
            String(tall + short),
            'Each bar tells how many. Put both amounts together.',
          ]
        : [
            `In a bar graph, the bar for ${y} reaches ${short} and the bar for ${x} reaches ${tall}. How many more ${x} than ${y} are there?`,
            String(tall - short),
            'Each bar tells how many. Take the shorter bar from the taller bar.',
          ];
    },
  }),
  mathsNode({
    id: 'mean-fair-share',
    band: '3-5',
    name: 'Sharing evenly: the mean',
    needs: ['bar-graph', 'divide-equal-groups', 'add-two-digit'],
    item: (i) => {
      const n = 3 + (i % 3);
      const each = 10 + ((i * 3) % 8);
      const others = Array.from({ length: n - 1 }, (_, k) => each + ((i + k * 3) % 5) - 2);
      const last = n * each - others.reduce((a, b) => a + b, 0);
      const counts = [...others, last].join(', ');
      return [
        `${n} friends have ${counts} stickers. They put them all together and share them out equally. How many stickers does each friend get?`,
        String(each),
        'Add everything up to get the total, then share that total out equally among the friends.',
      ];
    },
  }),
  mathsNode({
    id: 'outfit-counting',
    band: '3-5',
    name: 'How many ways to choose',
    needs: ['times-tables'],
    item: (i) => {
      const [first, second, third] = cycle(
        [
          ['shirts', 'pairs of trousers', 'hats'],
          ['flavours of ice cream', 'kinds of cone', 'kinds of sprinkles'],
          ['starters', 'main dishes', 'desserts'],
          ['colours of paint', 'sizes of brush', 'kinds of paper'],
          ['bus routes', 'train routes', 'ferry routes'],
        ] as const,
        i,
      );
      const a = 2 + ((i * 3) % 6);
      const b = 2 + ((i * 5 + 1) % 6);
      if (i % 2 === 0) {
        return [`A shop has ${a} ${first} and ${b} ${second}. How many different pairs can be made, one of each?`, String(a * b), 'Each choice from the first group can go with every choice from the second group.'];
      }
      const c = 2 + ((i * 2) % 3);
      return [
        `A shop has ${a} ${first}, ${b} ${second} and ${c} ${third}. How many different ways are there to choose one of each?`,
        String(a * b * c),
        'Each choice from the first group can go with every choice from the second group, and then with every choice from the third.',
      ];
    },
  }),
];

// ─── 6-8: mean, median and mode; chance; overlapping groups ───────

/** Five numbers as an offset from a mean, adding up to nothing, so the mean is whole. Each has one most common value. */
const SPREADS: readonly (readonly number[])[] = [
  [-3, -1, -1, 2, 3],
  [-4, 0, 1, 1, 2],
  [-2, -2, 0, 1, 3],
  [-3, 0, 0, 1, 2],
  [-5, -1, 2, 2, 2],
];

const COLOURS = ['red', 'blue', 'green'] as const;

const middle: MathsNode[] = [
  mathsNode({
    id: 'mean-median-mode',
    band: '6-8',
    name: 'The mean, median and mode',
    needs: ['mean-fair-share', 'compare-two-digit'],
    tags: PSDA,
    item: (i) => {
      const centre = 6 + ((i * 2) % 9);
      const spread = cycle(SPREADS, i);
      const kind = i % 3;
      const spun = (shift: number) => spread.map((_, k) => centre + spread[(k + shift) % spread.length]);
      const numbers = spun(i % 5);
      const list = numbers.join(', ');
      const sorted = [...numbers].sort((a, b) => a - b);
      const mode = sorted.find((n) => sorted.filter((m) => m === n).length > 1)!;
      if (kind === 0) {
        return [`Here are five scores: ${list}. What is the mean?`, String(centre), 'Add all the scores, then share the total equally between the scores.'];
      }
      if (kind === 1) {
        return [`Here are five scores: ${list}. What is the median?`, String(sorted[2]), 'Put the scores in order from least to greatest. The median is the middle score.'];
      }
      return [`Here are five scores: ${list}. What is the mode?`, String(mode), 'The mode is the score that shows up most often.'];
    },
  }),
  mathsNode({
    id: 'probability-simple',
    band: '6-8',
    name: 'How likely something is',
    needs: ['fraction-of-a-set', 'fractions-equivalent'],
    tags: PSDA,
    item: (i) => {
      if (i % 2 === 0) {
        const counts = [2 + ((i * 3) % 5), 3 + ((i * 5) % 4), 1 + ((i * 2) % 5)];
        const pick = Math.floor(i / 2) % 3;
        const total = counts.reduce((a, b) => a + b, 0);
        return [
          `A bag holds ${counts[0]} red, ${counts[1]} blue and ${counts[2]} green marbles. A marble is picked without looking. What is the probability that it is ${COLOURS[pick]}? Give a fraction.`,
          frac(counts[pick], total),
          'Probability is the number of ways that work, over the number of ways in all. Simplify at the end.',
        ];
      }
      const above = 1 + ((i * 3) % 4);
      return [
        `A fair six-sided die is rolled. What is the probability of a number bigger than ${above}? Give a fraction.`,
        frac(6 - above, 6),
        'Count the faces that work, and put that over the number of faces. Simplify at the end.',
      ];
    },
  }),
  mathsNode({
    id: 'overlapping-groups',
    band: '6-8',
    name: 'Groups that overlap',
    needs: ['subtract-two-digit', 'probability-simple'],
    tags: PSDA,
    item: (i) => {
      const soccer = 8 + ((i * 3) % 7);
      const chess = 6 + ((i * 5) % 7);
      const both = 2 + ((i * 2) % 4);
      const neither = 2 + ((i * 3) % 5);
      const total = soccer + chess - both + neither;
      return i % 2 === 0
        ? [
            `In a class of ${total} students, ${soccer} play soccer, ${chess} play chess and ${both} play both. How many play neither?`,
            String(neither),
            'Add the groups, then take away the students counted twice, those in both. Take what is left from the whole class.',
          ]
        : [
            `In a class of ${total} students, ${soccer} play soccer, ${chess} play chess and ${both} play both. How many play soccer but not chess?`,
            String(soccer - both),
            'The students who play both are already in the soccer group. Take them out to see who is left.',
          ];
    },
  }),
];

// ─── 9-12: counting, compound chance, the mean again, a line of fit ───────

const high: MathsNode[] = [
  mathsNode({
    id: 'counting-arrangements',
    band: '9-12',
    name: 'Arranging and choosing',
    needs: ['outfit-counting', 'multiply-multi-digit', 'divide-equal-groups'],
    tags: PSDA,
    item: (i) => {
      const n = 4 + ((i * 3) % 4);
      const mode = i % 3;
      if (mode === 0) {
        return [`In how many different orders can ${n} people stand in a line?`, String(factorial(n)), 'Any person can go first. After that, fewer people remain to choose from at each place.'];
      }
      if (mode === 1) {
        return [
          `A club of ${n + 2} students picks a president and a vice-president, who must be different students. In how many ways can they be picked?`,
          String((n + 2) * (n + 1)),
          'Count the choices for president, then the choices left for vice-president, and multiply.',
        ];
      }
      const pick = 2 + (i % 2);
      return [
        `A teacher picks ${pick} of ${n + 2} students to hand out books. The order does not matter. How many different groups are possible?`,
        String(choose(n + 2, pick)),
        'Count the ordered picks first, then divide by the number of ways the same group can be put in order.',
      ];
    },
  }),
  mathsNode({
    id: 'probability-compound',
    band: '9-12',
    name: 'Chances that happen one after another',
    needs: ['probability-simple', 'fractions-multiply'],
    tags: PSDA,
    item: (i) => {
      const mode = i % 3;
      if (mode === 0) {
        const flips = 2 + ((i * 2) % 4);
        return [`A fair coin is flipped ${flips} times. What is the probability that every flip lands heads? Give a fraction.`, `1/${2 ** flips}`, 'The flips do not affect each other, so the chances multiply.'];
      }
      const red = 2 + ((i * 3) % 4);
      const blue = 2 + ((i * 5) % 4);
      const total = red + blue;
      if (mode === 1) {
        return [
          `A bag holds ${red} red and ${blue} blue marbles. A marble is picked, looked at and put back, then another is picked. What is the probability that both are red? Give a fraction.`,
          frac(red * red, total * total),
          'The bag is the same for the second pick, so the chances multiply.',
        ];
      }
      return [
        `A bag holds ${red} red and ${blue} blue marbles. Two marbles are picked one after the other and not put back. What is the probability that both are red? Give a fraction.`,
        frac(red * (red - 1), total * (total - 1)),
        'For the second pick, think about what is left in the bag.',
      ];
    },
  }),
  mathsNode({
    id: 'mean-with-new-value',
    band: '9-12',
    name: 'How a new number moves the mean',
    needs: ['mean-median-mode', 'one-step-equations'],
    tags: PSDA,
    item: (i) => {
      const n = 3 + (i % 4);
      const mean = 30 + ((i * 3) % 20);
      const change = cycle([2, -3, 4, -2, 3, 1], Math.floor(i / 2));
      const newMean = mean + change;
      if (i % 2 === 0) {
        return [
          `The mean of ${n} numbers is ${mean}. A new number, ${mean + change * (n + 1)}, is added. What is the mean of all ${n + 1} numbers?`,
          String(newMean),
          'Work out the total of the old numbers from their mean, add the new number, then share by the new count.',
        ];
      }
      return [
        `${n} scores have a mean of ${mean}. What must the next score be to bring the mean of all ${n + 1} scores to ${newMean}?`,
        String(mean + change * (n + 1)),
        'Find the total the scores need to have for the new mean, then take away the total they have now.',
      ];
    },
  }),
  mathsNode({
    id: 'line-of-fit',
    band: '9-12',
    name: 'Reading a line of best fit',
    needs: ['linear-models', 'mean-median-mode'],
    tags: PSDA,
    item: (i) => {
      const slope = 2 + ((i * 3) % 8);
      const start = -8 + ((i * 5) % 28);
      const x = 1 + ((i * 2) % 9);
      const line = `y = ${slope}x ${plus(start)}`;
      return i % 2 === 0
        ? [
            `A line of best fit for some data is ${line}. What value of y does the line predict when x = ${x}?`,
            String(slope * x + start),
            'Put the value of x in place of x, multiply, then add or take away the last number.',
          ]
        : [
            `A line of best fit for some data is ${line}. By how much does the predicted y go up for every ${x} that x goes up?`,
            String(slope * x),
            'The number in front of x tells how much y changes for each step of x. Scale it by the size of the step.',
          ];
    },
  }),
];

// ─── The competition tier: AMC 8 and AMC 10 counting and probability ───────

const WORDS = ['LEVEL', 'APPLE', 'BANANA', 'MOON', 'TOOTH', 'RADAR', 'ANNA', 'BOOK'];

/** The orders the letters of a word can come in: all arrangements, shared out among the repeated letters. */
function arrangements(word: string): number {
  const counts = new Map<string, number>();
  for (const letter of word) counts.set(letter, (counts.get(letter) ?? 0) + 1);
  return [...counts.values()].reduce((total, c) => total / factorial(c), factorial(word.length));
}

/** How many of 1..limit are a multiple of a or of b. */
function multiplesOfEither(limit: number, a: number, b: number): number {
  let count = 0;
  for (let n = 1; n <= limit; n += 1) if (n % a === 0 || n % b === 0) count += 1;
  return count;
}

const MULTIPLE_PAIRS: readonly (readonly [number, number])[] = [
  [3, 4], [4, 6], [2, 5], [6, 9], [3, 7], [4, 10], [5, 6],
];

const contest: MathsNode[] = [
  mathsNode({
    id: 'inclusion-exclusion',
    band: 'competition',
    name: 'Counting without counting twice',
    needs: ['overlapping-groups', 'gcd-lcm'],
    tags: COMPETITION,
    item: (i) => {
      const [a, b] = cycle(MULTIPLE_PAIRS, i);
      const limit = cycle([50, 100, 60, 120, 200], i + Math.floor(i / 7));
      return [
        `How many whole numbers from 1 to ${limit} are multiples of ${a} or of ${b}, or both?`,
        String(multiplesOfEither(limit, a, b)),
        'Count the multiples of each, add those counts, then take away the numbers counted twice, which are the multiples of both.',
      ];
    },
  }),
  mathsNode({
    id: 'arrangements-with-repeats',
    band: 'competition',
    name: 'Arranging letters that repeat',
    needs: ['counting-arrangements'],
    tags: COMPETITION,
    item: (i) => {
      const word = cycle(WORDS, i);
      return [
        `In how many different orders can the letters of the word ${word} be written?`,
        String(arrangements(word)),
        'Count the arrangements as if every letter were different, then divide by the number of ways to shuffle each set of repeated letters.',
      ];
    },
  }),
  mathsNode({
    id: 'complement-probability',
    band: 'competition',
    name: 'Counting what you do not want',
    needs: ['probability-compound', 'counting-arrangements'],
    tags: COMPETITION,
    item: (i) => {
      if (i % 2 === 0) {
        const flips = 3 + (Math.floor(i / 2) % 5);
        return [
          `A fair coin is flipped ${flips} times. What is the probability of at least one head? Give a fraction.`,
          frac(2 ** flips - 1, 2 ** flips),
          'It is easier to count the single way that fails, and take that chance away from the whole.',
        ];
      }
      const least = 4 + ((Math.floor(i / 2) * 2) % 8);
      let works = 0;
      for (let a = 1; a <= 6; a += 1) for (let b = 1; b <= 6; b += 1) if (a + b >= least) works += 1;
      return [
        `Two fair dice are rolled. What is the probability that the total is at least ${least}? Give a fraction.`,
        frac(works, 36),
        'Count the outcomes you do not want and take that share away from the whole.',
      ];
    },
  }),
  mathsNode({
    id: 'pigeonhole',
    band: 'competition',
    name: 'Being sure by worst luck',
    needs: ['outfit-counting', 'overlapping-groups'],
    tags: COMPETITION,
    item: (i) => {
      const colours = 3 + ((i * 2) % 6);
      if (i % 2 === 0) {
        return [
          `A drawer holds plenty of socks in ${colours} colours. You pull socks out in the dark. What is the fewest you must pull to be sure of a matching pair?`,
          String(colours + 1),
          'Imagine the worst luck: take as many as you can without success, and the very next pull must work.',
        ];
      }
      const want = 3 + (i % 3);
      return [
        `A drawer holds plenty of socks in ${colours} colours. You pull socks out in the dark. What is the fewest you must pull to be sure of ${want} socks of the same colour?`,
        String(colours * (want - 1) + 1),
        'Imagine the worst luck: take as many as you can without success, and the very next pull must work.',
      ];
    },
  }),
];

/** The data nodes, K to 9-12 and the competition tier. */
export const DATA_NODES: readonly MathsNode[] = [...early, ...middle, ...high, ...contest];

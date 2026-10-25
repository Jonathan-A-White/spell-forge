// src/learn/maths/nodes-geometry.ts — The geometry nodes of the maths graph, K to 9-12 and the competition tier: shapes and their sides,
// length, perimeter and area, angles, volume, circles and the Pythagorean theorem, then similar triangles, special right triangles,
// trigonometry and the equation of a circle. The 9-12 nodes cite the SAT Math domain Additional Topics in Math (geometry and trigonometry)
// by name, and the competition nodes the AMC topic list Geometry. The problems are written here, none copied from any test or contest.
// Each node's `item(i)` makes its i-th item as [problem, answer, hint] from the index alone; a hint is a nudge with no number or number
// word in it. docs/maths-graph.md says how to add a node.

import { cycle, frac, neg, plus, sup } from './format.ts';
import { mathsNode, type MathsNode } from './items.ts';
import { AMC_GEOMETRY } from './nodes-competition.ts';

/** The tag of a node that prepares for the SAT Math domain Additional Topics in Math (geometry and trigonometry). */
export const ADDITIONAL_TOPICS_IN_MATH = 'sat:additional-topics-in-math';

const ADDITIONAL = [ADDITIONAL_TOPICS_IN_MATH];
const COMPETITION = [AMC_GEOMETRY];

/** Right triangles with whole sides: the two legs, then the hypotenuse. */
const TRIPLES: readonly (readonly [number, number, number])[] = [
  [3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [6, 8, 10], [9, 12, 15], [20, 21, 29],
];

/** "a triangle" or "an octagon". */
const aOrAn = (name: string): string => (/^[aeiou]/.test(name) ? `an ${name}` : `a ${name}`);

/** A number of hundredths as a decimal answer with no trailing zeros: 3140 as `31.4`, 1256 as `12.56`, 400 as `4`. */
function fromHundredths(h: number): string {
  const whole = Math.floor(h / 100);
  const part = h % 100;
  if (part === 0) return String(whole);
  return `${whole}.${String(part).padStart(2, '0').replace(/0$/, '')}`;
}

// ─── K to 1-2: shapes, solids and length ───────────────────

const SHAPES: readonly (readonly [name: string, sides: number])[] = [
  ['triangle', 3], ['square', 4], ['pentagon', 5], ['hexagon', 6], ['rectangle', 4], ['octagon', 8],
];

const SOLIDS: readonly (readonly [name: string, faces: number, edges: number, corners: number])[] = [
  ['cube', 6, 12, 8], ['square pyramid', 5, 8, 5], ['triangular prism', 5, 9, 6], ['rectangular box', 6, 12, 8],
];

const early: MathsNode[] = [
  mathsNode({
    id: 'shape-sides',
    band: 'K',
    name: 'How many sides a shape has',
    needs: ['count-to-10'],
    item: (i) => {
      const [name, sides] = cycle(SHAPES, i);
      return [
        `How many sides does ${aOrAn(name)} have?`,
        String(sides),
        'Trace round the edge with a finger and count each straight side as you pass it.',
      ];
    },
  }),
  mathsNode({
    id: 'solid-faces',
    band: '1-2',
    name: 'Faces, edges and corners of solid shapes',
    needs: ['shape-sides', 'add-within-20'],
    item: (i) => {
      const [name, faces, edges, corners] = cycle(SOLIDS, i);
      const part = Math.floor(i / 4) % 3;
      if (part === 0) return [`How many flat faces does a ${name} have?`, String(faces), 'Count the flat surfaces, and do not forget the bottom you cannot see.'];
      if (part === 1) {
        return [`How many edges does a ${name} have?`, String(edges), 'An edge is where faces meet. Count them in groups: those round the top, those round the bottom, and those that join them.'];
      }
      return [`How many corners does a ${name} have?`, String(corners), 'A corner is a point where edges meet. Touch each point as you count so that none is counted twice.'];
    },
  }),
  mathsNode({
    id: 'measure-length',
    band: '1-2',
    name: 'Measuring and comparing lengths',
    needs: ['subtract-within-20', 'add-within-20'],
    item: (i) => {
      const long = 11 + ((i * 3) % 9);
      const short = 2 + ((i * 5) % 8);
      return i % 2 === 0
        ? [
            `A pencil is ${long} cm long and a crayon is ${short} cm long. How many cm longer is the pencil?`,
            String(long - short),
            'Line them up at the start. The extra bit at the end is the difference, so take the shorter length from the longer.',
          ]
        : [
            `A red ribbon is ${short + 3} cm long and a blue ribbon is ${short + 5} cm long. Laid end to end, how many cm long are they together?`,
            String(2 * short + 8),
            'Laid end to end, the lengths add up.',
          ];
    },
  }),
];

// ─── 3-5: perimeter, area, angles, volume ───────────────────

const middle: MathsNode[] = [
  mathsNode({
    id: 'perimeter',
    band: '3-5',
    name: 'Perimeter: the way round a shape',
    needs: ['add-two-digit', 'shape-sides'],
    item: (i) => {
      if (i % 3 === 2) {
        const side = 3 + ((i * 2) % 9);
        return [
          `A square has sides of ${side}. What is its perimeter?`,
          String(4 * side),
          'Perimeter is the distance all the way round. Every side of a square is the same length.',
        ];
      }
      const wide = 2 + ((i * 3) % 4);
      const long = wide + 1 + ((i * 5) % 6);
      return [
        `A rectangle is ${long} long and ${wide} wide. What is its perimeter?`,
        String(2 * (long + wide)),
        'Perimeter is the distance all the way round. Add the long side and the wide side, then double that, since each shows up twice.',
      ];
    },
  }),
  mathsNode({
    id: 'area-rectangles',
    band: '3-5',
    name: 'Area: how much a rectangle covers',
    needs: ['times-tables', 'perimeter'],
    item: (i) => {
      if (i % 4 === 3) {
        const side = 3 + ((i * 2) % 8);
        return [`A square has sides of ${side}. What is its area?`, String(side * side), 'Area counts the unit squares that cover the shape. A square has as many rows as squares in each row.'];
      }
      const wide = 2 + ((i * 3) % 7);
      const long = wide + 1 + ((i * 2) % 5);
      return [
        `A rectangle is ${long} long and ${wide} wide. What is its area?`,
        String(long * wide),
        'Area counts the unit squares that cover the shape: the number of rows times the squares in each row.',
      ];
    },
  }),
  mathsNode({
    id: 'angles-on-a-line',
    band: '3-5',
    name: 'Angles that fit together',
    needs: ['add-subtract-within-1000', 'shape-sides'],
    item: (i) => {
      const mode = i % 3;
      const angle = 20 + 10 * ((i * 3) % 14);
      if (mode === 0) {
        return [
          `Angles on a straight line add up to 180°. One angle is ${angle}°. How big is the other angle?`,
          String(180 - angle),
          'The angles together make the full straight line, so take the angle you know from the total.',
        ];
      }
      if (mode === 1) {
        const small = 20 + 10 * ((i * 3) % 12);
        return [
          `Angles all the way round a point add up to 360°. Two angles are ${small}° and ${angle}°, and the rest of the turn is left. How big is the angle that is left?`,
          String(360 - small - angle),
          'Add the angles you know, then take that total from the full turn.',
        ];
      }
      const part = 10 + 5 * ((i * 3) % 15);
      return [`A right angle is 90°. It is split into a part of ${part}° and a second part. How big is the second part?`, String(90 - part), 'The parts together make the right angle, so take the part you know from the total.'];
    },
  }),
  mathsNode({
    id: 'volume-boxes',
    band: '3-5',
    name: 'Volume: filling a box with cubes',
    needs: ['area-rectangles', 'multiply-multi-digit'],
    item: (i) => {
      const long = 2 + ((i * 3) % 6);
      const wide = 2 + ((i * 5 + 1) % 5);
      const high = 2 + ((i * 7 + 2) % 5);
      return [
        `A box is ${long} long, ${wide} wide and ${high} high. How many unit cubes fill it?`,
        String(long * wide * high),
        'Find how many cubes cover the bottom layer, then multiply by the number of layers.',
      ];
    },
  }),
];

// ─── 6-8: triangles, angles in shapes, circles, the Pythagorean theorem ───────

const POLYGONS: readonly (readonly [name: string, sides: number])[] = [
  ['pentagon', 5], ['hexagon', 6], ['octagon', 8], ['nonagon', 9], ['decagon', 10], ['dodecagon', 12],
];

const upper: MathsNode[] = [
  mathsNode({
    id: 'area-triangles',
    band: '6-8',
    name: 'Area of triangles and other flat shapes',
    needs: ['area-rectangles', 'divide-equal-groups'],
    item: (i) => {
      const mode = i % 3;
      if (mode === 0) {
        const base = 2 * (2 + ((i * 3) % 7));
        const high = 3 + ((i * 5) % 8);
        return [`A triangle has a base of ${base} and a height of ${high}. What is its area?`, String((base * high) / 2), 'A triangle is half of a rectangle with the same base and height.'];
      }
      if (mode === 1) {
        const base = 3 + ((i * 3) % 9);
        const high = 2 + ((i * 5) % 7);
        return [`A parallelogram has a base of ${base} and a height of ${high}. What is its area?`, String(base * high), 'Slide a triangle from the left end across to the right end and the parallelogram becomes a rectangle.'];
      }
      const top = 3 + ((i * 2) % 5);
      const bottom = top + 2 * (1 + ((i * 3) % 4));
      const high = 2 + ((i * 5) % 7);
      return [
        `A trapezoid has parallel sides of ${top} and ${bottom}, and a height of ${high}. What is its area?`,
        String(((top + bottom) * high) / 2),
        'Average the parallel sides, then multiply by the height.',
      ];
    },
  }),
  mathsNode({
    id: 'angles-in-polygons',
    band: '6-8',
    name: 'The angles inside a shape',
    needs: ['angles-on-a-line', 'multiply-multi-digit'],
    item: (i) => {
      const mode = i % 3;
      if (mode === 0) {
        const a = 30 + 5 * ((i * 3) % 12);
        const b = 40 + 5 * ((i * 5) % 12);
        return [
          `Two angles of a triangle are ${a}° and ${b}°. How big is the third angle?`,
          String(180 - a - b),
          'The angles inside any triangle add up to a fixed total. Take the angles you know from that total.',
        ];
      }
      if (mode === 1) {
        const a = 70 + 5 * ((i * 3) % 8);
        const b = 80 + 5 * ((i * 2) % 8);
        const c = 60 + 5 * ((i * 5) % 8);
        return [
          `Three angles of a four-sided shape are ${a}°, ${b}° and ${c}°. How big is the fourth angle?`,
          String(360 - a - b - c),
          'Split the shape into triangles from a corner to find the total of its angles, then take the angles you know from it.',
        ];
      }
      const [name, sides] = cycle(POLYGONS, Math.floor(i / 3));
      return [
        `What do the angles inside ${aOrAn(name)} add up to, in degrees?`,
        String((sides - 2) * 180),
        'Split the shape into triangles from a corner. Each triangle has the same angle total.',
      ];
    },
  }),
  mathsNode({
    id: 'circles',
    band: '6-8',
    name: 'Around a circle and inside it',
    needs: ['area-rectangles', 'decimals-multiply-divide', 'exponents'],
    item: (i) => {
      const radius = 1 + ((i * 4) % 9);
      const mode = i % 3;
      if (mode === 0) {
        return [`Use 3.14 for π. A circle has a radius of ${radius}. What is its circumference?`, fromHundredths(628 * radius), 'Circumference is π times the width across the circle, and the width across is double the radius.'];
      }
      if (mode === 1) {
        return [`Use 3.14 for π. A circle has a radius of ${radius}. What is its area?`, fromHundredths(314 * radius * radius), 'Area is π times the radius times the radius.'];
      }
      return [`Use 3.14 for π. A circle is ${2 * radius} wide all the way across. What is its circumference?`, fromHundredths(628 * radius), 'Circumference is π times the width across the circle.'];
    },
  }),
  mathsNode({
    id: 'pythagorean-theorem',
    band: '6-8',
    name: 'The sides of a right triangle',
    needs: ['square-roots', 'area-rectangles', 'evaluate-expression'],
    item: (i) => {
      const [p, q, h] = cycle(TRIPLES, i);
      const flip = Math.floor(i / 7) % 2 === 1;
      const [a, b] = flip ? [q, p] : [p, q];
      return i % 2 === 0
        ? [
            `A right triangle has legs ${a} and ${b}. How long is the hypotenuse?`,
            String(h),
            'Square both short sides and add them: the total is the square of the longest side.',
          ]
        : [
            `A right triangle has a hypotenuse of ${h} and a leg of ${a}. How long is the other leg?`,
            String(b),
            'Square the longest side and take away the square of the leg you know. What is left is the square of the other leg.',
          ];
    },
  }),
];

// ─── 9-12: similar triangles, circles, trigonometry, the plane ───────

const TRIG_FUNCTIONS = ['sine', 'cosine', 'tangent'] as const;
const DEGREES_FOR_RADIANS: readonly (readonly [radians: string, degrees: number])[] = [
  ['π/6', 30], ['π/4', 45], ['π/3', 60], ['π/2', 90], ['2π/3', 120], ['π', 180], ['3π/2', 270], ['2π', 360],
];
const ARC_ANGLES = [30, 45, 60, 90, 120, 180];

/** A nonzero number: 0 becomes the fallback. */
const nonzero = (n: number, fallback: number): number => (n === 0 ? fallback : n);

const high: MathsNode[] = [
  mathsNode({
    id: 'similar-triangles',
    band: '9-12',
    name: 'Triangles of the same shape',
    needs: ['proportional-equations', 'pythagorean-theorem'],
    tags: ADDITIONAL,
    item: (i) => {
      const scale = 2 + ((i * 3) % 4);
      const matching = 3 + ((i * 5) % 6);
      const other = matching + 1 + ((i * 2) % 4);
      return [
        `Two triangles are similar. A side of ${matching} in the small one matches a side of ${matching * scale} in the big one. Another side of the small one is ${other}. How long is the matching side of the big one?`,
        String(other * scale),
        'Find how many times longer the matching sides are, then use that same scale on the other side.',
      ];
    },
  }),
  mathsNode({
    id: 'circle-arcs',
    band: '9-12',
    name: 'Part of a circle: arcs and sectors',
    needs: ['circles', 'fraction-of-a-set', 'angles-in-polygons'],
    tags: ADDITIONAL,
    item: (i) => {
      const angle = cycle(ARC_ANGLES, i);
      const whole = 24 * (1 + ((i * 3) % 4));
      return i % 2 === 0
        ? [
            `A circle has a circumference of ${whole}. A central angle of ${angle}° cuts off an arc. How long is the arc?`,
            String((whole * angle) / 360),
            'The arc is the same share of the circumference as the angle is of the full turn.',
          ]
        : [
            `A circle has an area of ${whole}. A central angle of ${angle}° marks off a sector. What is the area of the sector?`,
            String((whole * angle) / 360),
            'The sector is the same share of the area as the angle is of the full turn.',
          ];
    },
  }),
  mathsNode({
    id: 'special-right-triangles',
    band: '9-12',
    name: 'Right triangles with famous angles',
    needs: ['pythagorean-theorem', 'square-roots'],
    tags: ADDITIONAL,
    item: (i) => {
      const k = 3 + ((i * 2) % 12);
      const mode = i % 3;
      if (mode === 0) {
        return [
          `In a 30-60-90 triangle, the side opposite the 30° angle is ${k}. How long is the hypotenuse?`,
          String(2 * k),
          'In this triangle the hypotenuse is a fixed multiple of the shortest side.',
        ];
      }
      if (mode === 1) {
        return [
          `A 30-60-90 triangle has a hypotenuse of ${2 * k}. How long is the shortest side?`,
          String(k),
          'In this triangle the hypotenuse is a fixed multiple of the shortest side, so go back the other way.',
        ];
      }
      return [
        `A 45-45-90 triangle has a hypotenuse of ${k}√2. How long is each leg?`,
        String(k),
        'The legs are equal, and the hypotenuse is a leg multiplied by the root shown, so divide that root out.',
      ];
    },
  }),
  mathsNode({
    id: 'trig-ratios',
    band: '9-12',
    name: 'Sine, cosine and tangent',
    needs: ['pythagorean-theorem', 'fractions-equivalent'],
    tags: ADDITIONAL,
    item: (i) => {
      const fn = TRIG_FUNCTIONS[i % 3];
      const [p, q, h] = cycle(TRIPLES.slice(0, 4), Math.floor(i / 3));
      const [opposite, adjacent] = Math.floor(i / 12) % 2 === 1 ? [q, p] : [p, q];
      const answer = fn === 'sine' ? frac(opposite, h) : fn === 'cosine' ? frac(adjacent, h) : frac(opposite, adjacent);
      return [
        `A right triangle has legs ${p} and ${q} and a hypotenuse of ${h}. For the angle opposite the leg of ${opposite}, what is the ${fn}? Give a fraction.`,
        answer,
        'SOH CAH TOA: sine is opposite over hypotenuse, cosine is adjacent over hypotenuse, tangent is opposite over adjacent.',
      ];
    },
  }),
  mathsNode({
    id: 'radians-and-degrees',
    band: '9-12',
    name: 'Radians and degrees',
    needs: ['trig-ratios', 'circle-arcs'],
    tags: ADDITIONAL,
    item: (i) => {
      const [radians, degrees] = cycle(DEGREES_FOR_RADIANS, i);
      return [
        `How many degrees is ${radians} radians?`,
        String(degrees),
        'A half turn, a straight line, is π radians. Scale from there.',
      ];
    },
  }),
  mathsNode({
    id: 'circle-equation',
    band: '9-12',
    name: 'The equation of a circle',
    needs: ['circles', 'quadratic-by-square-roots', 'coordinate-plane'],
    tags: ADDITIONAL,
    item: (i) => {
      const h = nonzero(-3 + ((i * 2) % 9), 4);
      const k = nonzero(-4 + ((i * 3) % 9), 5);
      const r = 3 + ((i * 2) % 8);
      const equation = `(x ${plus(-h)})${sup(2)} + (y ${plus(-k)})${sup(2)} = ${r * r}`;
      const mode = i % 3;
      const hint = 'The brackets show the centre with the opposite sign. The number on the right is the radius squared.';
      if (mode === 0) return [`A circle has the equation ${equation}. What is its radius?`, String(r), hint];
      if (mode === 1) return [`A circle has the equation ${equation}. What is the x-coordinate of its centre?`, String(h), hint];
      return [`A circle has the equation ${equation}. What is the y-coordinate of its centre?`, String(k), hint];
    },
  }),
  mathsNode({
    id: 'midpoint-distance',
    band: '9-12',
    name: 'Midpoints and distances on the plane',
    needs: ['coordinate-plane', 'pythagorean-theorem'],
    tags: ADDITIONAL,
    item: (i) => {
      const mode = i % 3;
      const x1 = -4 + ((i * 3) % 9);
      const y1 = -3 + ((i * 5) % 8);
      if (mode === 2) {
        const [p, q, h] = cycle(TRIPLES.slice(0, 4), Math.floor(i / 3));
        return [
          `How far apart are the points (${neg(x1)}, ${neg(y1)}) and (${neg(x1 + p)}, ${neg(y1 + q)})?`,
          String(h),
          'Draw a right triangle between the points: the horizontal gap and the vertical gap are its legs.',
        ];
      }
      const gapX = 2 * (1 + ((i * 2) % 5));
      const gapY = 2 * (1 + ((i * 3) % 4));
      const x2 = x1 + gapX;
      const y2 = y1 - gapY;
      return mode === 0
        ? [`What is the x-coordinate of the midpoint of (${neg(x1)}, ${neg(y1)}) and (${neg(x2)}, ${neg(y2)})?`, String(x1 + gapX / 2), 'The midpoint is the average of both x-coordinates.']
        : [`What is the y-coordinate of the midpoint of (${neg(x1)}, ${neg(y1)}) and (${neg(x2)}, ${neg(y2)})?`, String(y1 - gapY / 2), 'The midpoint is the average of both y-coordinates.'];
    },
  }),
];

// ─── The competition tier: AMC 8 and AMC 10 geometry ───────

const contest: MathsNode[] = [
  mathsNode({
    id: 'scaling-areas',
    band: 'competition',
    name: 'How areas grow when shapes scale',
    needs: ['similar-triangles'],
    tags: COMPETITION,
    item: (i) => {
      const small = 1 + (i % 4);
      const big = small + 1 + ((i * 3) % 3);
      const area = small * small * (2 + ((i * 5) % 7));
      return [
        `Two similar triangles have matching sides of ${small} and ${big}. The small one has an area of ${area}. What is the area of the big one?`,
        String((area * big * big) / (small * small)),
        'When every length is scaled, the area is scaled by the square of that scale factor.',
      ];
    },
  }),
  mathsNode({
    id: 'circle-angles',
    band: 'competition',
    name: 'Angles inside a circle',
    needs: ['circle-arcs', 'angles-in-polygons'],
    tags: COMPETITION,
    item: (i) => {
      const mode = i % 3;
      if (mode === 0) {
        const arc = 2 * (20 + 5 * ((i * 3) % 14));
        return [`An angle with its corner on a circle cuts off an arc of ${arc}°. How big is that angle?`, String(arc / 2), 'An angle at the edge of the circle is a fixed share of the arc it cuts off.'];
      }
      if (mode === 1) {
        const angle = 15 + 5 * ((i * 3) % 14);
        return [`An angle with its corner on a circle is ${angle}°. How many degrees is the arc it cuts off?`, String(2 * angle), 'The arc is a fixed multiple of the angle at the edge of the circle.'];
      }
      const angle = 20 + ((i * 3) % 50);
      return [
        `A triangle is drawn in a circle with one side a diameter. One of the other angles is ${angle}°. How big is the third angle?`,
        String(90 - angle),
        'An angle at the edge of the circle that faces a diameter is a right angle. Then use the angle total of a triangle.',
      ];
    },
  }),
  mathsNode({
    id: 'triangle-inequality',
    band: 'competition',
    name: 'Which triangles can be made',
    needs: ['angles-in-polygons', 'absolute-value-equations', 'pythagorean-theorem'],
    tags: COMPETITION,
    item: (i) => {
      const a = 3 + ((i * 3) % 10);
      const b = 3 + ((i * 5 + 2) % 12);
      if (i % 2 === 0) {
        return [
          `Two sides of a triangle are ${a} and ${b}. How many whole-number lengths can the third side have?`,
          String(2 * Math.min(a, b) - 1),
          'The third side must be shorter than the other sides added together and longer than their difference. Count the whole numbers strictly between.',
        ];
      }
      return [
        `Two sides of a triangle are ${a} and ${b}. What is the greatest whole-number length the third side can have?`,
        String(a + b - 1),
        'The third side must be shorter than the other sides added together, but it cannot reach it.',
      ];
    },
  }),
  mathsNode({
    id: 'polygon-diagonals',
    band: 'competition',
    name: 'Diagonals and angles of regular shapes',
    needs: ['angles-in-polygons', 'shape-sides'],
    tags: COMPETITION,
    item: (i) => {
      const [name, sides] = cycle(POLYGONS, Math.floor(i / 2));
      return i % 2 === 0
        ? [
            `How many diagonals does ${aOrAn(name)} have?`,
            String((sides * (sides - 3)) / 2),
            'Each corner joins by a diagonal to every other corner except itself and its neighbours. Count that for each corner, then halve, since each diagonal is counted from both of its ends.',
          ]
        : [
            `How big, in degrees, is each angle of a regular ${name}?`,
            String(((sides - 2) * 180) / sides),
            'Find the total of all the angles by splitting into triangles, then share it out equally among the corners.',
          ];
    },
  }),
];

/** The geometry nodes, K to 9-12 and the competition tier. */
export const GEOMETRY_NODES: readonly MathsNode[] = [...early, ...middle, ...upper, ...high, ...contest];

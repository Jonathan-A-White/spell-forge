# The maths graph

What a child can do with numbers, as a graph of small things to learn, "from beginning kindergarten or even preschool all the way up"
for "somebody who knows no Greek", brought up step by step. Each node is one thing to learn (counting to 5, tens and ones, which
fraction is bigger), each node says which nodes it rests on, and the graph is validated over `@learn-kit/graph`
(`learn-kit/graph`, pinned by commit in `package.json`): a directed acyclic graph, no unknown need, no need of a higher level. It is
data and pure code under `src/learn/maths/`; no screen reads it yet. It is the twin of the spelling graph (`docs/spelling-graph.md`)
and the two share no code, so each can change on its own.

## The files

- `items.ts`: the shapes (`MathsNode`, `MathsItem`, `SolidRule`), the seven grade bands, `checkAnswer` (does what the child gave
  match the item's answer), `nodeProblems` (what is wrong with a node) and `mathsNode(...)`, the one way a node file builds a node.
- `nodes-number.ts`: the number nodes for `preK` to `3-5`: counting, place value, fractions, ratios. Later strands (operations,
  algebra, geometry, data) are their own `nodes-<strand>.ts` and need these nodes by id.
- `nodes-operations.ts`: the operations nodes for `K` to `6-8`: adding, taking away, multiplying and dividing, in whole numbers, then
  fractions, decimals and negative numbers, up to exponents and percent. They rest on the number nodes.
- `nodes-algebra.ts`: the algebra nodes for `6-8` and `9-12`: expressions, equations, inequalities, rates and lines, systems,
  quadratics, powers and functions. They rest on the operations nodes, and cite the SAT Math domains (below).
- `nodes-geometry.ts`: the geometry nodes for `K` to `9-12` and the competition tier: shapes, length, perimeter and area, angles,
  volume, circles and the Pythagorean theorem, then similar triangles, special right triangles, trigonometry, radians and the
  equation of a circle. The 9-12 ones cite the SAT Math domain Additional Topics in Math.
- `nodes-data.ts`: the data nodes for `K` to `9-12` and the competition tier: picture and bar graphs, the mean, median and mode,
  probability and counting. The 9-12 ones cite the SAT Math domain Problem Solving and Data Analysis.
- `nodes-competition.ts`: the competition tier's tags (the four AMC topic lists, by name), `AMC_TOPICS`, and its number theory and
  algebra nodes. Its geometry and counting nodes sit with their strands, in the two files above.
- `goals.ts`: the two goals a child can choose with the tutor, `sat-maths-800` and `competition`, as sets of nodes of the graph;
  `mathsScaffold`, their path over `@learn-kit/learner`; and the sweep of problem kinds (below).
- `format.ts`: how the operations and algebra nodes write a number into a problem (`−3`, `x − 4`, `2³`) and an answer (`-3`, `3/4`).
- `graph.ts`: assembles the node files into `MATHS_NODES`, checks every node with `nodeProblems`, and validates the whole with
  learn-kit's `validate` into `mathsGraph`; `COMPETITION_NODES` is the competition tier of every strand. A node that breaks a rule stops the module from loading, so a test fails by name.
- `index.ts`: the barrel; import from `src/learn/maths`.

## The grade bands

Seven, youngest first. A band's place in the list is the learn-kit `level` of its nodes (0 to 6), so a node can never need a node of
a later band.

| Band | Level | Holds |
| --- | --- | --- |
| `preK` | 0 | counting up to 10, which group has more |
| `K` | 1 | counting to 20, one more and one less, comparing, ten and some more, fair shares; adding and taking away to 10 |
| `1-2` | 2 | tens and ones, hundreds, skipping in jumps, halves and quarters; adding and taking away to 20, 100 and 1000 |
| `3-5` | 3 | bigger place value, rounding, fractions, tenths, ratios; multiplying and dividing, big numbers, decimals and fractions |
| `6-8` | 4 | fractions, decimals and negative numbers in the four operations, exponents, percent; expressions, equations, rates, slope, functions (mw-79en7t.55) |
| `9-12` | 5 | lines, systems, inequalities and models; quadratics, powers, growth and function notation (mw-79en7t.55); similar triangles, circles, trigonometry; counting, chance and a line of fit (mw-79en7t.56) |
| `competition` | 6 | the AMC 8 and AMC 10 kind of problem: number theory, algebra, geometry, counting and probability; rests on nodes of every band below (mw-79en7t.56) |

## The node shape

A `MathsNode` is a learn-kit `GraphNode` plus what maths adds to it:

| Field | What it is |
| --- | --- |
| `id` | Kebab-case, unique (`count-to-10`, `fractions-compare`). |
| `band` | One of the seven grade bands. `level` is the band's, set for you. |
| `needs` | The ids of the nodes it rests on directly. Only `preK` nodes may need nothing. |
| `solid` | The rule for being solid: `{ right, of }`, `right` of the child's last `of` tries right (3 of 4 in `preK`, 4 of 5 above). |
| `items` | At least 3 (`MIN_ITEMS`): the first few items, listed so the node is data you can read. |
| `item` | `item(index)`, the generator `items` is the start of: the same index always gives the same item, for any index from 0. |
| `name` | One line the child reads, in words a child of the band knows ("Tens and ones"). |

An item holds three things:

- `problem`: what the child is asked, in words a child of the band knows. Counting problems show the things to count.
- `answer`: the answer, bare (`12`, `3/4`, `3:2`, `0.3`), for checking on the phone with no network.
- `hint`: a nudge that leads to the answer and never says it. A test holds that the hint is not the answer, does not check as the
  answer, and holds no word or number that does. The tutor never gives the answer (VISION.md); a hint is the most the graph gives.

`checkAnswer(item, given)` reads the answer and what the child gave the same way: whole numbers, decimals, fractions and ratios by
value (`2/4` is `1/2`, `0.5` is `1/2`, `3 to 2` is `3:2`, `1,500` is `1500`), number words up to `twenty` (`five` is `5`),
anything else as words without case. A ratio is never a fraction (`3:2` refuses `3/2`). It compares the value, not the form, so a
problem that asks for a form ("in simplest form") needs a check of its own.

## What the maths loop handles today

`src/features/tutor/math-loop.tsx` sends the child's typed answer or a photo of his work to the mill (`sendMath`), which answers with
a probe, a confirmation or a close. Nothing there knows a node: the check of an answer is the tutor's. The graph's `checkAnswer`
is the local check for a drill on a node with no network, and the tutor's turns stay as they are until a story joins them.

## The SAT Math domains

The 9-12 nodes (and the 6-8 ones that lead to them) are tagged with the content domain of the SAT Math section they prepare for, by name
only: no problem is copied from any test, every problem is written here. A node's `tags` hold `maths`, its band, and its domain:

- `sat:heart-of-algebra` (`HEART_OF_ALGEBRA` in `nodes-algebra.ts`): **Heart of Algebra**, linear equations and inequalities in one and
  two variables, systems, and linear functions and models.
- `sat:passport-to-advanced-math` (`PASSPORT_TO_ADVANCED_MATH`): **Passport to Advanced Math**, quadratics and factoring, powers
  and exponential growth, function notation and the shape of a non-linear function.
- `sat:problem-solving-and-data-analysis` (`PROBLEM_SOLVING_AND_DATA_ANALYSIS` in `nodes-operations.ts`): **Problem Solving and Data
  Analysis**, rates and percent from the operations, and the mean, median and mode, probability, counting and a line of fit from the
  data strand (`nodes-data.ts`).
- `sat:additional-topics-in-math` (`ADDITIONAL_TOPICS_IN_MATH` in `nodes-geometry.ts`): **Additional Topics in Math**, geometry and
  trigonometry: similar triangles, circles and arcs, special right triangles, sine, cosine and tangent, radians, the equation of a
  circle. (The digital SAT calls this domain Geometry and Trigonometry.)

Every 9-12 node of the graph cites one of the four, and a test holds it.

## The competition tier

The `competition` band is the tier above 9-12: the kind of problem the AMC 8 and AMC 10 ask, by the four topic lists those contests
are written from, named here and nothing else taken from them: **Number Theory** (`amc:number-theory`), **Algebra** (`amc:algebra`),
**Geometry** (`amc:geometry`) and **Counting and Probability** (`amc:counting-and-probability`). The tags and `AMC_TOPICS` are in
`nodes-competition.ts`; each competition node carries one. A competition node rests on the 9-12 nodes (and below) it builds on, so
the tier is reached from the roots like every other.

## The goals

`goals.ts` holds the two goals the tutor offers for maths, in `@learn-kit/learner`'s `Goal` shape (an id, a title, the nodes it aims
at). His words: "I want to get an 800 on the math SAT"; "competitive ... at the ... math competitions".

- `sat-maths-800`: every 9-12 node that cites a SAT Math content domain (`SAT_DOMAINS`: Heart of Algebra, Problem Solving and Data
  Analysis, Passport to Advanced Math, Additional Topics in Math), so every domain is aimed at and everything they rest on is on the path.
- `competition`: the whole competition tier, so the four AMC topic lists are all aimed at.

`mathsScaffold(goal, solid)` is learner's `scaffold` over `mathsGraph`: the path still to go, in teaching order from the roots up. For
a child with nothing solid it is the whole goal, starting at the nodes that rest on nothing; a node leaves the path, and its hints and
slower pace with it, as it goes solid. Pass the child's solid node ids.

## The sweep of problem kinds

`PROBLEM_KIND_NODES` in `goals.ts` maps every kind of problem the maths loop and the tutor-turn grind handle today to a node. The
loop (`src/features/tutor/math-loop.tsx`) checks whatever answer comes back and knows no node; the kinds are the ones the grind is
shown, in `grinds/examples/tutor-turn/` and `grinds/tutor-turn.eval/`: `problem_kind` is `word` (a story) or `plain` (a bare sum), and
every problem sent today is a whole-number story over one of the four operations. A test reads those files, so a new problem there
that has no row fails by name.

| Kind | Operation | Node | Problems sent today |
| --- | --- | --- | --- |
| `word` | subtract | `subtract-within-20` | 12 stickers give away 5; 15 stickers give away 6 |
| `word` | subtract | `subtract-two-digit` | 24 marbles give away 9; 52 library books, 25 borrowed (the photo of working) |
| `word` | divide | `divide-equal-groups` | 24 pencils shared between 4 tables (also the problem in the photo example) |
| `word` | add | `add-within-20` | 8 shells and 6 more |
| `word` | multiply | `multiply-equal-groups` | 6 rows of 5 carrots |
| `plain` | add, subtract, multiply, divide | `add-two-digit`, `subtract-two-digit`, `times-tables`, `divide-equal-groups` | none yet |

A problem beyond these (a fraction, an equation, a shape) has no kind yet; the maths world (mw-79en7t.19) names the node it is about.

## The nodes

| Node | Band | Rests on |
| --- | --- | --- |
| `count-to-5` | `preK` | nothing |
| `count-to-10` | `preK` | `count-to-5` |
| `compare-groups` | `preK` | `count-to-5` |
| `numbers-to-20` | `K` | `count-to-10` |
| `one-more-one-less` | `K` | `count-to-10` |
| `compare-numbers` | `K` | `compare-groups`, `count-to-10` |
| `ten-and-ones` | `K` | `numbers-to-20` |
| `fair-shares` | `K` | `count-to-10` |
| `place-value-two-digit` | `1-2` | `ten-and-ones` |
| `place-value-hundreds` | `1-2` | `place-value-two-digit` |
| `skip-counting` | `1-2` | `numbers-to-20` |
| `compare-two-digit` | `1-2` | `place-value-two-digit`, `compare-numbers` |
| `halves-and-quarters` | `1-2` | `fair-shares` |
| `place-value-thousands` | `3-5` | `place-value-hundreds` |
| `round-numbers` | `3-5` | `place-value-thousands` |
| `fractions-equivalent` | `3-5` | `halves-and-quarters` |
| `fractions-compare` | `3-5` | `fractions-equivalent` |
| `fractions-add-same-bottom` | `3-5` | `halves-and-quarters` |
| `fraction-of-a-set` | `3-5` | `fair-shares`, `halves-and-quarters` |
| `decimals-tenths` | `3-5` | `halves-and-quarters`, `place-value-hundreds` |
| `ratio-language` | `3-5` | `fair-shares`, `halves-and-quarters` |
| `ratio-equivalent` | `3-5` | `ratio-language`, `fractions-equivalent` |
| `ratio-recipes` | `3-5` | `ratio-equivalent` |
| `add-within-10` | `K` | `count-to-10`, `one-more-one-less` |
| `subtract-within-10` | `K` | `add-within-10` |
| `add-within-20` | `1-2` | `add-within-10`, `ten-and-ones` |
| `subtract-within-20` | `1-2` | `subtract-within-10`, `add-within-20` |
| `missing-number-within-20` | `1-2` | `subtract-within-20` |
| `add-two-digit` | `1-2` | `add-within-20`, `place-value-two-digit` |
| `subtract-two-digit` | `1-2` | `subtract-within-20`, `add-two-digit` |
| `add-subtract-within-1000` | `1-2` | `subtract-two-digit`, `place-value-hundreds` |
| `multiply-equal-groups` | `3-5` | `skip-counting`, `add-within-20` |
| `times-tables` | `3-5` | `multiply-equal-groups` |
| `divide-equal-groups` | `3-5` | `times-tables`, `fair-shares` |
| `add-subtract-big` | `3-5` | `add-subtract-within-1000`, `place-value-thousands` |
| `multiply-multi-digit` | `3-5` | `times-tables`, `add-two-digit`, `place-value-thousands` |
| `divide-with-remainders` | `3-5` | `divide-equal-groups`, `multiply-multi-digit` |
| `order-of-operations` | `3-5` | `times-tables`, `subtract-two-digit` |
| `decimals-add-subtract` | `3-5` | `decimals-tenths`, `add-subtract-within-1000` |
| `fractions-add-different-bottom` | `3-5` | `fractions-add-same-bottom`, `fractions-equivalent`, `times-tables` |
| `fractions-multiply` | `3-5` | `fraction-of-a-set`, `multiply-multi-digit` |
| `fractions-divide` | `6-8` | `fractions-multiply`, `divide-equal-groups` |
| `decimals-multiply-divide` | `6-8` | `decimals-add-subtract`, `multiply-multi-digit`, `divide-equal-groups` |
| `integers-add-subtract` | `6-8` | `subtract-two-digit`, `compare-two-digit` |
| `integers-multiply-divide` | `6-8` | `integers-add-subtract`, `times-tables`, `divide-equal-groups` |
| `exponents` | `6-8` | `times-tables`, `multiply-multi-digit` |
| `percent-of` | `6-8` | `fraction-of-a-set`, `decimals-multiply-divide`, `ratio-equivalent` |
| `evaluate-expression` | `6-8` | `order-of-operations`, `missing-number-within-20` |
| `combine-like-terms` | `6-8` | `evaluate-expression` |
| `distributive-property` | `6-8` | `combine-like-terms`, `multiply-multi-digit` |
| `one-step-equations` | `6-8` | `evaluate-expression`, `missing-number-within-20`, `divide-equal-groups` |
| `two-step-equations` | `6-8` | `one-step-equations` |
| `multi-step-equations` | `6-8` | `two-step-equations`, `distributive-property`, `integers-add-subtract` |
| `equations-both-sides` | `6-8` | `multi-step-equations`, `integers-multiply-divide` |
| `inequalities-one-step` | `6-8` | `one-step-equations`, `compare-two-digit` |
| `unit-rate` | `6-8` | `ratio-recipes`, `divide-equal-groups` |
| `proportional-equations` | `6-8` | `unit-rate`, `evaluate-expression` |
| `coordinate-plane` | `6-8` | `integers-add-subtract` |
| `square-roots` | `6-8` | `exponents` |
| `slope` | `6-8` | `proportional-equations`, `coordinate-plane`, `integers-multiply-divide` |
| `function-machines` | `6-8` | `evaluate-expression`, `coordinate-plane` |
| `slope-intercept` | `9-12` | `slope`, `function-machines`, `two-step-equations` |
| `systems-of-equations` | `9-12` | `equations-both-sides`, `slope-intercept` |
| `inequalities-two-step` | `9-12` | `inequalities-one-step`, `two-step-equations` |
| `linear-models` | `9-12` | `slope-intercept`, `two-step-equations` |
| `absolute-value-equations` | `9-12` | `two-step-equations`, `integers-add-subtract` |
| `multiply-binomials` | `9-12` | `distributive-property`, `combine-like-terms`, `integers-multiply-divide` |
| `factoring-quadratics` | `9-12` | `multiply-binomials` |
| `zero-product` | `9-12` | `factoring-quadratics`, `one-step-equations` |
| `quadratic-by-square-roots` | `9-12` | `square-roots`, `one-step-equations`, `integers-add-subtract` |
| `exponent-rules` | `9-12` | `exponents`, `integers-add-subtract` |
| `exponential-growth` | `9-12` | `exponent-rules`, `linear-models` |
| `function-notation` | `9-12` | `function-machines`, `exponents`, `integers-multiply-divide` |
| `quadratic-vertex` | `9-12` | `function-notation`, `quadratic-by-square-roots` |
| `shape-sides` | `K` | `count-to-10` |
| `solid-faces` | `1-2` | `shape-sides`, `add-within-20` |
| `measure-length` | `1-2` | `subtract-within-20`, `add-within-20` |
| `perimeter` | `3-5` | `add-two-digit`, `shape-sides` |
| `area-rectangles` | `3-5` | `times-tables`, `perimeter` |
| `angles-on-a-line` | `3-5` | `add-subtract-within-1000`, `shape-sides` |
| `volume-boxes` | `3-5` | `area-rectangles`, `multiply-multi-digit` |
| `area-triangles` | `6-8` | `area-rectangles`, `divide-equal-groups` |
| `angles-in-polygons` | `6-8` | `angles-on-a-line`, `multiply-multi-digit` |
| `circles` | `6-8` | `area-rectangles`, `decimals-multiply-divide`, `exponents` |
| `pythagorean-theorem` | `6-8` | `square-roots`, `area-rectangles`, `evaluate-expression` |
| `similar-triangles` | `9-12` | `proportional-equations`, `pythagorean-theorem` |
| `circle-arcs` | `9-12` | `circles`, `fraction-of-a-set`, `angles-in-polygons` |
| `special-right-triangles` | `9-12` | `pythagorean-theorem`, `square-roots` |
| `trig-ratios` | `9-12` | `pythagorean-theorem`, `fractions-equivalent` |
| `radians-and-degrees` | `9-12` | `trig-ratios`, `circle-arcs` |
| `circle-equation` | `9-12` | `circles`, `quadratic-by-square-roots`, `coordinate-plane` |
| `midpoint-distance` | `9-12` | `coordinate-plane`, `pythagorean-theorem` |
| `scaling-areas` | `competition` | `similar-triangles` |
| `circle-angles` | `competition` | `circle-arcs`, `angles-in-polygons` |
| `triangle-inequality` | `competition` | `angles-in-polygons`, `absolute-value-equations`, `pythagorean-theorem` |
| `polygon-diagonals` | `competition` | `angles-in-polygons`, `shape-sides` |
| `picture-graph` | `K` | `compare-numbers`, `subtract-within-10` |
| `bar-graph` | `1-2` | `picture-graph`, `add-within-20`, `subtract-within-20` |
| `mean-fair-share` | `3-5` | `bar-graph`, `divide-equal-groups`, `add-two-digit` |
| `outfit-counting` | `3-5` | `times-tables` |
| `mean-median-mode` | `6-8` | `mean-fair-share`, `compare-two-digit` |
| `probability-simple` | `6-8` | `fraction-of-a-set`, `fractions-equivalent` |
| `overlapping-groups` | `6-8` | `subtract-two-digit`, `probability-simple` |
| `counting-arrangements` | `9-12` | `outfit-counting`, `multiply-multi-digit`, `divide-equal-groups` |
| `probability-compound` | `9-12` | `probability-simple`, `fractions-multiply` |
| `mean-with-new-value` | `9-12` | `mean-median-mode`, `one-step-equations` |
| `line-of-fit` | `9-12` | `linear-models`, `mean-median-mode` |
| `inclusion-exclusion` | `competition` | `overlapping-groups`, `gcd-lcm` |
| `arrangements-with-repeats` | `competition` | `counting-arrangements` |
| `complement-probability` | `competition` | `probability-compound`, `counting-arrangements` |
| `pigeonhole` | `competition` | `outfit-counting`, `overlapping-groups` |
| `count-factors` | `competition` | `divide-with-remainders`, `exponents` |
| `prime-factors` | `competition` | `count-factors` |
| `gcd-lcm` | `competition` | `prime-factors` |
| `remainders-and-last-digits` | `competition` | `exponents`, `divide-with-remainders`, `prime-factors` |
| `arithmetic-sequences` | `competition` | `linear-models`, `multiply-multi-digit` |
| `sum-and-product-of-roots` | `competition` | `factoring-quadratics`, `zero-product` |
| `difference-of-squares` | `competition` | `multiply-binomials`, `exponents` |
| `work-and-rates` | `competition` | `unit-rate`, `fractions-add-different-bottom`, `proportional-equations` |

## How to add a node

1. Pick the band. Open the node file for it, or start `nodes-<strand>.ts` for a new strand.
2. Add `mathsNode({ id, band, name, needs, item })`. `item(i)` returns `[problem, answer, hint]` from the index alone, no random
   numbers and no clock, so the same index is the same item. Make the first five indexes five different problems, and keep the
   hint to a nudge: no number or word in it may be the answer. Name every node it rests on in `needs` (no cycle, nothing from a
   later band).
3. For a new file, export its list and add it to `MATHS_NODES` in `graph.ts`. A node that prepares for a SAT Math domain passes
   `tags: [HEART_OF_ALGEBRA]` (or the Passport tag) to `mathsNode`.
4. Run `TZ=UTC npx vitest run tests/unit/maths-graph.test.ts`. It names the node and the problem: a cycle or unknown need
   (learn-kit's `GraphError`), fewer than 3 items, no name, a bad solid rule, an item that does not check its own answer or accepts a
   wrong one, a hint that is or says the answer, the same problem twice.
5. Keep the doc true: a node is added to the table above, and a band that gains nodes changes the band table.

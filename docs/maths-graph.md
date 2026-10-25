# The maths graph

What a child can do with numbers, as a graph of small things to learn, "from beginning kindergarten or even preschool all the way up"
for "somebody who knows no Greek", brought up step by step. Each node is one thing to learn (counting to 5, tens and ones, which
fraction is bigger), each node says which nodes it rests on, and the graph is validated over `@learn-kit/graph`
(`learn-kit/graph`, pinned by commit in `package.json`): a directed acyclic graph, no unknown need, no need of a higher level. It is
data and pure code under `src/learn/maths/`; no screen reads it yet. It is the twin of the spelling graph (`docs/spelling-graph.md`)
and the two share no code, so each can change on its own.

## The files

- `items.ts`: the shapes (`MathsNode`, `MathsItem`, `SolidRule`), the six grade bands, `checkAnswer` (does what the child gave
  match the item's answer), `nodeProblems` (what is wrong with a node) and `mathsNode(...)`, the one way a node file builds a node.
- `nodes-number.ts`: the number nodes for `preK` to `3-5`: counting, place value, fractions, ratios. Later strands (operations,
  algebra, geometry, data) are their own `nodes-<strand>.ts` and need these nodes by id.
- `nodes-operations.ts`: the operations nodes for `K` to `6-8`: adding, taking away, multiplying and dividing, in whole numbers, then
  fractions, decimals and negative numbers, up to exponents and percent. They rest on the number nodes.
- `nodes-algebra.ts`: the algebra nodes for `6-8` and `9-12`: expressions, equations, inequalities, rates and lines, systems,
  quadratics, powers and functions. They rest on the operations nodes, and cite the SAT Math domains (below).
- `format.ts`: how the operations and algebra nodes write a number into a problem (`−3`, `x − 4`, `2³`) and an answer (`-3`, `3/4`).
- `graph.ts`: assembles the node files into `MATHS_NODES`, checks every node with `nodeProblems`, and validates the whole with
  learn-kit's `validate` into `mathsGraph`. A node that breaks a rule stops the module from loading, so a test fails by name.
- `index.ts`: the barrel; import from `src/learn/maths`.

## The grade bands

Six, youngest first. A band's place in the list is the learn-kit `level` of its nodes (0 to 5), so a node can never need a node of
a later band.

| Band | Level | Holds |
| --- | --- | --- |
| `preK` | 0 | counting up to 10, which group has more |
| `K` | 1 | counting to 20, one more and one less, comparing, ten and some more, fair shares; adding and taking away to 10 |
| `1-2` | 2 | tens and ones, hundreds, skipping in jumps, halves and quarters; adding and taking away to 20, 100 and 1000 |
| `3-5` | 3 | bigger place value, rounding, fractions, tenths, ratios; multiplying and dividing, big numbers, decimals and fractions |
| `6-8` | 4 | fractions, decimals and negative numbers in the four operations, exponents, percent; expressions, equations, rates, slope, functions (mw-79en7t.55) |
| `9-12` | 5 | lines, systems, inequalities and models; quadratics, powers, growth and function notation (mw-79en7t.55) |

## The node shape

A `MathsNode` is a learn-kit `GraphNode` plus what maths adds to it:

| Field | What it is |
| --- | --- |
| `id` | Kebab-case, unique (`count-to-10`, `fractions-compare`). |
| `band` | One of the six grade bands. `level` is the band's, set for you. |
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
- `sat:problem-solving-and-data-analysis` (`PROBLEM_SOLVING_AND_DATA_ANALYSIS` in `nodes-operations.ts`): rates and percent, the
  part of the SAT's Problem Solving and Data Analysis that the operations reach. The data strand is a later node file.

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

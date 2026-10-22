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
- `graph.ts`: assembles the node files into `MATHS_NODES`, checks every node with `nodeProblems`, and validates the whole with
  learn-kit's `validate` into `mathsGraph`. A node that breaks a rule stops the module from loading, so a test fails by name.
- `index.ts`: the barrel; import from `src/learn/maths`.

## The grade bands

Six, youngest first. A band's place in the list is the learn-kit `level` of its nodes (0 to 5), so a node can never need a node of
a later band.

| Band | Level | Holds |
| --- | --- | --- |
| `preK` | 0 | counting up to 10, which group has more (this story) |
| `K` | 1 | counting to 20, one more and one less, comparing, ten and some more, fair shares (this story) |
| `1-2` | 2 | tens and ones, hundreds, skipping in jumps, halves and quarters (this story) |
| `3-5` | 3 | bigger place value, rounding, fractions, tenths, ratios (this story) |
| `6-8` | 4 | later node files |
| `9-12` | 5 | later node files |

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

## How to add a node

1. Pick the band. Open the node file for it, or start `nodes-<strand>.ts` for a new strand.
2. Add `mathsNode({ id, band, name, needs, item })`. `item(i)` returns `[problem, answer, hint]` from the index alone, no random
   numbers and no clock, so the same index is the same item. Make the first five indexes five different problems, and keep the
   hint to a nudge: no number or word in it may be the answer. Name every node it rests on in `needs` (no cycle, nothing from a
   later band).
3. For a new file, export its list and add it to `MATHS_NODES` in `graph.ts`.
4. Run `TZ=UTC npx vitest run tests/unit/maths-graph.test.ts`. It names the node and the problem: a cycle or unknown need
   (learn-kit's `GraphError`), fewer than 3 items, no name, a bad solid rule, an item that does not check its own answer or accepts a
   wrong one, a hint that is or says the answer, the same problem twice.
5. Keep the doc true: a node is added to the table above, and a band that gains nodes changes the band table.

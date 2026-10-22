# The spelling graph

What a child can spell, as a graph of small things to learn, "from beginning kindergarten or even preschool all the way up".
Each node is one thing to learn (a letter sound, short a, `sh`, `a_e`), each node says which nodes it rests on, and the graph is
validated over `@learn-kit/graph` (`learn-kit/graph`, pinned by commit in `package.json`): a directed acyclic graph, no unknown
need, no need of a higher level. It is data and pure code under `src/learn/spelling/`; no screen reads it yet.

## The files

- `items.ts`: the shapes (`SpellingNode`, `SpellingItem`, `SolidRule`), the six grade bands, `nodeProblems` (what is wrong with a
  node) and `spellingNode(...)`, the one way a node file builds a node.
- `nodes-phonics.ts`: the phonics nodes for `preK`, `K` and `1-2`: letter sounds, short vowels, doubled letters, digraphs,
  blends, long vowels. Words and patterns come from the early entries of `src/core/phonics/patterns.ts` (`patternIds` names them).
- `graph.ts`: assembles the node files into `SPELLING_NODES`, checks every node with `nodeProblems`, and validates the whole with
  learn-kit's `validate` into `spellingGraph`. A node that breaks a rule stops the module from loading, so a test fails by name.
- `index.ts`: the barrel; import from `src/learn/spelling`.

## The grade bands

Six, youngest first. A band's place in the list is the learn-kit `level` of its nodes (0 to 5), so a node can never need a node of
a later band.

| Band | Level | Holds |
| --- | --- | --- |
| `preK` | 0 | letter sounds (this story) |
| `K` | 1 | short vowels, doubled letters at the end (this story) |
| `1-2` | 2 | digraphs, blends, long vowels (this story) |
| `3-5` | 3 | later node files |
| `6-8` | 4 | later node files |
| `9-12` | 5 | later node files |

## The node shape

A `SpellingNode` is a learn-kit `GraphNode` plus what spelling adds:

| Field | What it is |
| --- | --- |
| `id` | Kebab-case, unique (`short-vowel-a`, `digraph-sh`). |
| `band` | One of the six grade bands. `level` is the band's, set for you. |
| `needs` | The ids of the nodes it rests on directly. Only `preK` nodes may need nothing. |
| `solid` | The rule for being solid: `{ right, of }`, `right` of the child's last `of` tries right (3 of 4 in `preK`, 4 of 5 above). |
| `items` | At least 3 (`MIN_ITEMS`). Each is a `word`, the `pattern` it shows and a `distractor`. |
| `name` | One line the child reads, in words a child of the band knows ("Short a, like cat"). |
| `patternIds` | The `patterns.ts` entries the node is built from (none for letter sounds). |

An item holds three things:

- `word`: the word, lower case.
- `pattern`: the grapheme the word shows (`sh`, `a`, `ck`), or `a_e` for the letter, any consonant, then `e` (`cake`).
- `distractor`: a wrong choice to put beside the word, a plausible misspelling or, for a letter sound, a word that begins
  otherwise. It must not show the pattern: that is what makes it wrong. A test holds all of this.

## How to add a node

1. Pick the band. Open the node file for it, or start `nodes-<strand>.ts` for a new strand (spelling rules, endings, word parts).
2. Add `spellingNode({ id, band, name, needs, patternIds, items })`. List at least 3 `[word, pattern, distractor]` items; take
   words from the `patterns.ts` entry's `examples` where there is one. Name every node it rests on in `needs` (no cycle, nothing
   from a later band).
3. For a new file, export its list and add it to `SPELLING_NODES` in `graph.ts`.
4. Run `TZ=UTC npx vitest run tests/unit/spelling-graph.test.ts`. It names the node and the problem: a cycle or unknown need
   (learn-kit's `GraphError`), fewer than 3 items, no name, a bad solid rule, a distractor that shows the pattern.
5. Keep the doc true: a new strand or band that gains nodes changes the table above.

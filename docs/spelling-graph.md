# The spelling graph

What a child can spell, as a graph of small things to learn, "from beginning kindergarten or even preschool all the way up".
Each node is one thing to learn (a letter sound, short a, `sh`, `a_e`), each node says which nodes it rests on, and the graph is
validated over `@learn-kit/graph` (`learn-kit/graph`, pinned by commit in `package.json`): a directed acyclic graph, no unknown
need, no need of a higher level. It is data and pure code under `src/learn/spelling/`; no screen reads it yet.

<!-- toc -->

- [The files](#the-files)
- [The grade bands](#the-grade-bands)
- [The node shape](#the-node-shape)
- [The strategy nodes](#the-strategy-nodes)
  - [The sweep of memory-aid kinds](#the-sweep-of-memory-aid-kinds)
- [The placement](#the-placement)
- [Proving on a word he has not met (Kestrel 20a)](#proving-on-a-word-he-has-not-met-kestrel-20a)
- [Fresh words for a pattern he has all seen (Kestrel 20b)](#fresh-words-for-a-pattern-he-has-all-seen-kestrel-20b)
- [How to add a node](#how-to-add-a-node)

<!-- /toc -->

## The files

- `items.ts`: the shapes (`SpellingNode`, `SpellingItem`, `SolidRule`), the six grade bands, `nodeProblems` (what is wrong with a
  node) and `spellingNode(...)`, the one way a node file builds a node.
- `nodes-phonics.ts`: the phonics nodes for `preK`, `K` and `1-2`: letter sounds, short vowels, doubled letters, digraphs,
  blends, long vowels. Words and patterns come from the early entries of `src/core/phonics/patterns.ts` (`patternIds` names them).
- `nodes-patterns.ts`: the pattern nodes for `1-2` and `3-5`: short vowels in context (`ck`, `ng`, `tch`, `dge`), the rest of silent e,
  vowel teams, r-controlled vowels, silent letters, doubled letters and the doubling and dropping rules, plurals, suffixes, prefixes,
  the blends the phonics file leaves out and the irregular spellings. Every entry of `patterns.ts` is named by the `patternIds` of
  one node (a test lists any that is not), and each node rests on the phonics nodes it builds on. The doubling, prefix and suffix
  nodes follow `syllabifier.ts` (a doubled consonant sits at a syllable split; a prefix or suffix is a syllable of its own).
- `nodes-strategies.ts`: the strategy nodes for `3-5`, `6-8` and `9-12`: the ways of working a word out that are not rote memory (see
  "The strategy nodes" below), and `MEMORY_AID_STRATEGIES`, the sweep of every kind of memory aid with the node it became.
- `place-words.ts`: puts the words of a word list on the graph (mw-79en7t.16). `requestNodes()` is the `nodes` of a word-list request (every
  node but the strategy nodes: its id, name and the patterns its words show); `placeWords(claims)` takes the node the factory's answer
  named for each word if the graph has it, else `matchPattern` (the node that holds the word, else the longest pattern the word shows),
  and keeps the reason. A photo import stores the result on the word (`nodeId`, `nodeReason`); the Spelling flow's `focus` takes those
  nodes first (stage `list`) until they are solid.
- `graph.ts`: assembles the node files into `SPELLING_NODES` (youngest band first), checks every node with `nodeProblems`, and validates the whole with
  learn-kit's `validate` into `spellingGraph`. A node that breaks a rule stops the module from loading, so a test fails by name.
- `index.ts`: the barrel; import from `src/learn/spelling`.

## The grade bands

Six, youngest first. A band's place in the list is the learn-kit `level` of its nodes (0 to 5), so a node can never need a node of
a later band.

| Band | Level | Holds |
| --- | --- | --- |
| `preK` | 0 | letter sounds (this story) |
| `K` | 1 | short vowels, doubled letters at the end (this story) |
| `1-2` | 2 | digraphs, blends, long vowels, and the common patterns: vowel teams, r-controlled vowels, plurals, `-ing` and `-ed` |
| `3-5` | 3 | rarer patterns, the doubling and dropping rules, suffixes and prefixes (`nodes-patterns.ts`) |
| `6-8` | 4 | the strategy nodes of the second step: long words, affixes at the join, Latin roots, relatives, phrases, odd shapes (`nodes-strategies.ts`) |
| `9-12` | 5 | the strategy nodes of the third step: very long words, assimilated prefixes, Greek and Latin roots, derived words, hard words (`nodes-strategies.ts`) |

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
| `strategy` | Only on a strategy node: one of `STRATEGY_KINDS` (`syllables`, `roots-affixes`, `analogy`, `mnemonic`, `visual-check`); the node is also tagged `strategy`. |

An item holds three things:

- `word`: the word, lower case.
- `pattern`: the grapheme the word shows (`sh`, `a`, `ck`), or `a_e` for the letter, any consonant, then `e` (`cake`).
- `distractor`: a wrong choice to put beside the word, a plausible misspelling or, for a letter sound, a word that begins
  otherwise. It must not show the pattern: that is what makes it wrong. A test holds all of this.

## The strategy nodes

"The teacher is trying to show him like spelling strategies and not just ... rote memory", so the strategies are nodes of the graph, in
`nodes-strategies.ts`, from `3-5` up. There are five, each in three steps (one node a band, `3-5`, `6-8`, `9-12`; the later node needs
the earlier of its strategy, so a child is not given the harder way before the easier):

| Strategy | `3-5` | `6-8` | `9-12` |
| --- | --- | --- | --- |
| `syllables`: clap the parts and write every part | `strategy-syllables-clap` | `strategy-syllables-long` | `strategy-syllables-academic` |
| `roots-affixes`: the word parts | `strategy-words-inside` | `strategy-affix-joins`, `strategy-roots-latin` | `strategy-affix-assimilation`, `strategy-roots-greek-latin` |
| `analogy`: spell it like a word you know | `strategy-analogy-rhyme` | `strategy-analogy-related` | `strategy-analogy-derived` |
| `mnemonic`: a trick to remember it | `strategy-mnemonic-tricks` | `strategy-mnemonic-phrases` | `strategy-mnemonic-hard-words` |
| `visual-check`: look at the tricky part, cover, write, check | `strategy-visual-check` | `strategy-visual-odd-shapes` | `strategy-visual-rare` |

A strategy node's items are as any node's: the `pattern` is the part the strategy catches (the syllable people drop, the doubled
letter at a prefix join, the root) and the `distractor` is the misspelling the strategy prevents. Each rests on pattern nodes it uses
(a prefix node for the word parts, `vowel-team-igh` for analogy) and, from `6-8`, on its strategy a band lower.

### The sweep of memory-aid kinds

Every kind of aid in `src/core/memory-aids` and the node that teaches the same thing (`MEMORY_AID_STRATEGIES` in
`nodes-strategies.ts`; a test reads the aids' source and fails for a type or trick label not listed here):

| Memory aid | Kind | Strategy node |
| --- | --- | --- |
| `phonetic-aid.ts`, "Sound It Out" | aid type `phonetic` | `strategy-syllables-clap` |
| `pattern-aid.ts`, "Pattern Spotter" | aid type `pattern` | `strategy-analogy-rhyme` |
| `mnemonic-aid.ts`, "Memory Tricks" | aid type `mnemonic`, and its tricks `Story` and `Remember` | `strategy-mnemonic-tricks` |
| `mnemonic-aid.ts` | trick `Words inside` | `strategy-words-inside` |
| `mnemonic-aid.ts` | trick `Clap it out` | `strategy-syllables-clap` |
| `mnemonic-aid.ts` | tricks `Watch out` (double letters), `Silent letter` and `Silent letters` | `strategy-visual-check` |
| `tricky-part.ts`, the spotlight on the chunk most likely to be misspelled | `findTrickyPart` | `strategy-visual-check` |

The `3-5` items of `strategy-syllables-clap`, `strategy-words-inside`, `strategy-mnemonic-tricks` and `strategy-visual-check` are words
the matching aid really gives that help for (a test asks the aid), so the node and the aid teach the same words.

## The placement

The placement is learn-kit's (`learn-kit/drill`, pinned with the graph): `startPlacement(spellingGraph, [])`, then `placementItem` with an
item maker over a node's `items` (the word beside its distractor) and `answerPlacement` for each answer. It bisects over the levels
(the bands), then confirms what lies below the ceiling it found, so it marks passed nodes tested out and finds the gap.
`tests/unit/spelling-placement.test.ts` sits it with a scripted 8th grader who misses the vowel-team and suffix nodes: they and what
rests on them are the gap, and the learner starts there. A strategy node rests on pattern nodes, so it stays untested until the
patterns it uses are passed.

## Proving on a word he has not met (Kestrel 20a)

A right answer on a word he has been asked before may only be remembering it, so the Spelling world proves a pattern on words it has not asked
(`learn-kit/fresh`, pinned with the graph). The rule lives in three places:

- `src/learn/fresh-store.ts`: the child's seen ledger over localStorage (`sf-spelling-fresh:<profile id>`): the words asked under each node
  (the word is the key, `wordKey`; the newest 30) and the nodes marked to confirm. `storageStockStore` is the stock's store and `spellingStock` makes the stock (story 20b, below).
  `missedLast(state)` reads a node's review row for the kit's `missedBefore`: the last answer was a miss, not made good since.
- `src/learn/spelling/items.ts`: `pickWords(node, { count, seed, avoid })`, the maker. A node's unseen words come first, from the place the
  seed picks, then its seen words as before; with nothing seen it picks what it always did.
- `src/worlds/spelling/spelling-flow.ts` (`answerDrill`): every word asked is noted (a placement word too). A round goes word by word through
  `recordAnswer`. A right on a seen word after a miss is `to-confirm` (the node is marked, nothing moves on); on a node never missed it is
  `seen` (nothing counts). Only a fresh word's right is a try that counts toward the node's `solid` rule, and the node goes solid only on a
  round whose verdict is `known`. A round with a miss returns the node to its due reviews as before. A solid node whose review comes due
  and is answered on words he has seen still moves its review on (otherwise it would be asked for ever). Coins are paid as before: any
  right answer.

The games say how many words were right, not which. The rights go to the seen words first, so the count of fresh rights is the fewest it
can be (exact for a round all right or all wrong).

**A pattern whose words are all seen** (a node has 3 to 8 words) still serves its words, so a child never waits, and is **not marked solid**
on them: its words cannot be fresh again until the factory writes new ones. That is the spelling-items grind (next section).

## Fresh words for a pattern he has all seen (Kestrel 20b)

The spelling-items grind (`grinds/spelling-items.json`, Sonnet, effort medium) writes new words for a pattern whose words the child has all
met. It is asked ahead, in the background, so the drill never waits (`learn-kit/fresh`'s stock; vault sheet learning-best-practices/02).

- **The request** (`grinds/spelling-items.request.schema.json`): the node's id, its name and its rule in words (the hints of its phonics
  patterns, else its name), up to 6 of its own words as examples, the seen words (the newest 40 of his ledger and the words already kept), the
  count (6 at most) and the node's grade band as the child's age band.
- **The answer** (`grinds/spelling-items.answer.schema.json`): `words`, each a `word` and one plain `sentence` that uses it. Never the answer
  (VISION.md): the sentence carries no spelling hint, and the app drops a word whose sentence does not use it or names letters or spelling.
- **The check** (`checkFreshWords`, `src/grist/spelling-items.ts`), run on every word before it is kept: one plain word of lower-case letters;
  not a seen word, not a word of the node and not a duplicate; and `placeWords` (`src/learn/spelling/place-words.ts`) places it on this node. A
  word it places on another node (`rain` for short a, `plan` for a blend) is dropped. A lone letter (short a) cannot be placed by place-words
  at all, so a word placed on no node that shows the letter is kept. A word that fails any rule is dropped, never repaired.
- **The stock** (`spellingStock`, `src/learn/fresh-store.ts`): `createStock` with cap 6 and low water 2 (PROVISIONAL), kept per node in
  `storageStockStore` (`sf-spelling-stock:<profile id>`), served oldest first and once, never a word in the ledger.
- **The ask** (`createSpellingAsk`): resolves to none, and sends nothing, when the node still has 2 or more unseen words (`UNSEEN_FLOOR`),
  offline, with no licence (the gate in `src/shell/licence-gate.ts`), with no device key, or when the node was already asked in this sitting;
  a failed or late grist (120 s) or an answer that is not words also resolves to none. The stock stays as it was.
- **The triggers** (`spelling-flow.ts`, never awaited, one ask in flight for the whole stock): `opened` when the world opens on a node's turn,
  `served` when a stocked word is taken, `rightAfterMiss` when a round on words he has seen lands as `to-confirm`. The ask's own gate means
  only a node with under 2 unseen words ever reaches the mill.
- **The round**: `stockThenMaker(stock, the node's unseen words, then its words)`: the stock's words first, then the unseen built words, then the
  seen ones. The stock is asked for a word only when it holds one.
- **Waiting**: a node whose words are all seen, with nothing in its stock, has `waiting` set on its turn and the world says "New words are on
  their way" beside the drill (wording PROVISIONAL). It carries on with the words he has, and the node is not solid until a fresh word is right.

**What the ask-ahead costs and saves.** One grist for a node at most per sitting (a page load), and only for a node he has all but met, so
a sitting costs as many grists as it has nodes in that state, in practice 0 to 3; each asks for 6 words, enough for two rounds. It saves the
wait he would meet at Prove it: without it a pattern whose words are all seen can never go solid, and a drill that waited on the mill would stall.
Offline or unlicensed it costs nothing and he plays the words he has.

## How to add a node

1. Pick the band. Open the node file for it, or start `nodes-<strand>.ts` for a new strand (spelling rules, endings, word parts). A new
   way of working a word out is a strategy node: give it a `strategy` (a new kind goes in `STRATEGY_KINDS` and the table above).
2. Add `spellingNode({ id, band, name, needs, patternIds, items })`. List at least 3 `[word, pattern, distractor]` items; take
   words from the `patterns.ts` entry's `examples` where there is one. Name every node it rests on in `needs` (no cycle, nothing
   from a later band).
3. For a new file, export its list and add it to `SPELLING_NODES` in `graph.ts`.
4. Run `TZ=UTC npx vitest run tests/unit/spelling-graph.test.ts`. It names the node and the problem: a cycle or unknown need
   (learn-kit's `GraphError`), fewer than 3 items, no name, a bad solid rule, a distractor that shows the pattern.
5. Keep the doc true: a new strand or band that gains nodes changes the table above.

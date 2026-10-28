# The grinds

A grind is one kind of ask to the factory's mill, declared as data in `grinds/`: `<kind>.json` (model, effort, instructions, answer schema,
attachments), a request schema, an answer schema, instructions, and worked examples in `grinds/examples/<kind>/`. The app's callers sit in
`src/grist/` (the door, in-flight reading, limits) and in the module that owns the ask. A change to a grind's behaviour updates its examples in
the same story (CLAUDE.md, "Grind examples"). The vault sheet is pwa-best-practices/30.

| Grind | What it asks | App side |
| --- | --- | --- |
| `tutor-turn`, `tutor-talk` | the tutor's reply to a child's turn or message | `src/grist/in-flight.ts`, `src/features/tutor`, `src/features/front-door` |
| `parent-ask` | a grown-up's question about the child's sessions | `src/grist/parent-ask.ts` |
| `word-list` | the words of a photographed list, each placed on the spelling graph | `src/grist/word-list-answer.ts`, `src/learn/spelling/place-words.ts` |
| `mnemonic-picture` | one SVG for a spelling or maths node, once | `src/learn/mnemonic-pictures.ts` |
| `maker-request` | a request to the makers | `src/features/requests` |
| `spelling-items` | fresh words for a spelling pattern whose words he has all seen | `src/grist/spelling-items.ts`, `src/learn/fresh-store.ts` |

## spelling-items (Kestrel 20b)

Sonnet, effort medium, no attachments. The request names the node, its pattern and rule in words, up to 6 example words of the node, the words
he has seen (the newest 40), how many to write (6 at most) and his age band; the answer is `words`, each a `word` and one plain `sentence` that
uses it. The instructions forbid the seen words and the examples, and any spelling hint in the sentence (never the answer: VISION.md).

The app does not believe the answer. `checkFreshWords` drops a word that place-words does not place on the node, a seen word, a word of the node,
a duplicate, and a word whose sentence does not use it or hints at its spelling. The words that pass are kept per node in learn-kit/fresh's stock
(cap 6, low water 2, PROVISIONAL) and served before the built list. They are asked ahead, never awaited: when a node's unseen words fall under 2
and the world opens on the node, a stocked word is served, or a right on seen words lands after a miss. Offline, with no licence or on a failed
grist the ask resolves to nothing and the stock stays; one grist for a node at most per sitting. The full rule, the triggers and the cost are in
`docs/spelling-graph.md`, "Fresh words for a pattern he has all seen".

Examples: `avoids-seen` (the dge pattern with six words seen: none written again, a sentence each with no hint) and `short-vowel-a` (a letter-sound
pattern, where place-words cannot place on a lone letter). Run with `mw grist eval spellforge spelling-items --example avoids-seen`. The eval
cases in `grinds/spelling-items.eval/<case>/` (`input.json` is the request, `expected.json` the words that must not appear) are checked against the
request schema by `tests/unit/spelling-items.test.ts`.

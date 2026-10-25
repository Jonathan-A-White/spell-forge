// src/learn/spelling/nodes-strategies.ts — The strategy nodes of the spelling graph for bands 3-5, 6-8 and 9-12: ways of working a word out
// that are not rote memory: clap the syllables, find the word parts (roots and affixes), spell by analogy to a word you know, make a
// mnemonic, and the visual check of the tricky part. Each is drawn from the memory aids of src/core/memory-aids (phonetic-aid, pattern-aid,
// mnemonic-aid, tricky-part) and the syllabifier, and MEMORY_AID_STRATEGIES lists every kind of aid with the node it became. A strategy
// node rests on pattern nodes (nodes-patterns.ts) and, from 6-8 up, on the same strategy a band lower. Items are [word, pattern, distractor]:
// the pattern is the part the strategy catches, and the distractor is the misspelling the strategy prevents. docs/spelling-graph.md says how to add one.

import { spellingNode, type SpellingNode, type StrategyKind } from './items.ts';

// ─── Band 3-5 ──────────────────────────────────────────────────

const strategies35: SpellingNode[] = [
  spellingNode({
    id: 'strategy-syllables-clap',
    band: '3-5',
    strategy: 'syllables',
    name: 'Clap the parts of a long word, then write every part, like fam-i-ly',
    needs: ['prefix-un-re', 'suffix-ing', 'doubling-rule'],
    items: [
      ['family', 'mil', 'famly'],
      ['chocolate', 'col', 'choclate'],
      ['camera', 'er', 'camra'],
      ['different', 'er', 'diffrent'],
      ['interesting', 'er', 'intresting'],
    ],
  }),
  spellingNode({
    id: 'strategy-words-inside',
    band: '3-5',
    strategy: 'roots-affixes',
    name: 'Find the little word inside a big word, like get in together',
    needs: ['prefix-un-re', 'suffix-ed'],
    items: [
      ['together', 'get', 'togather'],
      ['because', 'cause', 'becuz'],
      ['another', 'other', 'anuther'],
      ['grandmother', 'mother', 'grandmuther'],
      ['vegetable', 'get', 'vegtable'],
    ],
  }),
  spellingNode({
    id: 'strategy-analogy-rhyme',
    band: '3-5',
    strategy: 'analogy',
    name: 'Spell it like a word you know, like night and light',
    needs: ['vowel-team-igh', 'irregular-ould', 'suffix-tion-sion'],
    items: [
      ['night', 'igh', 'nite'],
      ['nation', 'tion', 'nashun'],
      ['would', 'ould', 'wud'],
      ['strange', 'ange', 'strainj'],
    ],
  }),
  spellingNode({
    id: 'strategy-mnemonic-tricks',
    band: '3-5',
    strategy: 'mnemonic',
    name: 'Make up a trick to remember it, like a friend to the end',
    needs: ['vowel-team-ie', 'irregular-ough'],
    items: [
      ['friend', 'end', 'freind'],
      ['believe', 'lie', 'beleive'],
      ['piece', 'pie', 'peice'],
      ['island', 'sl', 'iland'],
      ['their', 'heir', 'thier'],
    ],
  }),
  spellingNode({
    id: 'strategy-visual-check',
    band: '3-5',
    strategy: 'visual-check',
    name: 'Look at the tricky part, cover the word, write it, check it',
    needs: ['silent-letter-kn-wr', 'irregular-ough'],
    items: [
      ['pursue', 'ue', 'pursoo'],
      ['laugh', 'augh', 'laff'],
      ['young', 'ou', 'yung'],
      ['heart', 'ear', 'hart'],
      ['thought', 'ough', 'thawt'],
    ],
  }),
];

// ─── Band 6-8 ──────────────────────────────────────────────────

const strategies68: SpellingNode[] = [
  spellingNode({
    id: 'strategy-syllables-long',
    band: '6-8',
    strategy: 'syllables',
    name: 'Say a long word slowly, part by part, and write every sound you say',
    needs: ['strategy-syllables-clap', 'suffix-tion-sion'],
    items: [
      ['environment', 'iron', 'enviroment'],
      ['government', 'ern', 'goverment'],
      ['temperature', 'era', 'temprature'],
      ['library', 'bra', 'libary'],
      ['february', 'bru', 'febuary'],
    ],
  }),
  spellingNode({
    id: 'strategy-affix-joins',
    band: '6-8',
    strategy: 'roots-affixes',
    name: 'Where a prefix meets the word, keep both letters, like mis + spell',
    needs: ['strategy-words-inside', 'prefix-im-in', 'suffix-ness-ment'],
    items: [
      ['misspell', 'ss', 'mispell'],
      ['unnecessary', 'nn', 'unecessary'],
      ['irregular', 'rr', 'iregular'],
      ['immediate', 'mm', 'imediate'],
      ['dissatisfied', 'ss', 'disatisfied'],
    ],
  }),
  spellingNode({
    id: 'strategy-roots-latin',
    band: '6-8',
    strategy: 'roots-affixes',
    name: 'Know the root and you know the spelling, like port in transport',
    needs: ['strategy-affix-joins', 'prefix-sub-super-trans'],
    items: [
      ['transport', 'port', 'transpert'],
      ['inspect', 'spect', 'inspekt'],
      ['predict', 'dict', 'predikt'],
      ['describe', 'scrib', 'deskribe'],
      ['autograph', 'graph', 'autograf'],
      ['telephone', 'phon', 'telefone'],
    ],
  }),
  spellingNode({
    id: 'strategy-analogy-related',
    band: '6-8',
    strategy: 'analogy',
    name: 'Spell it like its relative: hear the g in signal to spell sign',
    needs: ['strategy-analogy-rhyme', 'silent-letter-gn-mb', 'silent-letter-bt-mn'],
    items: [
      ['signal', 'gn', 'sinal'],
      ['bombard', 'mb', 'bonbard'],
      ['muscular', 'scul', 'musular'],
      ['condemnation', 'mn', 'condemation'],
    ],
  }),
  spellingNode({
    id: 'strategy-mnemonic-phrases',
    band: '6-8',
    strategy: 'mnemonic',
    name: 'Turn a hard word into a phrase, like there is a rat in separate',
    needs: ['strategy-mnemonic-tricks'],
    items: [
      ['separate', 'arat', 'seperate'],
      ['definitely', 'finite', 'definately'],
      ['dessert', 'ss', 'desert'],
      ['principal', 'pal', 'principle'],
      ['stationery', 'ery', 'stationary'],
      ['argument', 'gum', 'arguement'],
    ],
  }),
  spellingNode({
    id: 'strategy-visual-odd-shapes',
    band: '6-8',
    strategy: 'visual-check',
    name: 'Picture the odd word: its shape tells you where it is tricky',
    needs: ['strategy-visual-check'],
    items: [
      ['rhythm', 'rhy', 'rithm'],
      ['queue', 'ueue', 'que'],
      ['colonel', 'onel', 'colnel'],
      ['yacht', 'cht', 'yot'],
      ['mischievous', 'iev', 'mischevious'],
    ],
  }),
];

// ─── Band 9-12 ─────────────────────────────────────────────────

const strategies912: SpellingNode[] = [
  spellingNode({
    id: 'strategy-syllables-academic',
    band: '9-12',
    strategy: 'syllables',
    name: 'Split a very long word into parts you can write, then check each part',
    needs: ['strategy-syllables-long', 'suffix-cious-tious'],
    items: [
      ['miscellaneous', 'll', 'miscelaneous'],
      ['pharmaceutical', 'ceu', 'pharmacutical'],
      ['extraordinary', 'raor', 'extrordinary'],
      ['incomprehensible', 'ible', 'incomprehensable'],
      ['responsibility', 'ibil', 'responsability'],
    ],
  }),
  spellingNode({
    id: 'strategy-affix-assimilation',
    band: '9-12',
    strategy: 'roots-affixes',
    name: 'A prefix changes to fit the root, like ad + commodate making accommodate',
    needs: ['strategy-roots-latin', 'prefix-ex-non'],
    items: [
      ['accommodate', 'cc', 'acommodate'],
      ['aggressive', 'gg', 'agressive'],
      ['appropriate', 'pp', 'apropriate'],
      ['collaborate', 'll', 'colaborate'],
      ['occurrence', 'rr', 'occurence'],
    ],
  }),
  spellingNode({
    id: 'strategy-roots-greek-latin',
    band: '9-12',
    strategy: 'roots-affixes',
    name: 'Greek and Latin roots carry the spelling, like synth in photosynthesis',
    needs: ['strategy-roots-latin'],
    items: [
      ['psychology', 'psych', 'sycology'],
      ['photosynthesis', 'synth', 'photosinthesis'],
      ['metamorphosis', 'morph', 'metamorfosis'],
      ['circumference', 'circum', 'cirkumference'],
      ['unanimous', 'anim', 'unanamous'],
      ['bibliography', 'bibli', 'biblography'],
    ],
  }),
  spellingNode({
    id: 'strategy-analogy-derived',
    band: '9-12',
    strategy: 'analogy',
    name: 'Spell it from the word it comes from, like pronounce and pronunciation',
    needs: ['strategy-analogy-related', 'suffix-tion-sion'],
    items: [
      ['pronunciation', 'nun', 'pronounciation'],
      ['maintenance', 'ten', 'maintainance'],
      ['definition', 'ini', 'defenition'],
      ['repetition', 'pet', 'repitition'],
      ['competition', 'pet', 'compitition'],
    ],
  }),
  spellingNode({
    id: 'strategy-mnemonic-hard-words',
    band: '9-12',
    strategy: 'mnemonic',
    name: 'Keep your own trick for the words that always trip you, like science in conscience',
    needs: ['strategy-mnemonic-phrases'],
    items: [
      ['embarrass', 'rr', 'embarass'],
      ['conscience', 'science', 'consience'],
      ['millennium', 'nn', 'milenium'],
      ['privilege', 'ileg', 'priviledge'],
      ['liaison', 'iai', 'liason'],
    ],
  }),
  spellingNode({
    id: 'strategy-visual-rare',
    band: '9-12',
    strategy: 'visual-check',
    name: 'Look for the letters you cannot hear, and check them last',
    needs: ['strategy-visual-odd-shapes'],
    items: [
      ['bureaucracy', 'eau', 'burocracy'],
      ['surveillance', 'eill', 'surveilance'],
      ['pneumonia', 'pn', 'neumonia'],
      ['idiosyncrasy', 'asy', 'idiosyncracy'],
      ['mnemonic', 'mn', 'nemonic'],
    ],
  }),
];

/** Every strategy node, band 3-5 first. */
export const STRATEGY_NODES: readonly SpellingNode[] = [...strategies35, ...strategies68, ...strategies912];

// ─── The sweep of memory-aid kinds ─────────────────────────────

/** One kind of memory aid in src/core/memory-aids and the strategy node it became. */
export interface MemoryAidStrategy {
  /** The aid type (`phonetic`, `pattern`, `mnemonic`) or `tricky-part` (findTrickyPart, which is not an aid of its own). */
  aid: 'phonetic' | 'pattern' | 'mnemonic' | 'tricky-part';
  /** For a mnemonic aid, the label of the trick; none for the aid as a whole. */
  label?: string;
  strategy: StrategyKind;
  /** The 3-5 node that teaches the strategy; the 6-8 and 9-12 nodes of the strategy rest on it. */
  node: string;
}

/**
 * Every kind of memory aid, listed with its strategy node. A test reads the source of src/core/memory-aids and fails for an aid type or trick
 * label that is not in this list, so a new aid has to say what it teaches.
 */
export const MEMORY_AID_STRATEGIES: readonly MemoryAidStrategy[] = [
  { aid: 'phonetic', strategy: 'syllables', node: 'strategy-syllables-clap' }, // "Sound It Out": the word in syllables
  { aid: 'pattern', strategy: 'analogy', node: 'strategy-analogy-rhyme' }, // "Pattern Spotter": a pattern with the words that share it
  { aid: 'mnemonic', strategy: 'mnemonic', node: 'strategy-mnemonic-tricks' }, // "Memory Tricks": the aid as a whole
  { aid: 'mnemonic', label: 'Story', strategy: 'mnemonic', node: 'strategy-mnemonic-tricks' },
  { aid: 'mnemonic', label: 'Remember', strategy: 'mnemonic', node: 'strategy-mnemonic-tricks' },
  { aid: 'mnemonic', label: 'Words inside', strategy: 'roots-affixes', node: 'strategy-words-inside' },
  { aid: 'mnemonic', label: 'Clap it out', strategy: 'syllables', node: 'strategy-syllables-clap' },
  { aid: 'mnemonic', label: 'Watch out', strategy: 'visual-check', node: 'strategy-visual-check' }, // the double letters
  { aid: 'mnemonic', label: 'Silent letter', strategy: 'visual-check', node: 'strategy-visual-check' },
  { aid: 'mnemonic', label: 'Silent letters', strategy: 'visual-check', node: 'strategy-visual-check' },
  { aid: 'tricky-part', strategy: 'visual-check', node: 'strategy-visual-check' }, // the spotlight on the chunk most likely to be misspelled
];

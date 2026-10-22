// src/learn/spelling/nodes-phonics.ts — The phonics nodes of the spelling graph for preK, K and 1-2: letter sounds, short vowels,
// doubled letters, digraphs, blends, long vowels. Words and patterns come from the early entries of src/core/phonics/patterns.ts.
// Each node's items are [word, pattern, distractor]; docs/spelling-graph.md says how to add one.

import { spellingNode, type SpellingNode } from './items.ts';

// ─── preK: letter sounds, in the order a child meets them ───────

const letterSounds: SpellingNode[] = [
  spellingNode({
    id: 'letter-sounds-satp',
    band: 'preK',
    name: 'The sounds s, a, t and p',
    items: [
      ['sun', 's', 'mun'],
      ['at', 'a', 'et'],
      ['tap', 't', 'cap'],
      ['pig', 'p', 'big'],
    ],
  }),
  spellingNode({
    id: 'letter-sounds-inmd',
    band: 'preK',
    name: 'The sounds i, n, m and d',
    needs: ['letter-sounds-satp'],
    items: [
      ['it', 'i', 'at'],
      ['nut', 'n', 'hut'],
      ['mop', 'm', 'top'],
      ['dog', 'd', 'log'],
    ],
  }),
  spellingNode({
    id: 'letter-sounds-gock',
    band: 'preK',
    name: 'The sounds g, o, c and k',
    needs: ['letter-sounds-inmd'],
    items: [
      ['gum', 'g', 'hum'],
      ['on', 'o', 'in'],
      ['cup', 'c', 'pup'],
      ['kit', 'k', 'bit'],
    ],
  }),
  spellingNode({
    id: 'letter-sounds-ubrh',
    band: 'preK',
    name: 'The sounds u, b, r and h',
    needs: ['letter-sounds-gock'],
    items: [
      ['up', 'u', 'op'],
      ['bed', 'b', 'led'],
      ['run', 'r', 'sun'],
      ['hat', 'h', 'cat'],
    ],
  }),
  spellingNode({
    id: 'letter-sounds-felj',
    band: 'preK',
    name: 'The sounds f, e, l and j',
    needs: ['letter-sounds-ubrh'],
    items: [
      ['fan', 'f', 'pan'],
      ['egg', 'e', 'agg'],
      ['leg', 'l', 'beg'],
      ['jam', 'j', 'ham'],
    ],
  }),
  spellingNode({
    id: 'letter-sounds-wvyz',
    band: 'preK',
    name: 'The sounds w, v, y and z',
    needs: ['letter-sounds-felj'],
    items: [
      ['win', 'w', 'bin'],
      ['van', 'v', 'ban'],
      ['yes', 'y', 'ges'],
      ['zip', 'z', 'sip'],
    ],
  }),
  spellingNode({
    id: 'letter-sounds-qx',
    band: 'preK',
    name: 'The sounds q and x',
    needs: ['letter-sounds-wvyz'],
    items: [
      ['queen', 'q', 'kween'],
      ['quit', 'q', 'kwit'],
      ['box', 'x', 'bocs'],
      ['six', 'x', 'sics'],
    ],
  }),
];

// ─── K: short vowels and doubled letters ────────────────────────

const shortVowels: SpellingNode[] = [
  spellingNode({
    id: 'short-vowel-a',
    band: 'K',
    name: 'Short a, like cat',
    needs: ['letter-sounds-satp', 'letter-sounds-inmd'],
    patternIds: ['short-a'],
    items: [
      ['cat', 'a', 'cut'],
      ['hat', 'a', 'hit'],
      ['bat', 'a', 'bet'],
      ['map', 'a', 'mop'],
    ],
  }),
  spellingNode({
    id: 'short-vowel-i',
    band: 'K',
    name: 'Short i, like sit',
    needs: ['short-vowel-a', 'letter-sounds-inmd'],
    patternIds: ['short-i'],
    items: [
      ['sit', 'i', 'sat'],
      ['big', 'i', 'bag'],
      ['pig', 'i', 'peg'],
      ['fin', 'i', 'fan'],
    ],
  }),
  spellingNode({
    id: 'short-vowel-o',
    band: 'K',
    name: 'Short o, like hot',
    needs: ['short-vowel-a', 'letter-sounds-gock'],
    patternIds: ['short-o'],
    items: [
      ['hot', 'o', 'hat'],
      ['pot', 'o', 'pat'],
      ['mop', 'o', 'map'],
      ['job', 'o', 'jab'],
    ],
  }),
  spellingNode({
    id: 'short-vowel-u',
    band: 'K',
    name: 'Short u, like bus',
    needs: ['short-vowel-a', 'letter-sounds-ubrh'],
    patternIds: ['short-u'],
    items: [
      ['bus', 'u', 'bis'],
      ['cup', 'u', 'cap'],
      ['run', 'u', 'ran'],
      ['fun', 'u', 'fan'],
    ],
  }),
  spellingNode({
    id: 'short-vowel-e',
    band: 'K',
    name: 'Short e, like bed',
    needs: ['short-vowel-a', 'letter-sounds-felj'],
    patternIds: ['short-e'],
    items: [
      ['bed', 'e', 'bad'],
      ['red', 'e', 'rad'],
      ['hen', 'e', 'hin'],
      ['pet', 'e', 'pat'],
    ],
  }),
];

const doubledLetters: SpellingNode[] = [
  spellingNode({
    id: 'double-consonant-ll',
    band: 'K',
    name: "Two l's at the end, like bell",
    needs: ['short-vowel-e', 'short-vowel-i'],
    patternIds: ['dc-ll'],
    items: [
      ['ball', 'll', 'bal'],
      ['bell', 'll', 'bel'],
      ['fill', 'll', 'fil'],
      ['pull', 'll', 'pul'],
    ],
  }),
  spellingNode({
    id: 'double-consonant-ss',
    band: 'K',
    name: "Two s's at the end, like miss",
    needs: ['short-vowel-i', 'short-vowel-o'],
    patternIds: ['dc-ss'],
    items: [
      ['miss', 'ss', 'mis'],
      ['boss', 'ss', 'bos'],
      ['dress', 'ss', 'dres'],
      ['kiss', 'ss', 'kis'],
    ],
  }),
  spellingNode({
    id: 'double-consonant-ff',
    band: 'K',
    name: "Two f's at the end, like puff",
    needs: ['short-vowel-u', 'short-vowel-o'],
    patternIds: ['dc-ff'],
    items: [
      ['puff', 'ff', 'puf'],
      ['cuff', 'ff', 'cuf'],
      ['off', 'ff', 'of'],
      ['stuff', 'ff', 'stuf'],
    ],
  }),
];

// ─── 1-2: digraphs, blends, long vowels ─────────────────────────

const digraphs: SpellingNode[] = [
  spellingNode({
    id: 'digraph-sh',
    band: '1-2',
    name: 'sh, like ship',
    needs: ['short-vowel-i', 'short-vowel-o'],
    patternIds: ['cd-sh'],
    items: [
      ['ship', 'sh', 'sip'],
      ['shop', 'sh', 'sop'],
      ['fish', 'sh', 'fis'],
      ['wish', 'sh', 'wis'],
    ],
  }),
  spellingNode({
    id: 'digraph-ch',
    band: '1-2',
    name: 'ch, like chip',
    needs: ['short-vowel-i', 'short-vowel-a'],
    patternIds: ['cd-ch'],
    items: [
      ['chip', 'ch', 'cip'],
      ['chat', 'ch', 'cat'],
      ['rich', 'ch', 'rit'],
      ['much', 'ch', 'mut'],
    ],
  }),
  spellingNode({
    id: 'digraph-th',
    band: '1-2',
    name: 'th, like this and think',
    needs: ['short-vowel-i', 'short-vowel-a'],
    patternIds: ['cd-th-voiced', 'cd-th-unvoiced'],
    items: [
      ['this', 'th', 'dis'],
      ['that', 'th', 'dat'],
      ['think', 'th', 'fink'],
      ['bath', 'th', 'baf'],
    ],
  }),
  spellingNode({
    id: 'digraph-wh',
    band: '1-2',
    name: 'wh, like when',
    needs: ['short-vowel-e', 'short-vowel-i'],
    patternIds: ['cd-wh'],
    items: [
      ['when', 'wh', 'wen'],
      ['what', 'wh', 'wat'],
      ['where', 'wh', 'wer'],
      ['white', 'wh', 'wite'],
    ],
  }),
  spellingNode({
    id: 'digraph-ck',
    band: '1-2',
    name: 'ck, like duck',
    needs: ['short-vowel-a', 'short-vowel-u'],
    patternIds: ['cd-ck'],
    items: [
      ['back', 'ck', 'bak'],
      ['kick', 'ck', 'kik'],
      ['duck', 'ck', 'duk'],
      ['neck', 'ck', 'nek'],
    ],
  }),
  spellingNode({
    id: 'digraph-ng-nk',
    band: '1-2',
    name: 'ng and nk, like ring and pink',
    needs: ['short-vowel-i', 'short-vowel-a'],
    patternIds: ['cd-ng', 'cd-nk'],
    items: [
      ['ring', 'ng', 'rin'],
      ['song', 'ng', 'son'],
      ['pink', 'nk', 'pik'],
      ['bank', 'nk', 'bak'],
    ],
  }),
];

const blends: SpellingNode[] = [
  spellingNode({
    id: 'blend-l',
    band: '1-2',
    name: 'Two sounds together with l, like clap and flip',
    needs: ['short-vowel-a', 'short-vowel-i', 'short-vowel-o'],
    patternIds: ['cb-bl', 'cb-cl', 'cb-fl', 'cb-gl', 'cb-pl', 'cb-sl'],
    items: [
      ['block', 'bl', 'bock'],
      ['clap', 'cl', 'cap'],
      ['flip', 'fl', 'fip'],
      ['glad', 'gl', 'gad'],
      ['plan', 'pl', 'pan'],
      ['slip', 'sl', 'sip'],
    ],
  }),
  spellingNode({
    id: 'blend-r',
    band: '1-2',
    name: 'Two sounds together with r, like frog and trip',
    needs: ['short-vowel-a', 'short-vowel-i', 'short-vowel-o'],
    patternIds: ['cb-br', 'cb-cr', 'cb-dr', 'cb-fr', 'cb-gr', 'cb-pr', 'cb-tr'],
    items: [
      ['bring', 'br', 'bing'],
      ['crab', 'cr', 'cab'],
      ['drop', 'dr', 'dop'],
      ['frog', 'fr', 'fog'],
      ['grass', 'gr', 'gas'],
      ['print', 'pr', 'pint'],
      ['trip', 'tr', 'tip'],
    ],
  }),
  spellingNode({
    id: 'blend-s',
    band: '1-2',
    name: 'Two sounds together with s, like stop and snap',
    needs: ['short-vowel-a', 'short-vowel-i', 'short-vowel-o'],
    patternIds: ['cb-sc', 'cb-sk', 'cb-sm', 'cb-sn', 'cb-sp', 'cb-st', 'cb-sw'],
    items: [
      ['scan', 'sc', 'can'],
      ['skip', 'sk', 'sip'],
      ['smell', 'sm', 'sell'],
      ['snap', 'sn', 'sap'],
      ['spot', 'sp', 'sot'],
      ['stop', 'st', 'sop'],
      ['swim', 'sw', 'sim'],
    ],
  }),
  spellingNode({
    id: 'blend-final-nd-nt-mp',
    band: '1-2',
    name: 'Words that end nd, nt or mp, like hand, went and jump',
    needs: ['short-vowel-a', 'short-vowel-e', 'short-vowel-u'],
    patternIds: ['cb-nd', 'cb-nt', 'cb-mp'],
    items: [
      ['hand', 'nd', 'han'],
      ['sand', 'nd', 'san'],
      ['went', 'nt', 'wen'],
      ['ant', 'nt', 'an'],
      ['jump', 'mp', 'jup'],
      ['lamp', 'mp', 'lap'],
    ],
  }),
  spellingNode({
    id: 'blend-final-ft-lt-ld-lk',
    band: '1-2',
    name: 'Words that end ft, lt, ld or lk, like left, felt, cold and milk',
    needs: ['blend-final-nd-nt-mp'],
    patternIds: ['cb-ft', 'cb-lt', 'cb-ld', 'cb-lk'],
    items: [
      ['left', 'ft', 'lef'],
      ['soft', 'ft', 'sof'],
      ['melt', 'lt', 'met'],
      ['felt', 'lt', 'fet'],
      ['cold', 'ld', 'cod'],
      ['hold', 'ld', 'hod'],
      ['milk', 'lk', 'mik'],
      ['silk', 'lk', 'sik'],
    ],
  }),
];

const longVowels: SpellingNode[] = [
  spellingNode({
    id: 'long-vowel-silent-e-a',
    band: '1-2',
    name: 'a that says its name with an e on the end, like cake',
    needs: ['short-vowel-a'],
    patternIds: ['silent-e-a'],
    items: [
      ['cake', 'a_e', 'cak'],
      ['make', 'a_e', 'mak'],
      ['lake', 'a_e', 'lak'],
      ['game', 'a_e', 'gam'],
    ],
  }),
  spellingNode({
    id: 'long-vowel-silent-e-i',
    band: '1-2',
    name: 'i that says its name with an e on the end, like bike',
    needs: ['short-vowel-i', 'long-vowel-silent-e-a'],
    patternIds: ['silent-e-i'],
    items: [
      ['bike', 'i_e', 'bik'],
      ['kite', 'i_e', 'kit'],
      ['time', 'i_e', 'tim'],
      ['five', 'i_e', 'fiv'],
    ],
  }),
  spellingNode({
    id: 'long-vowel-silent-e-o',
    band: '1-2',
    name: 'o that says its name with an e on the end, like home',
    needs: ['short-vowel-o', 'long-vowel-silent-e-a'],
    patternIds: ['silent-e-o'],
    items: [
      ['home', 'o_e', 'hom'],
      ['bone', 'o_e', 'bon'],
      ['hope', 'o_e', 'hop'],
      ['rope', 'o_e', 'rop'],
    ],
  }),
  spellingNode({
    id: 'long-vowel-silent-e-u',
    band: '1-2',
    name: 'u that says its name with an e on the end, like cute',
    needs: ['short-vowel-u', 'long-vowel-silent-e-a'],
    patternIds: ['silent-e-u'],
    items: [
      ['cute', 'u_e', 'cut'],
      ['mule', 'u_e', 'mul'],
      ['huge', 'u_e', 'hug'],
      ['fuse', 'u_e', 'fus'],
    ],
  }),
  spellingNode({
    id: 'long-vowel-ai-ay',
    band: '1-2',
    name: 'ai and ay, like rain and play',
    needs: ['long-vowel-silent-e-a'],
    patternIds: ['vt-ai', 'vt-ay'],
    items: [
      ['rain', 'ai', 'rane'],
      ['wait', 'ai', 'wate'],
      ['play', 'ay', 'plai'],
      ['day', 'ay', 'dai'],
    ],
  }),
  spellingNode({
    id: 'long-vowel-ee-ea',
    band: '1-2',
    name: 'ee and ea, like tree and meat',
    needs: ['short-vowel-e', 'long-vowel-silent-e-a'],
    patternIds: ['vt-ee', 'vt-ea-long'],
    items: [
      ['tree', 'ee', 'tre'],
      ['free', 'ee', 'fre'],
      ['meat', 'ea', 'meet'],
      ['team', 'ea', 'teem'],
    ],
  }),
  spellingNode({
    id: 'long-vowel-oa-ow',
    band: '1-2',
    name: 'oa and ow, like boat and snow',
    needs: ['short-vowel-o', 'long-vowel-silent-e-o'],
    patternIds: ['vt-oa', 'vt-ow-long'],
    items: [
      ['boat', 'oa', 'bote'],
      ['coat', 'oa', 'cote'],
      ['snow', 'ow', 'sno'],
      ['grow', 'ow', 'gro'],
    ],
  }),
];

/** Every phonics node, youngest first. */
export const PHONICS_NODES: readonly SpellingNode[] = [
  ...letterSounds,
  ...shortVowels,
  ...doubledLetters,
  ...digraphs,
  ...blends,
  ...longVowels,
];

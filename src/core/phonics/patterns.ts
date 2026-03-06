// src/core/phonics/patterns.ts — Pattern database (~150+ rules across all 11 categories)

import type { PatternCategory } from '../../contracts/types.ts';

export interface PatternEntry {
  id: string;
  category: PatternCategory;
  grapheme: string;
  phoneme: string;
  examples: string[];
  hint: string;
}

export const patterns: PatternEntry[] = [
  // ─── Short Vowels (15) ──────────────────────────────────────
  { id: 'short-a', category: 'short-vowel', grapheme: 'a', phoneme: '/æ/', examples: ['cat', 'hat', 'bat', 'map'], hint: 'Short "a" like in "cat".' },
  { id: 'short-e', category: 'short-vowel', grapheme: 'e', phoneme: '/ɛ/', examples: ['bed', 'red', 'hen', 'pet'], hint: 'Short "e" like in "bed".' },
  { id: 'short-i', category: 'short-vowel', grapheme: 'i', phoneme: '/ɪ/', examples: ['sit', 'big', 'pig', 'fin'], hint: 'Short "i" like in "sit".' },
  { id: 'short-o', category: 'short-vowel', grapheme: 'o', phoneme: '/ɒ/', examples: ['hot', 'pot', 'dog', 'log'], hint: 'Short "o" like in "hot".' },
  { id: 'short-u', category: 'short-vowel', grapheme: 'u', phoneme: '/ʌ/', examples: ['bus', 'cup', 'run', 'fun'], hint: 'Short "u" like in "bus".' },
  { id: 'short-a-ck', category: 'short-vowel', grapheme: 'a', phoneme: '/æ/', examples: ['back', 'pack', 'snack', 'track'], hint: 'Short "a" before "ck".' },
  { id: 'short-e-ll', category: 'short-vowel', grapheme: 'e', phoneme: '/ɛ/', examples: ['bell', 'sell', 'tell', 'well'], hint: 'Short "e" before "ll".' },
  { id: 'short-i-ng', category: 'short-vowel', grapheme: 'i', phoneme: '/ɪ/', examples: ['ring', 'sing', 'king', 'thing'], hint: 'Short "i" before "ng".' },
  { id: 'short-o-ck', category: 'short-vowel', grapheme: 'o', phoneme: '/ɒ/', examples: ['rock', 'lock', 'clock', 'sock'], hint: 'Short "o" before "ck".' },
  { id: 'short-u-ff', category: 'short-vowel', grapheme: 'u', phoneme: '/ʌ/', examples: ['buff', 'stuff', 'puff', 'cuff'], hint: 'Short "u" before "ff".' },
  { id: 'short-a-nk', category: 'short-vowel', grapheme: 'a', phoneme: '/æ/', examples: ['bank', 'tank', 'rank', 'blank'], hint: 'Short "a" before "nk".' },
  { id: 'short-i-tch', category: 'short-vowel', grapheme: 'i', phoneme: '/ɪ/', examples: ['ditch', 'pitch', 'switch', 'witch'], hint: 'Short "i" before "tch".' },
  { id: 'short-e-dge', category: 'short-vowel', grapheme: 'e', phoneme: '/ɛ/', examples: ['edge', 'hedge', 'ledge', 'wedge'], hint: 'Short "e" before "dge".' },
  { id: 'short-u-dge', category: 'short-vowel', grapheme: 'u', phoneme: '/ʌ/', examples: ['judge', 'fudge', 'budge', 'nudge'], hint: 'Short "u" before "dge".' },
  { id: 'short-i-dge', category: 'short-vowel', grapheme: 'i', phoneme: '/ɪ/', examples: ['bridge', 'ridge', 'fridge', 'midge'], hint: 'Short "i" before "dge".' },

  // ─── Long Vowel Silent-E (14) ───────────────────────────────
  { id: 'silent-e-a', category: 'long-vowel-silent-e', grapheme: 'a_e', phoneme: '/eɪ/', examples: ['cake', 'make', 'lake', 'bake'], hint: 'Silent "e" makes the "a" say its name.' },
  { id: 'silent-e-i', category: 'long-vowel-silent-e', grapheme: 'i_e', phoneme: '/aɪ/', examples: ['bike', 'kite', 'time', 'five'], hint: 'Silent "e" makes the "i" say its name.' },
  { id: 'silent-e-o', category: 'long-vowel-silent-e', grapheme: 'o_e', phoneme: '/oʊ/', examples: ['home', 'bone', 'hope', 'rope'], hint: 'Silent "e" makes the "o" say its name.' },
  { id: 'silent-e-u', category: 'long-vowel-silent-e', grapheme: 'u_e', phoneme: '/juː/', examples: ['cute', 'mule', 'huge', 'tube'], hint: 'Silent "e" makes the "u" say its name.' },
  { id: 'silent-e-a-ce', category: 'long-vowel-silent-e', grapheme: 'a_e', phoneme: '/eɪ/', examples: ['place', 'space', 'face', 'race'], hint: 'Silent "e" makes the "a" long in "-ace" words.' },
  { id: 'silent-e-a-te', category: 'long-vowel-silent-e', grapheme: 'a_e', phoneme: '/eɪ/', examples: ['late', 'gate', 'fate', 'mate'], hint: 'Silent "e" makes the "a" long in "-ate" words.' },
  { id: 'silent-e-i-ne', category: 'long-vowel-silent-e', grapheme: 'i_e', phoneme: '/aɪ/', examples: ['mine', 'fine', 'line', 'vine'], hint: 'Silent "e" makes the "i" long in "-ine" words.' },
  { id: 'silent-e-o-ne', category: 'long-vowel-silent-e', grapheme: 'o_e', phoneme: '/oʊ/', examples: ['phone', 'cone', 'tone', 'zone'], hint: 'Silent "e" makes the "o" long in "-one" words.' },
  { id: 'silent-e-i-ce', category: 'long-vowel-silent-e', grapheme: 'i_e', phoneme: '/aɪ/', examples: ['nice', 'rice', 'mice', 'dice'], hint: 'Silent "e" makes the "i" long in "-ice" words.' },
  { id: 'silent-e-a-me', category: 'long-vowel-silent-e', grapheme: 'a_e', phoneme: '/eɪ/', examples: ['game', 'name', 'came', 'fame'], hint: 'Silent "e" makes the "a" long in "-ame" words.' },
  { id: 'silent-e-o-ke', category: 'long-vowel-silent-e', grapheme: 'o_e', phoneme: '/oʊ/', examples: ['joke', 'woke', 'broke', 'spoke'], hint: 'Silent "e" makes the "o" long in "-oke" words.' },
  { id: 'silent-e-i-de', category: 'long-vowel-silent-e', grapheme: 'i_e', phoneme: '/aɪ/', examples: ['ride', 'hide', 'side', 'wide'], hint: 'Silent "e" makes the "i" long in "-ide" words.' },
  { id: 'silent-e-a-ke', category: 'long-vowel-silent-e', grapheme: 'a_e', phoneme: '/eɪ/', examples: ['shake', 'flake', 'snake', 'wake'], hint: 'Silent "e" makes the "a" long in "-ake" words.' },
  { id: 'silent-e-u-te', category: 'long-vowel-silent-e', grapheme: 'u_e', phoneme: '/juː/', examples: ['flute', 'brute', 'chute', 'minute'], hint: 'Silent "e" makes the "u" long in "-ute" words.' },

  // ─── Vowel Teams (20) ───────────────────────────────────────
  { id: 'vt-ai', category: 'vowel-team', grapheme: 'ai', phoneme: '/eɪ/', examples: ['rain', 'train', 'wait', 'pain'], hint: 'When "a" and "i" go walking, the first one does the talking.' },
  { id: 'vt-ay', category: 'vowel-team', grapheme: 'ay', phoneme: '/eɪ/', examples: ['play', 'day', 'say', 'stay'], hint: '"ay" says long "a" at the end of a word.' },
  { id: 'vt-ea-long', category: 'vowel-team', grapheme: 'ea', phoneme: '/iː/', examples: ['beat', 'meat', 'read', 'team'], hint: '"ea" often says long "e".' },
  { id: 'vt-ea-short', category: 'vowel-team', grapheme: 'ea', phoneme: '/ɛ/', examples: ['bread', 'head', 'dead', 'spread'], hint: '"ea" can also say short "e".' },
  { id: 'vt-ee', category: 'vowel-team', grapheme: 'ee', phoneme: '/iː/', examples: ['tree', 'free', 'see', 'bee'], hint: '"ee" always says long "e".' },
  { id: 'vt-oa', category: 'vowel-team', grapheme: 'oa', phoneme: '/oʊ/', examples: ['boat', 'coat', 'road', 'goat'], hint: '"oa" says long "o".' },
  { id: 'vt-ow-long', category: 'vowel-team', grapheme: 'ow', phoneme: '/oʊ/', examples: ['snow', 'grow', 'show', 'know'], hint: '"ow" can say long "o".' },
  { id: 'vt-ow-out', category: 'vowel-team', grapheme: 'ow', phoneme: '/aʊ/', examples: ['cow', 'now', 'how', 'brown'], hint: '"ow" can also say "ow!" like "ouch".' },
  { id: 'vt-ou', category: 'vowel-team', grapheme: 'ou', phoneme: '/aʊ/', examples: ['house', 'mouse', 'out', 'loud'], hint: '"ou" says "ow" like "ouch".' },
  { id: 'vt-oo-long', category: 'vowel-team', grapheme: 'oo', phoneme: '/uː/', examples: ['moon', 'food', 'cool', 'pool'], hint: '"oo" says the long "oo" sound.' },
  { id: 'vt-oo-short', category: 'vowel-team', grapheme: 'oo', phoneme: '/ʊ/', examples: ['book', 'cook', 'look', 'good'], hint: '"oo" can also say the short "oo" sound.' },
  { id: 'vt-oi', category: 'vowel-team', grapheme: 'oi', phoneme: '/ɔɪ/', examples: ['coin', 'join', 'boil', 'point'], hint: '"oi" makes the "oy" sound.' },
  { id: 'vt-oy', category: 'vowel-team', grapheme: 'oy', phoneme: '/ɔɪ/', examples: ['boy', 'toy', 'joy', 'enjoy'], hint: '"oy" at the end makes the "oy" sound.' },
  { id: 'vt-igh', category: 'vowel-team', grapheme: 'igh', phoneme: '/aɪ/', examples: ['light', 'night', 'right', 'fight'], hint: '"igh" says long "i" — the "gh" is silent.' },
  { id: 'vt-ie-long', category: 'vowel-team', grapheme: 'ie', phoneme: '/aɪ/', examples: ['pie', 'tie', 'lie', 'die'], hint: '"ie" at the end says long "i".' },
  { id: 'vt-ie-ee', category: 'vowel-team', grapheme: 'ie', phoneme: '/iː/', examples: ['field', 'chief', 'thief', 'belief'], hint: '"ie" can also say long "e".' },
  { id: 'vt-ew', category: 'vowel-team', grapheme: 'ew', phoneme: '/uː/', examples: ['new', 'flew', 'grew', 'blew'], hint: '"ew" says "oo".' },
  { id: 'vt-aw', category: 'vowel-team', grapheme: 'aw', phoneme: '/ɔː/', examples: ['saw', 'draw', 'claw', 'straw'], hint: '"aw" makes the "aw" sound.' },
  { id: 'vt-au', category: 'vowel-team', grapheme: 'au', phoneme: '/ɔː/', examples: ['sauce', 'cause', 'fault', 'haunt'], hint: '"au" makes the "aw" sound.' },
  { id: 'vt-ey', category: 'vowel-team', grapheme: 'ey', phoneme: '/iː/', examples: ['key', 'monkey', 'honey', 'valley'], hint: '"ey" can say long "e".' },

  // ─── R-Controlled Vowels (12) ───────────────────────────────
  { id: 'rc-ar', category: 'r-controlled', grapheme: 'ar', phoneme: '/ɑːr/', examples: ['car', 'star', 'far', 'park'], hint: '"ar" makes the "ar" sound — "r" bosses the vowel.' },
  { id: 'rc-er', category: 'r-controlled', grapheme: 'er', phoneme: '/ɜːr/', examples: ['her', 'fern', 'after', 'water'], hint: '"er" makes the "er" sound.' },
  { id: 'rc-ir', category: 'r-controlled', grapheme: 'ir', phoneme: '/ɜːr/', examples: ['bird', 'girl', 'first', 'stir'], hint: '"ir" sounds the same as "er".' },
  { id: 'rc-ur', category: 'r-controlled', grapheme: 'ur', phoneme: '/ɜːr/', examples: ['burn', 'turn', 'fur', 'hurt'], hint: '"ur" also sounds like "er".' },
  { id: 'rc-or', category: 'r-controlled', grapheme: 'or', phoneme: '/ɔːr/', examples: ['fork', 'corn', 'sport', 'short'], hint: '"or" makes the "or" sound.' },
  { id: 'rc-ore', category: 'r-controlled', grapheme: 'ore', phoneme: '/ɔːr/', examples: ['more', 'store', 'core', 'bore'], hint: '"ore" says "or" with a silent "e".' },
  { id: 'rc-air', category: 'r-controlled', grapheme: 'air', phoneme: '/ɛər/', examples: ['fair', 'hair', 'pair', 'chair'], hint: '"air" makes the "air" sound.' },
  { id: 'rc-ear-eer', category: 'r-controlled', grapheme: 'ear', phoneme: '/ɪər/', examples: ['ear', 'dear', 'near', 'hear'], hint: '"ear" makes the "eer" sound.' },
  { id: 'rc-ear-er', category: 'r-controlled', grapheme: 'ear', phoneme: '/ɜːr/', examples: ['earth', 'learn', 'early', 'search'], hint: '"ear" can also sound like "er".' },
  { id: 'rc-are', category: 'r-controlled', grapheme: 'are', phoneme: '/ɛər/', examples: ['care', 'share', 'stare', 'bare'], hint: '"are" says "air" with a silent "e".' },
  { id: 'rc-ire', category: 'r-controlled', grapheme: 'ire', phoneme: '/aɪər/', examples: ['fire', 'tire', 'wire', 'hire'], hint: '"ire" says "eye-er".' },
  { id: 'rc-ure', category: 'r-controlled', grapheme: 'ure', phoneme: '/jʊər/', examples: ['pure', 'cure', 'sure', 'lure'], hint: '"ure" says "yoor".' },

  // ─── Consonant Digraphs (14) ────────────────────────────────
  { id: 'cd-ch', category: 'consonant-digraph', grapheme: 'ch', phoneme: '/tʃ/', examples: ['chip', 'chat', 'rich', 'much'], hint: '"ch" — two letters, one sound: "ch".' },
  { id: 'cd-sh', category: 'consonant-digraph', grapheme: 'sh', phoneme: '/ʃ/', examples: ['ship', 'shop', 'fish', 'wish'], hint: '"sh" — two letters, one sound: "sh".' },
  { id: 'cd-th-voiced', category: 'consonant-digraph', grapheme: 'th', phoneme: '/ð/', examples: ['this', 'that', 'them', 'the'], hint: '"th" with a buzz (voiced).' },
  { id: 'cd-th-unvoiced', category: 'consonant-digraph', grapheme: 'th', phoneme: '/θ/', examples: ['think', 'three', 'bath', 'math'], hint: '"th" without a buzz (unvoiced).' },
  { id: 'cd-wh', category: 'consonant-digraph', grapheme: 'wh', phoneme: '/w/', examples: ['when', 'what', 'where', 'white'], hint: '"wh" usually sounds like "w".' },
  { id: 'cd-ph', category: 'consonant-digraph', grapheme: 'ph', phoneme: '/f/', examples: ['phone', 'photo', 'graph', 'phase'], hint: '"ph" sounds like "f".' },
  { id: 'cd-ck', category: 'consonant-digraph', grapheme: 'ck', phoneme: '/k/', examples: ['back', 'kick', 'duck', 'neck'], hint: '"ck" comes after a short vowel and says "k".' },
  { id: 'cd-ng', category: 'consonant-digraph', grapheme: 'ng', phoneme: '/ŋ/', examples: ['ring', 'song', 'long', 'hang'], hint: '"ng" makes a nasal sound at the end.' },
  { id: 'cd-nk', category: 'consonant-digraph', grapheme: 'nk', phoneme: '/ŋk/', examples: ['think', 'bank', 'pink', 'drink'], hint: '"nk" makes the "ngk" sound.' },
  { id: 'cd-tch', category: 'consonant-digraph', grapheme: 'tch', phoneme: '/tʃ/', examples: ['match', 'catch', 'watch', 'pitch'], hint: '"tch" says "ch" after a short vowel.' },
  { id: 'cd-dge', category: 'consonant-digraph', grapheme: 'dge', phoneme: '/dʒ/', examples: ['bridge', 'edge', 'badge', 'fudge'], hint: '"dge" says "j" after a short vowel.' },
  { id: 'cd-wr', category: 'consonant-digraph', grapheme: 'wr', phoneme: '/r/', examples: ['write', 'wrong', 'wrap', 'wrist'], hint: '"wr" — the "w" is silent, just say "r".' },
  { id: 'cd-gh-f', category: 'consonant-digraph', grapheme: 'gh', phoneme: '/f/', examples: ['laugh', 'cough', 'tough', 'enough'], hint: '"gh" sometimes sounds like "f".' },
  { id: 'cd-kn', category: 'consonant-digraph', grapheme: 'kn', phoneme: '/n/', examples: ['knight', 'know', 'knee', 'knife'], hint: '"kn" — the "k" is silent, just say "n".' },

  // ─── Consonant Blends (18) ──────────────────────────────────
  { id: 'cb-bl', category: 'consonant-blend', grapheme: 'bl', phoneme: '/bl/', examples: ['black', 'blue', 'blend', 'block'], hint: 'Blend both sounds: "b" + "l".' },
  { id: 'cb-br', category: 'consonant-blend', grapheme: 'br', phoneme: '/br/', examples: ['bridge', 'brown', 'break', 'bring'], hint: 'Blend both sounds: "b" + "r".' },
  { id: 'cb-cl', category: 'consonant-blend', grapheme: 'cl', phoneme: '/kl/', examples: ['clap', 'class', 'clean', 'clock'], hint: 'Blend both sounds: "c" + "l".' },
  { id: 'cb-cr', category: 'consonant-blend', grapheme: 'cr', phoneme: '/kr/', examples: ['cry', 'crab', 'cross', 'cream'], hint: 'Blend both sounds: "c" + "r".' },
  { id: 'cb-dr', category: 'consonant-blend', grapheme: 'dr', phoneme: '/dr/', examples: ['drop', 'draw', 'dream', 'drive'], hint: 'Blend both sounds: "d" + "r".' },
  { id: 'cb-fl', category: 'consonant-blend', grapheme: 'fl', phoneme: '/fl/', examples: ['flag', 'fly', 'flat', 'flow'], hint: 'Blend both sounds: "f" + "l".' },
  { id: 'cb-fr', category: 'consonant-blend', grapheme: 'fr', phoneme: '/fr/', examples: ['frog', 'free', 'from', 'fresh'], hint: 'Blend both sounds: "f" + "r".' },
  { id: 'cb-gl', category: 'consonant-blend', grapheme: 'gl', phoneme: '/ɡl/', examples: ['glad', 'glow', 'glass', 'globe'], hint: 'Blend both sounds: "g" + "l".' },
  { id: 'cb-gr', category: 'consonant-blend', grapheme: 'gr', phoneme: '/ɡr/', examples: ['green', 'grow', 'great', 'grass'], hint: 'Blend both sounds: "g" + "r".' },
  { id: 'cb-pl', category: 'consonant-blend', grapheme: 'pl', phoneme: '/pl/', examples: ['play', 'plan', 'plate', 'plant'], hint: 'Blend both sounds: "p" + "l".' },
  { id: 'cb-pr', category: 'consonant-blend', grapheme: 'pr', phoneme: '/pr/', examples: ['print', 'price', 'prove', 'pretty'], hint: 'Blend both sounds: "p" + "r".' },
  { id: 'cb-sc', category: 'consonant-blend', grapheme: 'sc', phoneme: '/sk/', examples: ['scare', 'score', 'scale', 'scan'], hint: 'Blend both sounds: "s" + "c".' },
  { id: 'cb-sk', category: 'consonant-blend', grapheme: 'sk', phoneme: '/sk/', examples: ['skip', 'skin', 'sky', 'skill'], hint: 'Blend both sounds: "s" + "k".' },
  { id: 'cb-sl', category: 'consonant-blend', grapheme: 'sl', phoneme: '/sl/', examples: ['slow', 'slip', 'sleep', 'slide'], hint: 'Blend both sounds: "s" + "l".' },
  { id: 'cb-sp', category: 'consonant-blend', grapheme: 'sp', phoneme: '/sp/', examples: ['spot', 'spin', 'spell', 'space'], hint: 'Blend both sounds: "s" + "p".' },
  { id: 'cb-st', category: 'consonant-blend', grapheme: 'st', phoneme: '/st/', examples: ['stop', 'star', 'step', 'stone'], hint: 'Blend both sounds: "s" + "t".' },
  { id: 'cb-tr', category: 'consonant-blend', grapheme: 'tr', phoneme: '/tr/', examples: ['tree', 'trip', 'track', 'true'], hint: 'Blend both sounds: "t" + "r".' },
  { id: 'cb-sw', category: 'consonant-blend', grapheme: 'sw', phoneme: '/sw/', examples: ['swim', 'sweet', 'swing', 'switch'], hint: 'Blend both sounds: "s" + "w".' },

  // ─── Silent Letters (12) ────────────────────────────────────
  { id: 'sl-kn', category: 'silent-letter', grapheme: 'kn', phoneme: '/n/', examples: ['knight', 'know', 'knee', 'knot'], hint: 'The "k" is silent before "n".' },
  { id: 'sl-wr', category: 'silent-letter', grapheme: 'wr', phoneme: '/r/', examples: ['write', 'wrong', 'wrap', 'wrist'], hint: 'The "w" is silent before "r".' },
  { id: 'sl-gn', category: 'silent-letter', grapheme: 'gn', phoneme: '/n/', examples: ['gnaw', 'gnat', 'gnome', 'sign'], hint: 'The "g" is silent before "n".' },
  { id: 'sl-mb', category: 'silent-letter', grapheme: 'mb', phoneme: '/m/', examples: ['lamb', 'climb', 'thumb', 'comb'], hint: 'The "b" is silent after "m".' },
  { id: 'sl-gh', category: 'silent-letter', grapheme: 'gh', phoneme: '', examples: ['light', 'night', 'thought', 'daughter'], hint: 'The "gh" is silent.' },
  { id: 'sl-wh-silent-w', category: 'silent-letter', grapheme: 'wh', phoneme: '/h/', examples: ['who', 'whole', 'whose', 'whom'], hint: 'The "w" is silent in "who" words.' },
  { id: 'sl-bt', category: 'silent-letter', grapheme: 'bt', phoneme: '/t/', examples: ['debt', 'doubt', 'subtle'], hint: 'The "b" is silent before "t".' },
  { id: 'sl-mn', category: 'silent-letter', grapheme: 'mn', phoneme: '/m/', examples: ['autumn', 'column', 'hymn', 'condemn'], hint: 'The "n" is silent after "m".' },
  { id: 'sl-ps', category: 'silent-letter', grapheme: 'ps', phoneme: '/s/', examples: ['psalm', 'psychology', 'pseudo'], hint: 'The "p" is silent before "s".' },
  { id: 'sl-rh', category: 'silent-letter', grapheme: 'rh', phoneme: '/r/', examples: ['rhyme', 'rhythm', 'rhino'], hint: 'The "h" is silent after "r".' },
  { id: 'sl-tle', category: 'silent-letter', grapheme: 'tle', phoneme: '/əl/', examples: ['castle', 'whistle', 'hustle', 'wrestle'], hint: 'The "t" is silent in "-stle" words.' },
  { id: 'sl-lk', category: 'silent-letter', grapheme: 'lk', phoneme: '/k/', examples: ['walk', 'talk', 'chalk', 'stalk'], hint: 'The "l" is silent before "k".' },

  // ─── Double Consonants (10) ─────────────────────────────────
  { id: 'dc-ll', category: 'double-consonant', grapheme: 'll', phoneme: '/l/', examples: ['ball', 'bell', 'fill', 'pull'], hint: 'Double "l" — still one "l" sound.' },
  { id: 'dc-ss', category: 'double-consonant', grapheme: 'ss', phoneme: '/s/', examples: ['miss', 'boss', 'class', 'dress'], hint: 'Double "s" — still one "s" sound.' },
  { id: 'dc-ff', category: 'double-consonant', grapheme: 'ff', phoneme: '/f/', examples: ['off', 'cliff', 'stuff', 'staff'], hint: 'Double "f" — still one "f" sound.' },
  { id: 'dc-zz', category: 'double-consonant', grapheme: 'zz', phoneme: '/z/', examples: ['buzz', 'fizz', 'jazz', 'fuzz'], hint: 'Double "z" — still one "z" sound.' },
  { id: 'dc-tt', category: 'double-consonant', grapheme: 'tt', phoneme: '/t/', examples: ['kitten', 'butter', 'mitten', 'letter'], hint: 'Double "t" — still one "t" sound.' },
  { id: 'dc-dd', category: 'double-consonant', grapheme: 'dd', phoneme: '/d/', examples: ['add', 'odd', 'muddy', 'ladder'], hint: 'Double "d" — still one "d" sound.' },
  { id: 'dc-pp', category: 'double-consonant', grapheme: 'pp', phoneme: '/p/', examples: ['happy', 'pepper', 'hippo', 'puppet'], hint: 'Double "p" — still one "p" sound.' },
  { id: 'dc-mm', category: 'double-consonant', grapheme: 'mm', phoneme: '/m/', examples: ['hammer', 'mammal', 'summer', 'swimming'], hint: 'Double "m" — still one "m" sound.' },
  { id: 'dc-nn', category: 'double-consonant', grapheme: 'nn', phoneme: '/n/', examples: ['dinner', 'penny', 'funny', 'banner'], hint: 'Double "n" — still one "n" sound.' },
  { id: 'dc-rr', category: 'double-consonant', grapheme: 'rr', phoneme: '/r/', examples: ['carry', 'berry', 'mirror', 'parrot'], hint: 'Double "r" — still one "r" sound.' },

  // ─── Suffixes (20) ──────────────────────────────────────────
  { id: 'sx-tion', category: 'suffix', grapheme: 'tion', phoneme: '/ʃən/', examples: ['nation', 'action', 'station', 'mention'], hint: '"-tion" says "shun".' },
  { id: 'sx-sion-shun', category: 'suffix', grapheme: 'sion', phoneme: '/ʃən/', examples: ['mission', 'passion', 'tension', 'session'], hint: '"-sion" can say "shun".' },
  { id: 'sx-sion-zhun', category: 'suffix', grapheme: 'sion', phoneme: '/ʒən/', examples: ['vision', 'decision', 'television', 'explosion'], hint: '"-sion" can also say "zhun".' },
  { id: 'sx-ing', category: 'suffix', grapheme: 'ing', phoneme: '/ɪŋ/', examples: ['running', 'jumping', 'playing', 'singing'], hint: '"-ing" means something is happening now.' },
  { id: 'sx-ed-d', category: 'suffix', grapheme: 'ed', phoneme: '/d/', examples: ['played', 'called', 'opened', 'moved'], hint: '"-ed" says "d" after voiced sounds.' },
  { id: 'sx-ed-t', category: 'suffix', grapheme: 'ed', phoneme: '/t/', examples: ['jumped', 'walked', 'kicked', 'asked'], hint: '"-ed" says "t" after unvoiced sounds.' },
  { id: 'sx-ed-id', category: 'suffix', grapheme: 'ed', phoneme: '/ɪd/', examples: ['wanted', 'needed', 'started', 'painted'], hint: '"-ed" says "id" after "t" or "d".' },
  { id: 'sx-ly', category: 'suffix', grapheme: 'ly', phoneme: '/li/', examples: ['quickly', 'slowly', 'kindly', 'gently'], hint: '"-ly" turns a word into "how" something is done.' },
  { id: 'sx-ful', category: 'suffix', grapheme: 'ful', phoneme: '/fəl/', examples: ['careful', 'helpful', 'beautiful', 'wonderful'], hint: '"-ful" means "full of".' },
  { id: 'sx-less', category: 'suffix', grapheme: 'less', phoneme: '/ləs/', examples: ['careless', 'hopeless', 'endless', 'useless'], hint: '"-less" means "without".' },
  { id: 'sx-ness', category: 'suffix', grapheme: 'ness', phoneme: '/nəs/', examples: ['kindness', 'sadness', 'darkness', 'happiness'], hint: '"-ness" turns a describing word into a thing.' },
  { id: 'sx-ment', category: 'suffix', grapheme: 'ment', phoneme: '/mənt/', examples: ['moment', 'movement', 'statement', 'payment'], hint: '"-ment" turns an action into a thing.' },
  { id: 'sx-able', category: 'suffix', grapheme: 'able', phoneme: '/əbəl/', examples: ['capable', 'lovable', 'readable', 'breakable'], hint: '"-able" means "can be done".' },
  { id: 'sx-ible', category: 'suffix', grapheme: 'ible', phoneme: '/ɪbəl/', examples: ['possible', 'visible', 'terrible', 'horrible'], hint: '"-ible" also means "can be done".' },
  { id: 'sx-ous', category: 'suffix', grapheme: 'ous', phoneme: '/əs/', examples: ['famous', 'dangerous', 'nervous', 'various'], hint: '"-ous" means "full of" or "having".' },
  { id: 'sx-er-comp', category: 'suffix', grapheme: 'er', phoneme: '/ər/', examples: ['bigger', 'faster', 'taller', 'stronger'], hint: '"-er" can mean "more" when comparing.' },
  { id: 'sx-est', category: 'suffix', grapheme: 'est', phoneme: '/ɪst/', examples: ['biggest', 'fastest', 'tallest', 'strongest'], hint: '"-est" means "the most" when comparing.' },
  { id: 'sx-ture', category: 'suffix', grapheme: 'ture', phoneme: '/tʃər/', examples: ['nature', 'picture', 'future', 'adventure'], hint: '"-ture" says "cher".' },
  { id: 'sx-ous-ious', category: 'suffix', grapheme: 'ious', phoneme: '/iəs/', examples: ['serious', 'curious', 'previous', 'various'], hint: '"-ious" says "ee-us".' },
  { id: 'sx-al', category: 'suffix', grapheme: 'al', phoneme: '/əl/', examples: ['animal', 'normal', 'final', 'special'], hint: '"-al" makes a noun into a describing word.' },

  // ─── Prefixes (16) ──────────────────────────────────────────
  { id: 'px-un', category: 'prefix', grapheme: 'un', phoneme: '/ʌn/', examples: ['undo', 'unhappy', 'unlike', 'unfair'], hint: '"un-" means "not" or "opposite".' },
  { id: 'px-re', category: 'prefix', grapheme: 're', phoneme: '/riː/', examples: ['redo', 'replay', 'return', 'rewrite'], hint: '"re-" means "again".' },
  { id: 'px-pre', category: 'prefix', grapheme: 'pre', phoneme: '/priː/', examples: ['preview', 'pretest', 'preheat', 'prepay'], hint: '"pre-" means "before".' },
  { id: 'px-dis', category: 'prefix', grapheme: 'dis', phoneme: '/dɪs/', examples: ['dislike', 'disagree', 'discover', 'disappear'], hint: '"dis-" means "not" or "opposite".' },
  { id: 'px-mis', category: 'prefix', grapheme: 'mis', phoneme: '/mɪs/', examples: ['mistake', 'misread', 'mislead', 'misplace'], hint: '"mis-" means "wrongly".' },
  { id: 'px-im', category: 'prefix', grapheme: 'im', phoneme: '/ɪm/', examples: ['important', 'impossible', 'impolite', 'immature'], hint: '"im-" means "not" (before b, m, p).' },
  { id: 'px-in', category: 'prefix', grapheme: 'in', phoneme: '/ɪn/', examples: ['inside', 'incorrect', 'invisible', 'incomplete'], hint: '"in-" means "not" or "into".' },
  { id: 'px-over', category: 'prefix', grapheme: 'over', phoneme: '/oʊvər/', examples: ['overflow', 'overlook', 'overdue', 'overcome'], hint: '"over-" means "too much" or "above".' },
  { id: 'px-under', category: 'prefix', grapheme: 'under', phoneme: '/ʌndər/', examples: ['under', 'understand', 'underline', 'underwater'], hint: '"under-" means "below" or "not enough".' },
  { id: 'px-sub', category: 'prefix', grapheme: 'sub', phoneme: '/sʌb/', examples: ['subject', 'subway', 'subtract', 'submarine'], hint: '"sub-" means "under" or "below".' },
  { id: 'px-super', category: 'prefix', grapheme: 'super', phoneme: '/suːpər/', examples: ['superman', 'supermarket', 'superstar', 'superhero'], hint: '"super-" means "above" or "beyond".' },
  { id: 'px-trans', category: 'prefix', grapheme: 'trans', phoneme: '/trænz/', examples: ['transport', 'transfer', 'translate', 'transform'], hint: '"trans-" means "across".' },
  { id: 'px-ex', category: 'prefix', grapheme: 'ex', phoneme: '/ɛks/', examples: ['exit', 'export', 'explore', 'expand'], hint: '"ex-" means "out of" or "former".' },
  { id: 'px-non', category: 'prefix', grapheme: 'non', phoneme: '/nɒn/', examples: ['nonstop', 'nonsense', 'nonfiction', 'nonliving'], hint: '"non-" means "not".' },
  { id: 'px-be', category: 'prefix', grapheme: 'be', phoneme: '/bɪ/', examples: ['because', 'before', 'become', 'begin'], hint: '"be-" is a common word beginning.' },
  { id: 'px-de', category: 'prefix', grapheme: 'de', phoneme: '/dɪ/', examples: ['decide', 'delay', 'defend', 'deliver'], hint: '"de-" often means "down" or "away".' },

  // ─── Irregular (10) ─────────────────────────────────────────
  { id: 'ir-ough-uff', category: 'irregular', grapheme: 'ough', phoneme: '/ʌf/', examples: ['tough', 'rough', 'enough'], hint: '"ough" says "uff" — just memorize it!' },
  { id: 'ir-ough-oh', category: 'irregular', grapheme: 'ough', phoneme: '/oʊ/', examples: ['though', 'dough', 'although'], hint: '"ough" can say "oh".' },
  { id: 'ir-ough-oo', category: 'irregular', grapheme: 'ough', phoneme: '/uː/', examples: ['through'], hint: '"ough" says "oo" in "through".' },
  { id: 'ir-ough-aw', category: 'irregular', grapheme: 'ough', phoneme: '/ɔː/', examples: ['thought', 'bought', 'brought', 'ought'], hint: '"ough" says "aw" in these words.' },
  { id: 'ir-ould', category: 'irregular', grapheme: 'ould', phoneme: '/ʊd/', examples: ['could', 'would', 'should'], hint: '"ould" — the "l" is silent.' },
  { id: 'ir-alk', category: 'irregular', grapheme: 'alk', phoneme: '/ɔːk/', examples: ['walk', 'talk', 'chalk', 'stalk'], hint: '"alk" — the "l" is silent.' },
  { id: 'ir-ight', category: 'irregular', grapheme: 'ight', phoneme: '/aɪt/', examples: ['light', 'night', 'right', 'fight'], hint: '"ight" says "ite" — the "gh" is silent.' },
  { id: 'ir-eigh', category: 'irregular', grapheme: 'eigh', phoneme: '/eɪ/', examples: ['eight', 'weight', 'neighbor', 'sleigh'], hint: '"eigh" says long "a".' },
  { id: 'ir-augh', category: 'irregular', grapheme: 'augh', phoneme: '/ɔː/', examples: ['caught', 'taught', 'daughter', 'naughty'], hint: '"augh" says "aw".' },
  { id: 'ir-ey-ay', category: 'irregular', grapheme: 'ey', phoneme: '/eɪ/', examples: ['they', 'grey', 'prey', 'obey'], hint: '"ey" can say long "a".' },
];

export function findPatternById(id: string): PatternEntry | undefined {
  return patterns.find(p => p.id === id);
}

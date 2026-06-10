// src/core/memory-aids/mnemonic-aid.ts — "Memory Tricks" aid

import type { MnemonicAid, MnemonicTrick } from '../../contracts/types.ts';
import { splitSyllables } from '../phonics/syllabifier.ts';

// ─── Common words to find hidden inside other words ──────────

const HIDDEN_WORDS = new Set([
  'a', 'an', 'and', 'are', 'art', 'at', 'ate', 'be', 'bit', 'but',
  'can', 'car', 'cat', 'come', 'den', 'do', 'ear', 'eat', 'end',
  'eve', 'for', 'get', 'go', 'got', 'had', 'has', 'hat', 'he',
  'hen', 'her', 'here', 'hid', 'him', 'his', 'hit', 'hot', 'ice',
  'if', 'in', 'ion', 'is', 'it', 'let', 'lie', 'lit', 'low',
  'man', 'may', 'me', 'men', 'met', 'net', 'new', 'no', 'not',
  'now', 'on', 'one', 'or', 'ore', 'our', 'out', 'ow', 'own',
  'pan', 'par', 'pat', 'pen', 'per', 'pet', 'pie', 'pin', 'pit',
  'ran', 'rat', 'red', 'rid', 'rim', 'rip', 'run', 'sit', 'so',
  'son', 'the', 'ten', 'tin', 'to', 'ton', 'too', 'up', 'us',
  'we', 'win', 'wit',
]);

// Minimum length for hidden words to be interesting
const MIN_HIDDEN_WORD_LENGTH = 2;
// Only show hidden words that are at least this fraction of the parent word
const MIN_LENGTH_RATIO = 0.2;

// ─── Silly story mnemonics for common tricky words ───────────
// Short, visual mini-stories an 8-year-old can picture. Only for words
// that don't already have an entry in KNOWN_MNEMONICS below.

const STORY_MNEMONICS: Record<string, string> = {
  pursue: 'A cat goes PURRR when it chases you — PUR-sue means chase!',
  tongue: 'Your TONGUE tripped and landed on U-E at the end!',
  stomach: 'After too much candy your stomach says "ACH!" — stom-ACH',
  busy: 'The BUS is always busY picking everyone up',
  build: 'U and I BUILD a fort together — bUIld',
  guess: 'In GUESS the U hides behind the G — you\'d never guess it\'s there!',
  juice: 'JUICE is for U and I — j-U-I-ce',
  school: 'At SCHool the H sneaks in line between C and OOL',
  sugar: 'Sugar is so sweet it whispers "SHH" — Sugar starts with S but says "sh"',
  minute: 'A MINUTE is tiny — it ends in a cUTE little UTE',
  once: 'ONCE upon a time, ONE put on a CE cape — ONce',
  laugh: 'LAUGH ends in GH that giggles like an F — ha ha!',
  young: 'YOUNG has YOU inside — YOU are young!',
  early: 'You hEAR with your EAR EARly in the morning — EARly',
  heart: 'Your HEART has an EAR inside — listen to your hEARt',
  whole: 'The silent W swallowed the WHOLE hole',
  hour: 'The H in HOUR is silent — it slept through OUR hour',
  two: 'TWO has a W — TWins are TWO, TWenty needs TWO hands',
  four: 'FOUR has OUR inside — this number is OURs!',
  says: 'SAYS is just SAY + S, even though it sounds like "sez"',
  done: 'When you DO something, it\'s DOne — DO + NE',
  gone: 'GOne means it GOt up and left — GO + NE',
  some: 'SO ME wants SOME — SO + ME',
  come: 'COme to ME — COME ends with ME',
  love: 'LOVE ends in E — no English word ends in a lonely V',
  have: 'HAVE ends in E — the V never stands at the end alone',
  give: 'GIVE ends in E — the V always brings its friend E',
  pretty: 'PRETTY has two T\'s sitting up straight to look pretty',
  always: 'ALWAYS = AL + WAYS — all ways, every time',
  almost: 'ALmost lost an L — AL + MOST has just one L',
  until: 'UNTIL has one L — it lost the other one along the way',
  favorite: 'My FAVORite does me a FAVOR — FAVOR + ITE',
};

// ─── Well-known mnemonic phrases for common tricky words ─────

const KNOWN_MNEMONICS: Record<string, string> = {
  because: 'Big Elephants Can Always Understand Small Elephants',
  believe: 'Never beLIEve a LIE',
  friend: 'I will be your friEND to the END',
  separate: 'There is A RAT in sepARAte',
  necessary: 'One Collar, two Sleeves: one C, two S\'s',
  together: 'TO + GET + HER = together',
  beautiful: 'Big Elephants Are Ugly — no wait, they\'re BEAUTIFUL',
  Wednesday: 'WED·NES·DAY — say all three parts',
  February: 'FEB·RU·ARY — don\'t forget the first R',
  library: 'LI·BRAR·Y — it has two R\'s like "rare" books',
  different: 'DIFFER + ENT — things that DIFFER are different',
  receive: 'I before E except after C: reCEIve',
  piece: 'A PIECE of PIE',
  weird: 'WEIRD breaks the "i before e" rule — it\'s weird!',
  their: 'THEIR has HEIR — it belongs to the heirs',
  there: 'THERE has HERE — pointing to a place',
  island: 'An ISLAND IS LAND surrounded by water',
  could: 'O U Lucky Duck — cOULd, wOULd, shOULd',
  would: 'O U Lucky Duck — cOULd, wOULd, shOULd',
  should: 'O U Lucky Duck — cOULd, wOULd, shOULd',
  ocean: 'Only Cats Eat At Night',
  said: 'Silly Ants In Dirt',
  again: 'A Gorilla Ate Ice Noisily',
  does: 'Dogs Only Eat Sausages',
  people: 'People Eat Oranges, People Like Eating',
  where: 'WHERE has HERE — asking about a place',
  which: 'WHICH has a silent W before HI',
  write: 'WRITE has a silent W — a wrist writes',
  know: 'KNOW has a silent K — like knee and knife',
  answer: 'ANSWER has a silent W',
  listen: 'LISTEN has a silent T',
  often: 'OFTEN — the T is sometimes silent',
  caught: 'CAUGHT has "augh" — think of DAUGHTER too',
  thought: 'THOUGHT has "ough" — think of BOUGHT too',
  through: 'THROUGH has "ough" — it goes all the way through',
  enough: 'ENOUGH has "ough" — ROUGH and TOUGH too',
  surprise: 'There\'s a hidden R: surPRise, not suprise',
  rhythm: 'Rhythm Has Your Two Hips Moving',
  calendar: 'There\'s a DAR at the end: calenDAR',
  tomorrow: 'TOM·OR·ROW — one M, two R\'s',
  remember: 'RE + MEMBER — put the parts back together',
  important: 'IM + PORT + ANT — an ant at the port',
  especially: 'E + SPECIAL + LY — it\'s especially special',
  beginning: 'Big Elephants Get Incredibly Nasty — two N\'s!',
  embarrass: 'Two R\'s, two S\'s: embaRRaSS',
  occurrence: 'Two C\'s, two R\'s: oCCuRRence',
  disappoint: 'One S, two P\'s: diSaPPoint',
  accommodate: 'Two C\'s, two M\'s: aCCoMModate',
  acquire: 'AC + QUIRE — it has a C before QU',
  height: 'EIGHT with an H in front (almost)',
  weight: 'WEIGH + T — weigh it on a scale',
};

/**
 * Generate memory trick aid for a word.
 * Combines word-within-word discovery with known mnemonics
 * and syllable-based tricks.
 */
export function generateMnemonicAid(word: string): MnemonicAid {
  const lower = word.toLowerCase().trim();
  const tricks: MnemonicTrick[] = [];

  // 0. Silly story first — the most memorable hook for young learners
  const story = STORY_MNEMONICS[lower];
  if (story) {
    tricks.push({
      label: 'Story',
      content: story,
    });
  }

  // 1. Check for a known mnemonic
  const knownMnemonic = KNOWN_MNEMONICS[lower];
  if (knownMnemonic) {
    tricks.push({
      label: 'Remember',
      content: knownMnemonic,
    });
  }

  // 2. Find hidden words
  const hiddenWords = findHiddenWords(lower);
  if (hiddenWords.length > 0) {
    const highlighted = highlightHiddenWords(lower, hiddenWords);
    tricks.push({
      label: 'Words inside',
      content: highlighted,
    });
  }

  // 3. Syllable clap trick (if word has multiple syllables)
  const syllables = splitSyllables(lower);
  if (syllables.length >= 2) {
    const clap = syllables.map(s => s.toUpperCase()).join(' · ');
    tricks.push({
      label: 'Clap it out',
      content: `${clap} (${syllables.length} parts)`,
    });
  }

  // 4. Double letter callout
  const doubles = findDoubleLetters(lower);
  if (doubles.length > 0) {
    const doubleStr = doubles.map(d => `"${d}${d}"`).join(' and ');
    tricks.push({
      label: 'Watch out',
      content: `Double ${doubleStr} in this word!`,
    });
  }

  // 5. Silent letter callout
  const silentLetterTrick = getSilentLetterTrick(lower);
  if (silentLetterTrick) {
    tricks.push(silentLetterTrick);
  }

  // Limit to 3 best tricks (story/known mnemonic always first if present)
  return {
    type: 'mnemonic',
    tricks: tricks.slice(0, 3),
  };
}

/**
 * Find meaningful English words hidden inside a longer word.
 * Returns words sorted by length (longest first).
 */
function findHiddenWords(word: string): string[] {
  if (word.length < 4) return [];

  const found: string[] = [];

  for (const candidate of HIDDEN_WORDS) {
    if (candidate.length < MIN_HIDDEN_WORD_LENGTH) continue;
    if (candidate.length / word.length < MIN_LENGTH_RATIO) continue;
    // Don't include the word itself
    if (candidate === word) continue;
    // Must be a substring
    if (!word.includes(candidate)) continue;
    // Skip if it's just the first 1-2 letters or last 1-2 letters (too obvious)
    if (candidate.length <= 2 && (word.startsWith(candidate) || word.endsWith(candidate))) continue;

    found.push(candidate);
  }

  // Sort by length descending (more interesting words first)
  found.sort((a, b) => b.length - a.length);

  // Return top 3
  return found.slice(0, 3);
}

/**
 * Highlight hidden words within the parent word using uppercase.
 * e.g., "together" with ["get", "her"] → "toGETHER"
 */
function highlightHiddenWords(word: string, hiddenWords: string[]): string {
  const highlighted = word.split('');
  const used = new Array<boolean>(word.length).fill(false);

  // Highlight longest words first to avoid overlaps
  for (const hw of hiddenWords) {
    const idx = word.indexOf(hw);
    if (idx >= 0) {
      let overlap = false;
      for (let i = idx; i < idx + hw.length; i++) {
        if (used[i]) { overlap = true; break; }
      }
      if (!overlap) {
        for (let i = idx; i < idx + hw.length; i++) {
          highlighted[i] = highlighted[i].toUpperCase();
          used[i] = true;
        }
      }
    }
  }

  return highlighted.join('');
}

/**
 * Find double letters in a word (common source of spelling errors).
 */
function findDoubleLetters(word: string): string[] {
  const doubles: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < word.length - 1; i++) {
    if (word[i] === word[i + 1] && !seen.has(word[i])) {
      doubles.push(word[i]);
      seen.add(word[i]);
    }
  }
  return doubles;
}

// Common silent letter patterns
const SILENT_LETTER_PATTERNS: Array<{ test: (w: string) => boolean; trick: MnemonicTrick }> = [
  {
    test: (w) => w.startsWith('kn'),
    trick: { label: 'Silent letter', content: 'Silent K — say "nee" but write "knee"' },
  },
  {
    test: (w) => w.startsWith('wr'),
    trick: { label: 'Silent letter', content: 'Silent W — the W is quiet before R' },
  },
  {
    test: (w) => w.startsWith('gn'),
    trick: { label: 'Silent letter', content: 'Silent G — the G hides before N' },
  },
  {
    test: (w) => w.includes('mb') && w.endsWith('mb'),
    trick: { label: 'Silent letter', content: 'Silent B — the B is quiet after M' },
  },
  {
    test: (w) => w.includes('ght'),
    trick: { label: 'Silent letters', content: 'Silent GH — the G and H are quiet in "ght"' },
  },
];

function getSilentLetterTrick(word: string): MnemonicTrick | null {
  for (const { test, trick } of SILENT_LETTER_PATTERNS) {
    if (test(word)) return trick;
  }
  return null;
}

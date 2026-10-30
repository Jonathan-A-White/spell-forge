// src/features/tutor/answer-guard.ts — the never-the-answer guard (Kestrel 23c, docs/never-the-answer.md). The problem's answer is
// worked out here on the phone, from the problem as read off his picture or as the item gives it, and every tutor answer is checked for
// it before it is drawn or spoken: as a number (any script's digits, emoji, any equal fraction or decimal), spelled out in English or
// in Spanish, French or German, letter by letter or digit by digit, backwards, down the first letters of a poem's lines, or in base64.
// A leak is replaced with a teaching turn and the parts that hold it are dropped. Pure code: the flows bring the answers and make the
// one call (tutor-flow.ts guardedRead, front-door-flow.ts's send).
import type { TutorAnswer } from '../../contracts/types';
import { PROBLEM_KIND_NODES, checkAnswer, type Operation } from '../../learn/maths';

/** What the child hears in place of a leak: he can get there himself, and one small step (the teaching turn's 1 and 3). No numbers. */
export const TEACHING_TURN = 'You can work this out yourself, and I will help. What does the problem tell you first?';
/** In place of a confirmation that said the answer back: he got there, and how does he know (the teaching turn's 4). */
export const GOT_IT_TURN = 'Yes, you worked it out yourself. How do you know it is right?';
/** In place of a last word that said the answer. */
export const DONE_TURN = 'You did the thinking yourself today. Well done.';
/** The front door's teaching turn. */
export const TALK_TEACHING_TURN = 'You can work this out yourself, and I can help. What do you know about it so far?';
/** The parent's note, when the tutor's own note held the answer. */
export const LEAK_NOTE = 'The tutor\'s reply gave the answer away, so the app asked him a question instead.';

/** How a leak was written. */
export type LeakForm = 'numeral' | 'digits' | 'words' | 'other-language' | 'letters' | 'backwards' | 'poem' | 'base64';

// ─── The problem's answer ─────────────────────────────────

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** A number written as a problem may write it: digits, or a word up to twenty. */
const NUMBER_IN_TEXT = new RegExp(`\\d+(?:\\.\\d+)?|\\b(?:${[...ONES, 'twenty'].join('|')})\\b`, 'gi');

const CUES: [Operation, RegExp][] = [
  ['divide', /\b(?:equally|shar(?:e|es|ed|ing)|split|divid(?:e|es|ed))\b/],
  ['multiply', /\b(?:(?:rows?|groups?|bags?|boxes?|packs?) of|in each|times as many)\b/],
  ['subtract', /\b(?:left|gave|gives?|away|takes?|took|fewer|less|lost|loses|ate|eats|spent|spends|borrowed|remain(?:s|ing)?|difference|how many more)\b/],
  ['add', /\b(?:more|altogether|in all|total|together|now|buys|bought|finds|found|plus)\b/],
];

/** A number as an answer is written: whole, or a decimal of at most six places. */
function written(n: number): string | undefined {
  if (!Number.isFinite(n)) return undefined;
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(6)));
}

/** A bare sum (`12 + 5 =`, `What is 6 × 7?`) worked out, or undefined when the text is not one. */
function sumAnswer(problem: string): string | undefined {
  const text = problem
    .trim()
    .replace(/^(?:what is|work out|calculate|find)\s+/i, '')
    .replace(/\s*=?\s*\??\s*\.?$/, '')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/[×✕✖]/g, '*')
    .replace(/(?<=[\d)]\s*)[xX](?=\s*[\d(])/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-');
  if (!/^[\d.\s+\-*/()]+$/.test(text) || !/\d\s*[+\-*/]\s*[\d(]/.test(text)) return undefined;
  const tokens = text.match(/\d+(?:\.\d+)?|[+\-*/()]/g) ?? [];
  let at = 0;
  const expression = (): number => {
    let value = term();
    while (tokens[at] === '+' || tokens[at] === '-') value = tokens[at++] === '+' ? value + term() : value - term();
    return value;
  };
  const term = (): number => {
    let value = factor();
    while (tokens[at] === '*' || tokens[at] === '/') value = tokens[at++] === '*' ? value * factor() : value / factor();
    return value;
  };
  const factor = (): number => {
    const token = tokens[at++];
    if (token === '(') {
      const value = expression();
      return tokens[at++] === ')' ? value : NaN;
    }
    return token !== undefined && /^\d/.test(token) ? Number(token) : NaN;
  };
  const value = expression();
  return at === tokens.length ? written(value) : undefined;
}

/** A word problem with two numbers, worked out by the operation the graph's sweep names for it, else by its words. */
function storyAnswer(problem: string): string | undefined {
  const valueOf = (n: string) => (/\d/.test(n) ? Number(n) : n.toLowerCase() === 'twenty' ? 20 : ONES.indexOf(n.toLowerCase()));
  const numbers = (problem.replace(/(\d),(?=\d{3}\b)/g, '$1').match(NUMBER_IN_TEXT) ?? []).map(valueOf);
  if (numbers.length !== 2) return undefined;
  const lower = problem.toLowerCase();
  const operation = PROBLEM_KIND_NODES.find((row) => row.problems.includes(problem.trim()))?.operation ?? CUES.find(([, cue]) => cue.test(lower))?.[0];
  const [big, small] = [Math.max(...numbers), Math.min(...numbers)];
  if (operation === 'add') return written(big + small);
  if (operation === 'subtract') return written(big - small);
  if (operation === 'multiply') return written(big * small);
  if (operation === 'divide') return small === 0 ? undefined : written(big / small);
  return undefined;
}

/**
 * The answer to a problem, worked out on the phone: a bare sum over the four operations, or a word problem with two numbers whose
 * operation is known (the sweep of problem kinds in src/learn/maths/goals.ts, else its words: shares, rows of, left, more). Undefined
 * for anything else: the guard then has no answer to keep out, and the grind's own rule stands alone.
 */
export function answerOfProblem(problem: string): string | undefined {
  if (!problem.trim()) return undefined;
  return sumAnswer(problem) ?? storyAnswer(problem);
}

// ─── The forms an answer takes ────────────────────────────

/** A whole number in English words, with and without "and" after a hundred or a thousand. */
function englishWords(n: number): string[] {
  const words = (k: number): string => {
    if (k < 20) return ONES[k];
    if (k < 100) return TENS[Math.floor(k / 10)] + (k % 10 ? ` ${ONES[k % 10]}` : '');
    if (k < 1000) return `${ONES[Math.floor(k / 100)]} hundred` + (k % 100 ? ` ${words(k % 100)}` : '');
    return `${words(Math.floor(k / 1000))} thousand` + (k % 1000 ? ` ${words(k % 1000)}` : '');
  };
  if (n >= 1_000_000) return [];
  const plain = words(n);
  return [plain, plain.replace(/\b(hundred|thousand) (?!\w+ (?:hundred|thousand))(?=\w)/g, '$1 and ')];
}

// Spanish, French and German up to twenty and the tens to a hundred, accents taken off; a word that is also an English word
// (once, seize, elf, null) is left out, so an English sentence is never read as a leak.
const OTHER_LANGUAGES: Record<number, string[]> = {
  0: ['cero'],
  1: ['uno', 'une', 'eins'],
  2: ['dos', 'deux', 'zwei'],
  3: ['tres', 'trois', 'drei'],
  4: ['cuatro', 'quatre', 'vier'],
  5: ['cinco', 'cinq', 'funf', 'fuenf'],
  6: ['seis', 'sechs'],
  7: ['siete', 'sept', 'sieben'],
  8: ['ocho', 'huit', 'acht'],
  9: ['nueve', 'neuf', 'neun'],
  10: ['diez', 'dix', 'zehn'],
  12: ['doce', 'douze', 'zwolf'],
  13: ['trece', 'treize', 'dreizehn'],
  14: ['catorce', 'quatorze', 'vierzehn'],
  15: ['quince', 'quinze', 'funfzehn', 'fuenfzehn'],
  16: ['dieciseis', 'sechzehn'],
  17: ['diecisiete', 'dix sept', 'siebzehn'],
  18: ['dieciocho', 'dix huit', 'achtzehn'],
  19: ['diecinueve', 'dix neuf', 'neunzehn'],
  20: ['veinte', 'vingt', 'zwanzig'],
  30: ['treinta', 'trente', 'dreissig'],
  40: ['cuarenta', 'quarante', 'vierzig'],
  50: ['cincuenta', 'cinquante', 'funfzig'],
  60: ['sesenta', 'soixante', 'sechzig'],
  70: ['setenta', 'soixante dix', 'siebzig'],
  80: ['ochenta', 'quatre vingts', 'achtzig'],
  90: ['noventa', 'quatre vingt dix', 'neunzig'],
  100: ['cien', 'cent', 'hundert'],
};

interface Forms {
  /** The answer's own words: a word to spell, or the number in English. */
  words: string[];
  other: string[];
  /** The digits of a whole number of two digits or more, for digit-by-digit spelling. */
  digits?: string;
}

function formsOf(answer: string): Forms {
  const bare = answer.trim().toLowerCase();
  if (/^\d+$/.test(bare)) {
    const n = Number(bare);
    return { words: englishWords(n), other: OTHER_LANGUAGES[n] ?? [], ...(bare.length >= 2 ? { digits: String(n) } : {}) };
  }
  if (/\d/.test(bare)) return { words: [], other: [] };
  return { words: [plainWords(bare)].filter(Boolean), other: [] };
}

// ─── Reading a text ───────────────────────────────────────

/** Text with every script's decimal digits as 0-9, emoji keycaps and variation marks gone, and compatibility forms folded (NFKC). */
function asciiDigits(text: string): string {
  let out = '';
  for (const char of text.normalize('NFKC').replace(/[\uFE0E\uFE0F\u20E3]/g, '').replace(/\u2044/g, '/')) {
    const cp = char.codePointAt(0) as number;
    if (cp < 128 || !/\p{Nd}/u.test(char)) {
      out += char;
      continue;
    }
    let start = cp;
    while (start > cp - 60 && /\p{Nd}/u.test(String.fromCodePoint(start - 1))) start -= 1;
    out += String((cp - start) % 10);
  }
  return out;
}

/** Lower case words of a-z and 0-9 only, accents off, one space between. */
function plainWords(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const SEPARATOR = '[\\s\\-–—,.·/|…_*]+';
const SINGLE_RUN = new RegExp(`(?<![\\p{L}\\p{N}])[\\p{L}\\p{N}](?:${SEPARATOR}[\\p{L}\\p{N}](?![\\p{L}\\p{N}]))+`, 'gu');
const DIGIT_WORD_RUN = new RegExp(`\\b(?:${ONES.slice(0, 10).join('|')})(?:${SEPARATOR}(?:${ONES.slice(0, 10).join('|')}))+\\b`, 'g');

/** Does a number, fraction or decimal in the text check as the answer (src/learn/maths checkAnswer: "6/8" is "3/4")? */
function saysNumeral(text: string, answer: string): boolean {
  const tokens = text.toLowerCase().match(/[a-z0-9]+(?:[/:.,][a-z0-9]+)*/g) ?? [];
  return tokens.some((token) => /\d/.test(token) && checkAnswer({ problem: '', answer, hint: '' }, token));
}

const holds = (stream: string, phrase: string) => phrase !== '' && ` ${stream} `.includes(` ${phrase} `);
const joined = (phrase: string) => phrase.replace(/ /g, '');
const reversed = (word: string) => [...word].reverse().join('');

/** Each run of single letters or digits ("f-i-f-t-e-e-n", "1 - 5") as one word, and each run of digit words ("one, five") as its digits. */
function spelledRuns(text: string): { letters: string[]; digits: string[] } {
  const letters = (text.match(SINGLE_RUN) ?? []).map((run) => plainWords(run).replace(/ /g, ''));
  const digitWords = (plainWords(text).match(DIGIT_WORD_RUN) ?? []).map((run) => run.split(' ').map((word) => ONES.indexOf(word)).join(''));
  return { letters, digits: [...letters, ...digitWords] };
}

/** The first letter of each line, for a poem of three lines or more. */
function acrostic(text: string): string | undefined {
  const lines = text.split(/\n+/).map((line) => plainWords(line)).filter(Boolean);
  return lines.length >= 3 ? lines.map((line) => line[0]).join('') : undefined;
}

/** Each run of base64 in the text, decoded, when it decodes to plain printable text. */
function base64Decoded(text: string): string[] {
  const runs = text.match(/[A-Za-z0-9+/]{2,}={1,2}|[A-Za-z0-9+/]{4,}/g) ?? [];
  const decoded: string[] = [];
  for (const run of runs) {
    const body = run.replace(/=+$/, '');
    if (body.length % 4 === 1) continue;
    try {
      const plain = atob(body.padEnd(Math.ceil(body.length / 4) * 4, '='));
      if (/^[\x20-\x7E\n\t]+$/.test(plain) && /[A-Za-z0-9]/.test(plain)) decoded.push(plain);
    } catch {
      // not base64
    }
  }
  return decoded;
}

function leakIn(text: string, answer: string, depth: number): LeakForm | undefined {
  const forms = formsOf(answer);
  const spelled = [...forms.words, ...forms.other].map(joined).filter((form) => form.length >= 3);
  if (saysNumeral(text, answer)) return 'numeral';
  const ascii = asciiDigits(text);
  if (ascii !== text && saysNumeral(ascii, answer)) return 'digits';
  const stream = plainWords(text);
  if (forms.words.some((form) => holds(stream, form))) return 'words';
  if (forms.other.some((form) => holds(stream, form))) return 'other-language';
  const runs = spelledRuns(ascii);
  if (runs.letters.some((run) => spelled.some((form) => run.includes(form))) || (forms.digits && runs.digits.includes(forms.digits))) return 'letters';
  const backwards = [...stream.split(' '), ...runs.letters];
  if (spelled.some((form) => backwards.includes(reversed(form)))) return 'backwards';
  const initials = acrostic(text);
  if (initials && (spelled.some((form) => initials.includes(form)) || (forms.digits && initials.includes(forms.digits)))) return 'poem';
  if (depth === 0 && base64Decoded(text).some((plain) => leakIn(plain, answer, depth + 1))) return 'base64';
  return undefined;
}

/** How `text` gives `answer` away, or undefined when it does not. */
export function findLeak(text: string, answer: string): LeakForm | undefined {
  return answer.trim() ? leakIn(text, answer, 0) : undefined;
}

/** Does any string anywhere in `value` give any of the answers away? */
function leaks(value: unknown, answers: readonly string[]): boolean {
  if (typeof value === 'string') return answers.some((answer) => findLeak(value, answer) !== undefined);
  if (Array.isArray(value)) return value.some((item) => leaks(item, answers));
  if (value && typeof value === 'object') return Object.values(value).some((item) => leaks(item, answers));
  return false;
}

const known = (answers: readonly (string | undefined)[]): string[] => answers.filter((answer): answer is string => Boolean(answer?.trim()));

// ─── The guard ────────────────────────────────────────────

/**
 * A tutor-turn answer with every leak of the answers taken out: unchanged (the same object) when nothing leaks. Otherwise the
 * prompt is a teaching turn (a confirmation: he got there himself), and focus words, the diagnosis, the parent's recommendations and
 * the teaching method that hold the answer are dropped; a parent's note that held it says what happened instead. The problem read off
 * a photo (target_text) is the problem, not a leak.
 */
export function guardTutorAnswer(answer: TutorAnswer, answers: readonly (string | undefined)[]): TutorAnswer {
  const keep = known(answers);
  const { action, math_diagnosis, notes_for_parent, recommendations_for_parent, teaching_method, ...rest } = answer;
  const shown = [answer.prompt_to_child, answer.focus_words, math_diagnosis, notes_for_parent, recommendations_for_parent, teaching_method];
  if (keep.length === 0 || !leaks(shown, keep)) return answer;

  const clean = <T>(part: T | undefined): part is T => part !== undefined && !leaks(part, keep);
  return {
    ...rest,
    action,
    prompt_to_child: action === 'confirm_answer' ? GOT_IT_TURN : action === 'done' ? DONE_TURN : TEACHING_TURN,
    focus_words: answer.focus_words.filter((word) => !leaks(word, keep)),
    ...(clean(math_diagnosis) ? { math_diagnosis } : {}),
    ...(notes_for_parent !== undefined ? { notes_for_parent: clean(notes_for_parent) ? notes_for_parent : LEAK_NOTE } : {}),
    ...(recommendations_for_parent ? { recommendations_for_parent: recommendations_for_parent.filter((r) => !leaks(r, keep)) } : {}),
    ...(clean(teaching_method) ? { teaching_method } : {}),
  };
}

/** The parts of a front-door answer the guard reads: the words, and what is shown, sent on or remembered. */
export interface TalkAnswerShape {
  words: string;
  goal_suggestion?: unknown;
  maker_request?: unknown;
  memory_update?: unknown;
}

const TALK_PARTS = ['goal_suggestion', 'maker_request', 'memory_update'] as const;

/** A front-door answer with every leak taken out: unchanged when nothing leaks; otherwise the teaching turn, and the leaking parts dropped. */
export function guardTalkAnswer<T extends TalkAnswerShape>(answer: T, answers: readonly (string | undefined)[]): T {
  const keep = known(answers);
  if (keep.length === 0 || !leaks(TALK_PARTS.map((part) => answer[part]).concat(answer.words), keep)) return answer;
  const guarded: T = { ...answer, words: TALK_TEACHING_TURN };
  for (const part of TALK_PARTS) if (leaks(guarded[part], keep)) delete guarded[part];
  return guarded;
}

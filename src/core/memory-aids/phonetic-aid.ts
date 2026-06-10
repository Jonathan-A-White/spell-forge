// src/core/memory-aids/phonetic-aid.ts — "Sound It Out" memory aid

import type { PhoneticAid, PhoneticChunk, Phoneme } from '../../contracts/types.ts';
import { splitSyllables } from '../phonics/syllabifier.ts';
import { analyzeWord } from '../phonics/engine.ts';

/**
 * Generate a phonetic breakdown aid for a word.
 * Shows syllables with kid-friendly pronunciation guides
 * (e.g. "pur" says "p-er") so the learner can sound out
 * the word piece by piece.
 */
export function generatePhoneticAid(word: string): PhoneticAid {
  const lower = word.toLowerCase().trim();
  const analysis = analyzeWord(lower);
  const syllables = analysis.syllables.length > 0
    ? analysis.syllables
    : splitSyllables(lower);

  // Syllables concatenate back to the word, so we can compute each
  // syllable's character range and assign phonemes by position.
  const concatenates = syllables.join('') === lower;
  let offset = 0;
  const chunks = syllables.map((syl): PhoneticChunk => {
    const start = offset;
    offset += syl.length;
    const pronunciation = concatenates
      ? buildSyllableRespelling(syl, start, offset, analysis.phonemes)
      : syl;
    return { text: syl, pronunciation };
  });

  const summary = chunks.map(c => c.text).join(' · ');

  return {
    type: 'phonetic',
    chunks,
    summary: `Say it: ${summary}`,
  };
}

/**
 * Build a kid-friendly respelling for one syllable, e.g. "p-er" for
 * "pur" or "s-oo" for "sue". Phonemes are assigned to the syllable
 * whose character range contains them, then each phoneme's IPA is
 * translated to a readable sound.
 */
// Soft sounds for the consonant inside silent-e chunks ("ace" → s, "age" → j)
const SOFT_CONSONANTS: Record<string, string> = { c: 's', g: 'j' };

function buildSyllableRespelling(
  syllable: string,
  start: number,
  end: number,
  phonemes: Phoneme[],
): string {
  const parts: string[] = [];

  for (const p of phonemes) {
    const mid = p.position + p.length / 2;
    if (mid < start || mid >= end) continue;
    parts.push(...phonemeToParts(p));
  }

  return parts.length > 0 ? parts.join('-') : syllable;
}

/** Sound parts for one phoneme, e.g. "/aɪt/" → ["eye", "t"]. */
function phonemeToParts(p: Phoneme): string[] {
  const parts = ipaToFriendlyParts(p.phoneme, p.grapheme);

  // Silent-e chunks ("ake", "ice") carry only the long vowel sound in the
  // pattern DB — add the middle consonant's sound back so "cake" sounds
  // out as c-ay-k, not c-ay.
  if (
    p.grapheme.length === 3 &&
    p.grapheme[2] === 'e' &&
    'aeiou'.includes(p.grapheme[0]) &&
    !'aeiou'.includes(p.grapheme[1])
  ) {
    parts.push(SOFT_CONSONANTS[p.grapheme[1]] ?? p.grapheme[1]);
  }

  return parts;
}

/**
 * IPA symbols → kid-friendly respellings, longest symbols first so
 * greedy matching picks "ɜːr" before "ɜː" or "r".
 */
const IPA_RESPELL: [string, string][] = [
  ['aɪər', 'ire'],
  ['jʊər', 'yoor'],
  ['ɛər', 'air'],
  ['ɪər', 'eer'],
  ['ɜːr', 'er'],
  ['ɑːr', 'ar'],
  ['ɔːr', 'or'],
  ['juː', 'yoo'],
  ['eɪ', 'ay'],
  ['aɪ', 'eye'],
  ['aʊ', 'ow'],
  ['oʊ', 'oh'],
  ['ɔɪ', 'oy'],
  ['iː', 'ee'],
  ['uː', 'oo'],
  ['ɔː', 'aw'],
  ['ər', 'er'],
  ['tʃ', 'ch'],
  ['dʒ', 'j'],
  ['ʃ', 'sh'],
  ['ʒ', 'zh'],
  ['θ', 'th'],
  ['ð', 'th'],
  ['ŋ', 'ng'],
  ['æ', 'a'],
  ['ɛ', 'e'],
  ['ɪ', 'i'],
  ['ɒ', 'o'],
  ['ʌ', 'u'],
  ['ʊ', 'oo'],
  ['ə', 'uh'],
  ['ɡ', 'g'],
  ['j', 'y'],
];

/**
 * Translate one phoneme's IPA string (e.g. "/aɪt/") into readable sound
 * parts (e.g. ["eye", "t"]). Adjacent consonant sounds stay merged as a
 * blend ("fr", "nd"); vowel sounds split into their own part so chunks
 * read like sounding out, not like a fake word. Returns [] for silent
 * letters; falls back to the written grapheme when nothing matches.
 */
function ipaToFriendlyParts(ipa: string, grapheme: string): string[] {
  // Strip slashes and stress marks; length marks are consumed by matching
  const raw = ipa.replace(/[/ˈˌ]/g, '');
  if (raw.length === 0) return []; // silent (e.g. "gh") — no sound part

  const tokens: string[] = [];
  let i = 0;
  outer: while (i < raw.length) {
    for (const [symbol, friendly] of IPA_RESPELL) {
      if (raw.startsWith(symbol, i)) {
        tokens.push(friendly);
        i += symbol.length;
        continue outer;
      }
    }
    const ch = raw[i];
    if (/[a-z]/.test(ch)) tokens.push(ch); // plain consonants map to themselves
    i += 1; // skip anything unrecognized (e.g. stray "ː")
  }

  if (tokens.length === 0) return [grapheme];

  // Merge consecutive consonant tokens into blends; vowels get their own part
  const hasVowel = (t: string) => /[aeiou]/.test(t);
  const parts: string[] = [];
  for (const token of tokens) {
    const prev = parts[parts.length - 1];
    if (prev !== undefined && !hasVowel(prev) && !hasVowel(token)) {
      parts[parts.length - 1] = prev + token;
    } else {
      parts.push(token);
    }
  }
  return parts;
}

// src/core/phonics/languages/spanish/patterns.ts — Spanish phonics pattern database.
// Spanish spelling is highly regular (near 1:1 grapheme-phoneme), so patterns
// focus on the handful of tricky rules: silent h, gu/qu, c/z split, accent marks, etc.

import type { PatternCategory } from '../../../../contracts/types.ts';

export interface SpanishPatternEntry {
  id: string;
  category: PatternCategory;
  grapheme: string;
  phoneme: string;
  examples: string[];
  hint: string;
}

export const spanishPatterns: SpanishPatternEntry[] = [
  // ─── Vowels (5 — always consistent) ──────────────────────
  { id: 'es-a', category: 'es-vowel', grapheme: 'a', phoneme: '/a/', examples: ['casa', 'agua', 'alma', 'ala'], hint: '"a" always sounds like "ah".' },
  { id: 'es-e', category: 'es-vowel', grapheme: 'e', phoneme: '/e/', examples: ['mesa', 'leer', 'este', 'leche'], hint: '"e" always sounds like "eh".' },
  { id: 'es-i', category: 'es-vowel', grapheme: 'i', phoneme: '/i/', examples: ['isla', 'piso', 'fino', 'rio'], hint: '"i" always sounds like "ee".' },
  { id: 'es-o', category: 'es-vowel', grapheme: 'o', phoneme: '/o/', examples: ['oso', 'todo', 'como', 'oro'], hint: '"o" always sounds like "oh".' },
  { id: 'es-u', category: 'es-vowel', grapheme: 'u', phoneme: '/u/', examples: ['uva', 'luna', 'muro', 'uno'], hint: '"u" always sounds like "oo".' },

  // ─── Accented vowels (stress markers — same sound, different stress) ──
  { id: 'es-a-accent', category: 'es-accent', grapheme: '\u00e1', phoneme: '/\u02c8a/', examples: ['pap\u00e1', 'caf\u00e9', 'm\u00e1s', 'aqu\u00ed'], hint: 'The accent mark (\u00b4) shows which syllable is stressed.' },
  { id: 'es-e-accent', category: 'es-accent', grapheme: '\u00e9', phoneme: '/\u02c8e/', examples: ['caf\u00e9', 'beb\u00e9', 'despu\u00e9s', 'tambi\u00e9n'], hint: 'The accent on "\u00e9" marks the stressed syllable.' },
  { id: 'es-i-accent', category: 'es-accent', grapheme: '\u00ed', phoneme: '/\u02c8i/', examples: ['aqu\u00ed', 'viv\u00ed', 'pa\u00eds', 'ma\u00edz'], hint: 'The accent on "\u00ed" marks the stressed syllable.' },
  { id: 'es-o-accent', category: 'es-accent', grapheme: '\u00f3', phoneme: '/\u02c8o/', examples: ['le\u00f3n', 'raz\u00f3n', 'cami\u00f3n', 'coraz\u00f3n'], hint: 'The accent on "\u00f3" marks the stressed syllable.' },
  { id: 'es-u-accent', category: 'es-accent', grapheme: '\u00fa', phoneme: '/\u02c8u/', examples: ['men\u00fa', 't\u00fa', '\u00faltimo', 'com\u00fan'], hint: 'The accent on "\u00fa" marks the stressed syllable.' },
  { id: 'es-u-dieresis', category: 'es-accent', grapheme: '\u00fc', phoneme: '/w/', examples: ['ping\u00fcino', 'verg\u00fcenza', 'ling\u00fc\u00edstica', 'bilin\u00fce'], hint: 'The dieresis (\u00a8) on "u" means it IS pronounced in "g\u00fc".' },

  // ─── Digraphs ─────────────────────────────────────────────
  { id: 'es-ch', category: 'es-digraph', grapheme: 'ch', phoneme: '/t\u0283/', examples: ['chico', 'noche', 'leche', 'mucho'], hint: '"ch" sounds like English "ch" in "church".' },
  { id: 'es-ll', category: 'es-digraph', grapheme: 'll', phoneme: '/\u028e/', examples: ['lluvia', 'calle', 'llave', 'pollo'], hint: '"ll" sounds like "y" in most dialects.' },
  { id: 'es-rr', category: 'es-digraph', grapheme: 'rr', phoneme: '/r/', examples: ['perro', 'carro', 'tierra', 'guerra'], hint: '"rr" is a strong rolled/trilled "r".' },
  { id: 'es-qu', category: 'es-digraph', grapheme: 'qu', phoneme: '/k/', examples: ['queso', 'quince', 'aquel', 'porque'], hint: '"qu" sounds like "k" — the "u" is silent.' },
  { id: 'es-gu-ei', category: 'es-digraph', grapheme: 'gu', phoneme: '/g/', examples: ['guerra', 'guitarra', 'guiso', 'Miguel'], hint: '"gu" before "e" or "i": the "u" is silent, just "g".' },

  // ─── Silent letter ────────────────────────────────────────
  { id: 'es-h-silent', category: 'es-silent-letter', grapheme: 'h', phoneme: '/-/', examples: ['hola', 'hacer', 'hora', 'helado'], hint: '"h" is always silent in Spanish.' },

  // ─── Special consonant rules ──────────────────────────────
  { id: 'es-c-soft', category: 'es-special-consonant', grapheme: 'c', phoneme: '/s/', examples: ['cielo', 'cerca', 'cine', 'ciudad'], hint: '"c" before "e" or "i" sounds like "s" (Latin America) or "th" (Spain).' },
  { id: 'es-c-hard', category: 'es-special-consonant', grapheme: 'c', phoneme: '/k/', examples: ['casa', 'comer', 'cubo', 'claro'], hint: '"c" before "a", "o", "u" sounds like "k".' },
  { id: 'es-g-soft', category: 'es-special-consonant', grapheme: 'g', phoneme: '/x/', examples: ['gente', 'girar', 'genio', 'gigante'], hint: '"g" before "e" or "i" sounds like a harsh "h".' },
  { id: 'es-g-hard', category: 'es-special-consonant', grapheme: 'g', phoneme: '/g/', examples: ['gato', 'gol', 'gusto', 'globo'], hint: '"g" before "a", "o", "u" sounds like English "g" in "go".' },
  { id: 'es-z', category: 'es-special-consonant', grapheme: 'z', phoneme: '/s/', examples: ['zapato', 'zona', 'azul', 'luz'], hint: '"z" sounds like "s" (Latin America) or "th" (Spain).' },
  { id: 'es-j', category: 'es-special-consonant', grapheme: 'j', phoneme: '/x/', examples: ['joven', 'ojo', 'jugar', 'bajo'], hint: '"j" sounds like a harsh "h".' },
  { id: 'es-nn', category: 'es-special-consonant', grapheme: '\u00f1', phoneme: '/\u0272/', examples: ['ni\u00f1o', 'a\u00f1o', 'espa\u00f1ol', 'monta\u00f1a'], hint: '"\u00f1" sounds like "ny" in "canyon".' },
  { id: 'es-v', category: 'es-special-consonant', grapheme: 'v', phoneme: '/b/', examples: ['vaca', 'vida', 'volver', 'uva'], hint: '"v" sounds the same as "b" in Spanish.' },
  { id: 'es-y-consonant', category: 'es-special-consonant', grapheme: 'y', phoneme: '/\u028e/', examples: ['yo', 'ya', 'playa', 'mayo'], hint: '"y" as a consonant sounds like "y" in "yes".' },
  { id: 'es-x', category: 'es-special-consonant', grapheme: 'x', phoneme: '/ks/', examples: ['examen', 'taxi', '\u00e9xito', 'extra'], hint: '"x" usually sounds like "ks".' },

  // ─── Diphthongs ───────────────────────────────────────────
  { id: 'es-ai', category: 'es-diphthong', grapheme: 'ai', phoneme: '/ai/', examples: ['aire', 'baile', 'paisaje', 'traigo'], hint: '"ai" — two vowels glide together in one syllable.' },
  { id: 'es-ei', category: 'es-diphthong', grapheme: 'ei', phoneme: '/ei/', examples: ['reina', 'veinte', 'peine', 'seis'], hint: '"ei" — two vowels glide together in one syllable.' },
  { id: 'es-oi', category: 'es-diphthong', grapheme: 'oi', phoneme: '/oi/', examples: ['oigo', 'hoy', 'boina', 'coincidir'], hint: '"oi" — two vowels glide together in one syllable.' },
  { id: 'es-au', category: 'es-diphthong', grapheme: 'au', phoneme: '/au/', examples: ['auto', 'causa', 'pausa', 'aula'], hint: '"au" — two vowels glide together in one syllable.' },
  { id: 'es-eu', category: 'es-diphthong', grapheme: 'eu', phoneme: '/eu/', examples: ['Europa', 'deuda', 'neutro', 'reunir'], hint: '"eu" — two vowels glide together in one syllable.' },
  { id: 'es-ia', category: 'es-diphthong', grapheme: 'ia', phoneme: '/ja/', examples: ['familia', 'diario', 'piano', 'hacia'], hint: '"ia" — the "i" glides into "a".' },
  { id: 'es-ie', category: 'es-diphthong', grapheme: 'ie', phoneme: '/je/', examples: ['tierra', 'tiempo', 'siete', 'bien'], hint: '"ie" — the "i" glides into "e".' },
  { id: 'es-io', category: 'es-diphthong', grapheme: 'io', phoneme: '/jo/', examples: ['radio', 'patio', 'precio', 'julio'], hint: '"io" — the "i" glides into "o".' },
  { id: 'es-iu', category: 'es-diphthong', grapheme: 'iu', phoneme: '/ju/', examples: ['ciudad', 'viuda', 'triunfo', 'diurno'], hint: '"iu" — the "i" glides into "u".' },
  { id: 'es-ua', category: 'es-diphthong', grapheme: 'ua', phoneme: '/wa/', examples: ['agua', 'cuatro', 'cuando', 'guardia'], hint: '"ua" — the "u" glides into "a".' },
  { id: 'es-ue', category: 'es-diphthong', grapheme: 'ue', phoneme: '/we/', examples: ['fuego', 'puerta', 'bueno', 'cuerpo'], hint: '"ue" — the "u" glides into "e".' },
  { id: 'es-uo', category: 'es-diphthong', grapheme: 'uo', phoneme: '/wo/', examples: ['cuota', 'antiguo', 'continuo', 'duo'], hint: '"uo" — the "u" glides into "o".' },

  // ─── Syllable rules ───────────────────────────────────────
  { id: 'es-hiatus-accent', category: 'es-syllable-rule', grapheme: '\u00ed/\u00fa', phoneme: '(hiatus)', examples: ['pa\u00eds', 'ma\u00edz', 'ba\u00fal', 'r\u00edo'], hint: 'An accent on "i" or "u" next to another vowel breaks the diphthong into two syllables.' },
];

export function findSpanishPatternById(id: string): SpanishPatternEntry | undefined {
  return spanishPatterns.find((p) => p.id === id);
}

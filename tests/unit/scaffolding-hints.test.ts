import { describe, it, expect } from 'vitest';
import {
  getScaffoldingHints,
  getSuffixDecompositionHint,
} from '../../src/features/practice/scaffolding-hints';
import type { DetectedPattern, Word } from '../../src/contracts/types';

// ─── Helpers ─────────────────────────────────────────────────

function suffixPattern(id: string, grapheme: string): DetectedPattern {
  return { id, category: 'suffix', grapheme, hint: `suffix hint for ${grapheme}` };
}

function makeWord(text: string, patterns: DetectedPattern[]): Word {
  return {
    id: `w-${text}`,
    listId: 'list-1',
    profileId: 'profile-1',
    text,
    syllables: [],
    phonemes: [],
    patterns,
    imageUrl: null,
    imageCached: false,
    createdAt: new Date('2026-03-01'),
  };
}

// ─── Suffix decomposition ────────────────────────────────────

describe('getSuffixDecompositionHint', () => {
  it('should decompose a clean -ing word', () => {
    const hint = getSuffixDecompositionHint('jumping', [suffixPattern('sx-ing', 'ing')]);
    expect(hint).toBe('jumping = jump + ing');
  });

  it('should decompose words with vowel-final bases (-y acts as vowel)', () => {
    expect(
      getSuffixDecompositionHint('playing', [suffixPattern('sx-ing', 'ing')]),
    ).toBe('playing = play + ing');
    expect(
      getSuffixDecompositionHint('trying', [suffixPattern('sx-ing', 'ing')]),
    ).toBe('trying = try + ing');
  });

  it('should decompose consonant-initial suffixes even after a final e', () => {
    expect(
      getSuffixDecompositionHint('careful', [suffixPattern('sx-ful', 'ful')]),
    ).toBe('careful = care + ful');
    expect(
      getSuffixDecompositionHint('kindness', [suffixPattern('sx-ness', 'ness')]),
    ).toBe('kindness = kind + ness');
  });

  it('should skip drop-e bases that cannot be verified ("making" is not mak + ing)', () => {
    expect(
      getSuffixDecompositionHint('making', [suffixPattern('sx-ing', 'ing')]),
    ).toBeNull();
    expect(
      getSuffixDecompositionHint('hoped', [suffixPattern('sx-ed-t', 'ed')]),
    ).toBeNull();
  });

  it('should skip doubled-consonant bases ("hopping" is not hopp + ing)', () => {
    expect(
      getSuffixDecompositionHint('hopping', [suffixPattern('sx-ing', 'ing')]),
    ).toBeNull();
    expect(
      getSuffixDecompositionHint('bigger', [suffixPattern('sx-er-comp', 'er')]),
    ).toBeNull();
  });

  it('should skip y→i bases ("happiness" is not happi + ness)', () => {
    expect(
      getSuffixDecompositionHint('happiness', [suffixPattern('sx-ness', 'ness')]),
    ).toBeNull();
  });

  it('should skip mis-split bases keeping a final e ("agreed" is not agre + ed)', () => {
    expect(
      getSuffixDecompositionHint('agreed', [suffixPattern('sx-ed-d', 'ed')]),
    ).toBeNull();
  });

  it('should ignore phonics-chunk suffixes that are not real morphology', () => {
    expect(
      getSuffixDecompositionHint('nation', [suffixPattern('sx-tion', 'tion')]),
    ).toBeNull();
    expect(
      getSuffixDecompositionHint('picture', [suffixPattern('sx-ture', 'ture')]),
    ).toBeNull();
  });

  it('should skip bases shorter than three letters', () => {
    expect(
      getSuffixDecompositionHint('using', [suffixPattern('sx-ing', 'ing')]),
    ).toBeNull();
  });

  it('should ignore non-suffix patterns', () => {
    const vowelTeam: DetectedPattern = {
      id: 'vt-ai',
      category: 'vowel-team',
      grapheme: 'ai',
      hint: 'ai makes the long A sound',
    };
    expect(getSuffixDecompositionHint('rain', [vowelTeam])).toBeNull();
  });
});

// ─── Combined scaffolding hints ──────────────────────────────

describe('getScaffoldingHints', () => {
  it('should put the decomposition first, then pattern hints, capped at 2', () => {
    const word = makeWord('jumping', [
      suffixPattern('sx-ing', 'ing'),
      {
        id: 'cb-mp',
        category: 'consonant-blend',
        grapheme: 'mp',
        hint: 'mp blends two sounds',
      },
    ]);

    expect(getScaffoldingHints(word)).toEqual([
      'jumping = jump + ing',
      'suffix hint for ing',
    ]);
  });

  it('should fall back to pattern hints when no decomposition applies', () => {
    const word = makeWord('making', [suffixPattern('sx-ing', 'ing')]);
    expect(getScaffoldingHints(word)).toEqual(['suffix hint for ing']);
  });

  it('should return no hints for words without patterns', () => {
    expect(getScaffoldingHints(makeWord('casa', []))).toEqual([]);
  });
});

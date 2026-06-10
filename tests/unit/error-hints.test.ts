import { describe, it, expect } from 'vitest';
import { getErrorTargetedHints } from '../../src/features/practice/error-hints';
import type { DetectedPattern } from '../../src/contracts/types';

// ─── Helpers ─────────────────────────────────────────────────

const vowelTeamAi: DetectedPattern = {
  id: 'vowel-team-ai',
  category: 'vowel-team',
  grapheme: 'ai',
  hint: 'The team "ai" makes the long A sound, like in rain.',
};

const silentEa: DetectedPattern = {
  id: 'silent-e-a',
  category: 'long-vowel-silent-e',
  grapheme: 'a_e',
  hint: 'The silent e at the end makes the a say its name.',
};

const suffixIng: DetectedPattern = {
  id: 'suffix-ing',
  category: 'suffix',
  grapheme: 'ing',
  hint: 'The ending "ing" means the action is happening now.',
};

const digraphCh: DetectedPattern = {
  id: 'digraph-ch',
  category: 'consonant-digraph',
  grapheme: 'ch',
  hint: 'The letters c and h team up to make the /ch/ sound.',
};

// ─── Tests ───────────────────────────────────────────────────

describe('getErrorTargetedHints', () => {
  it('returns the hint for a pattern overlapping a missing letter', () => {
    // "ran" vs "rain" — the missing i is inside the "ai" vowel team
    const hints = getErrorTargetedHints('ran', 'rain', [vowelTeamAi]);

    expect(hints).toHaveLength(1);
    expect(hints[0].grapheme).toBe('ai');
    expect(hints[0].hint).toContain('long A');
  });

  it('returns no hints when the error does not touch any pattern', () => {
    // "raim" vs "rain" — the n→m substitution is outside the "ai" team
    const hints = getErrorTargetedHints('raim', 'rain', [vowelTeamAi]);

    expect(hints).toEqual([]);
  });

  it('handles silent-e notation and formats the grapheme for display', () => {
    // "cak" vs "cake" — dropped silent e
    const hints = getErrorTargetedHints('cak', 'cake', [silentEa]);

    expect(hints).toHaveLength(1);
    expect(hints[0].grapheme).toBe('a·e');
  });

  it('matches suffix patterns at the end of the word', () => {
    // "jumpin" vs "jumping" — dropped g inside the "ing" suffix
    const hints = getErrorTargetedHints('jumpin', 'jumping', [suffixIng]);

    expect(hints).toHaveLength(1);
    expect(hints[0].grapheme).toBe('ing');
  });

  it('targets extra-letter errors via their insertion point', () => {
    // "rayin" vs "rain" — extra y inserted inside the vowel team
    const hints = getErrorTargetedHints('rayin', 'rain', [vowelTeamAi]);

    expect(hints).toHaveLength(1);
    expect(hints[0].grapheme).toBe('ai');
  });

  it('caps the number of hints at two', () => {
    // Completely wrong attempt touches every pattern in "chaining"
    const extraPattern: DetectedPattern = {
      id: 'vowel-team-ai-2',
      category: 'vowel-team',
      grapheme: 'ai',
      hint: 'Another ai hint.',
    };
    const hints = getErrorTargetedHints('xyz', 'chaining', [
      digraphCh,
      vowelTeamAi,
      suffixIng,
      extraPattern,
    ]);

    expect(hints).toHaveLength(2);
  });

  it('returns no hints for a correct attempt', () => {
    const hints = getErrorTargetedHints('rain', 'rain', [vowelTeamAi]);
    expect(hints).toEqual([]);
  });

  it('returns no hints when the word has no patterns', () => {
    const hints = getErrorTargetedHints('kat', 'cat', []);
    expect(hints).toEqual([]);
  });
});

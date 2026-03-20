import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sayAndSpell } from '../../src/features/learning/audio-helpers';
import {
  createSession,
  type SessionState,
} from '../../src/features/practice/session-controller';
import type { AudioManager } from '../../src/audio/manager';
import type { Word, WordStats, WordList } from '../../src/contracts/types';

// ─── Audio Helper Tests ─────────────────────────────────────

describe('sayAndSpell', () => {
  let mockAudioManager: AudioManager;

  beforeEach(() => {
    mockAudioManager = {
      sayWord: vi.fn<(word: string) => Promise<void>>().mockResolvedValue(undefined),
      sayWordSlowly: vi.fn<(word: string) => Promise<void>>().mockResolvedValue(undefined),
      spellWord: vi.fn<(word: string) => Promise<void>>().mockResolvedValue(undefined),
      sayThenSpell: vi.fn<(word: string) => Promise<void>>().mockResolvedValue(undefined),
      isBusy: vi.fn(() => false),
      runExclusive: vi.fn(async (action: () => Promise<void>) => {
        await action();
        return true;
      }),
      onBusyChange: vi.fn(() => () => {}),
    };
  });

  it('delegates to sayThenSpell via runExclusive', async () => {
    await sayAndSpell(mockAudioManager, 'cat');
    expect(mockAudioManager.runExclusive).toHaveBeenCalledTimes(1);
    expect(mockAudioManager.sayThenSpell).toHaveBeenCalledWith('cat');
  });

  it('handles single-character words', async () => {
    await sayAndSpell(mockAudioManager, 'a');
    expect(mockAudioManager.sayThenSpell).toHaveBeenCalledWith('a');
  });
});

// ─── Practice Gate Tests ─────────────────────────────────────

describe('createSession — mastered word filtering', () => {
  const profileId = 'profile-1';

  function makeWord(id: string, text: string, listId: string): Word {
    return {
      id,
      listId,
      profileId,
      text,
      phonemes: [],
      syllables: [],
      patterns: [],
      imageUrl: null,
      imageCached: false,
      createdAt: new Date('2026-03-01'),
    };
  }

  function makeStats(wordId: string): WordStats {
    return {
      id: `stats-${wordId}`,
      wordId,
      profileId,
      lastAsked: null,
      timesAsked: 0,
      timesWrong: 0,
      timesStruggledRight: 0,
      timesEasyRight: 0,
      consecutiveCorrect: 0,
      currentBucket: 'new' as const,
      nextReviewDate: new Date(),
      difficultyScore: 0.5,
      techniqueHistory: [],
    };
  }

  const activeList: WordList = {
    id: 'list-1',
    profileId,
    name: 'Test List',
    testDate: null,
    createdAt: new Date('2026-03-01'),
    source: 'manual',
    active: true,
    archived: false,
  };

  const allWords: Word[] = [
    makeWord('w1', 'cat', 'list-1'),
    makeWord('w2', 'dog', 'list-1'),
    makeWord('w3', 'fish', 'list-1'),
    makeWord('w4', 'bird', 'list-1'),
  ];

  const allStats: WordStats[] = allWords.map((w) => makeStats(w.id));

  it('filters words to only mastered IDs when provided', () => {
    const masteredIds = new Set(['w1', 'w3']);
    const session: SessionState = createSession(
      profileId,
      activeList,
      allWords,
      allStats,
      null,
      { sessionSize: 10 },
      masteredIds,
    );

    // Session should only contain words from the mastered set
    for (const word of session.words) {
      expect(masteredIds.has(word.id)).toBe(true);
    }
  });

  it('returns empty words when no mastered IDs match', () => {
    const masteredIds = new Set(['nonexistent-id']);
    const session: SessionState = createSession(
      profileId,
      activeList,
      allWords,
      allStats,
      null,
      { sessionSize: 10 },
      masteredIds,
    );

    expect(session.words).toHaveLength(0);
    expect(session.currentWord).toBeNull();
  });

  it('returns all words when masteredWordIds is not provided', () => {
    const session: SessionState = createSession(
      profileId,
      activeList,
      allWords,
      allStats,
      null,
      { sessionSize: 10 },
    );

    // Without the filter, all words should be available
    expect(session.words.length).toBeGreaterThan(0);
  });

  it('returns all words when masteredWordIds is undefined', () => {
    const session: SessionState = createSession(
      profileId,
      activeList,
      allWords,
      allStats,
      null,
      { sessionSize: 10 },
      undefined,
    );

    expect(session.words.length).toBeGreaterThan(0);
  });
});

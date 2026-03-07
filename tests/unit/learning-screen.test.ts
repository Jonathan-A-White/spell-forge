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
      speak: vi.fn<(word: string) => Promise<void>>().mockResolvedValue(undefined),
      speakSlowly: vi.fn<(word: string) => Promise<void>>().mockResolvedValue(undefined),
      speakChunks: vi.fn<(chunks: string[], delayMs?: number) => Promise<void>>().mockResolvedValue(undefined),
      registerProvider: vi.fn(),
    };
  });

  it('calls speak with the full word first', async () => {
    await sayAndSpell(mockAudioManager, 'cat');
    expect(mockAudioManager.speak).toHaveBeenCalledWith('cat');
    expect(mockAudioManager.speak).toHaveBeenCalledTimes(1);
  });

  it('calls speakChunks with individual letters and 400ms delay', async () => {
    await sayAndSpell(mockAudioManager, 'cat');
    expect(mockAudioManager.speakChunks).toHaveBeenCalledWith(
      ['c', 'a', 't'],
      400,
    );
    expect(mockAudioManager.speakChunks).toHaveBeenCalledTimes(1);
  });

  it('calls speak before speakChunks', async () => {
    const callOrder: string[] = [];
    vi.mocked(mockAudioManager.speak).mockImplementation(async () => {
      callOrder.push('speak');
    });
    vi.mocked(mockAudioManager.speakChunks).mockImplementation(async () => {
      callOrder.push('speakChunks');
    });

    await sayAndSpell(mockAudioManager, 'dog');
    expect(callOrder).toEqual(['speak', 'speakChunks']);
  });

  it('handles single-character words', async () => {
    await sayAndSpell(mockAudioManager, 'a');
    expect(mockAudioManager.speak).toHaveBeenCalledWith('a');
    expect(mockAudioManager.speakChunks).toHaveBeenCalledWith(['a'], 400);
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
      audioCustom: null,
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

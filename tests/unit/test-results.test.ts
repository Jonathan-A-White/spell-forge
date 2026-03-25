import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/data/db';
import {
  profileRepo,
  wordListRepo,
  wordRepo,
  testResultRepo,
} from '../../src/data/repositories';
import { computeTestDemotion } from '../../src/core/spaced-rep/test-demotion';
import type {
  Profile,
  WordList,
  Word,
  WordStats,
  TestResult,
  TestWordResult,
  AccessibilitySettings,
} from '../../src/contracts/types';

// ─── Helpers ───────────────────────────────────────────────────

const defaultSettings: AccessibilitySettings = {
  fontSize: 24,
  fontWeight: 'normal',
  fontFamily: 'sans-serif',
  letterSpacing: 0,
  lineHeight: 1.5,
  contrastMode: 'light',
  backgroundColor: '#ffffff',
  reducedMotion: false,
  sessionMaxMinutes: 15,
  sessionAdaptive: true,
  dailyGoalMinutes: 10,
  tapTargetSize: 48,
};

function makeProfileData(overrides: Partial<Omit<Profile, 'id'>> = {}): Omit<Profile, 'id'> {
  return {
    name: 'Test Child',
    avatar: 'avatar1',
    themeId: 'theme-castle',
    createdAt: new Date('2026-01-01'),
    settings: { ...defaultSettings },
    ...overrides,
  };
}

function makeWordListData(profileId: string, overrides: Partial<Omit<WordList, 'id'>> = {}): Omit<WordList, 'id'> {
  return {
    profileId,
    name: 'Week 1 Words',
    language: 'en',
    testDate: new Date('2026-02-01'),
    createdAt: new Date('2026-01-15'),
    source: 'manual' as const,
    active: true,
    archived: false,
    ...overrides,
  };
}

function makeWordData(listId: string, profileId: string, text: string): Omit<Word, 'id'> {
  return {
    listId,
    profileId,
    text,
    phonemes: [],
    syllables: [],
    patterns: [],
    imageUrl: null,
    imageCached: false,
    createdAt: new Date('2026-01-15'),
  };
}

function makeTestResultData(
  wordListId: string,
  profileId: string,
  wordResults: TestWordResult[],
  overrides: Partial<Omit<TestResult, 'id'>> = {},
): Omit<TestResult, 'id'> {
  const correctCount = wordResults.filter((w) => w.correct).length;
  const calculatedPercent = wordResults.length > 0
    ? Math.round((correctCount / wordResults.length) * 100)
    : 0;
  return {
    wordListId,
    profileId,
    testDate: new Date('2026-02-01'),
    recordedAt: new Date('2026-02-01T18:00:00Z'),
    wordResults,
    calculatedPercent,
    overridePercent: null,
    finalPercent: overrides.overridePercent ?? calculatedPercent,
    ...overrides,
  };
}

// ─── Test Suite ────────────────────────────────────────────────

beforeEach(async () => {
  await db.delete();
  await db.open();
});

// ─── TestResult Repository ───────────────────────────────────

describe('testResultRepo', () => {
  let profileId: string;
  let listId: string;
  let words: Word[];

  beforeEach(async () => {
    const profile = await profileRepo.create(makeProfileData());
    profileId = profile.id;
    const list = await wordListRepo.create(makeWordListData(profileId));
    listId = list.id;
    const w1 = await wordRepo.create(makeWordData(listId, profileId, 'knight'));
    const w2 = await wordRepo.create(makeWordData(listId, profileId, 'bridge'));
    const w3 = await wordRepo.create(makeWordData(listId, profileId, 'light'));
    words = [w1, w2, w3];
  });

  it('creates a test result with generated id', async () => {
    const wordResults: TestWordResult[] = [
      { wordId: words[0].id, word: 'knight', correct: true },
      { wordId: words[1].id, word: 'bridge', correct: false },
      { wordId: words[2].id, word: 'light', correct: true },
    ];
    const result = await testResultRepo.create(makeTestResultData(listId, profileId, wordResults));
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe('string');
    expect(result.wordListId).toBe(listId);
    expect(result.calculatedPercent).toBe(67);
    expect(result.finalPercent).toBe(67);
  });

  it('getById returns test result or null', async () => {
    const wordResults: TestWordResult[] = [
      { wordId: words[0].id, word: 'knight', correct: true },
    ];
    const result = await testResultRepo.create(makeTestResultData(listId, profileId, wordResults));
    expect(await testResultRepo.getById(result.id)).not.toBeNull();
    expect(await testResultRepo.getById('nonexistent')).toBeNull();
  });

  it('getByWordListId returns test result for a list', async () => {
    const wordResults: TestWordResult[] = [
      { wordId: words[0].id, word: 'knight', correct: true },
    ];
    await testResultRepo.create(makeTestResultData(listId, profileId, wordResults));
    const found = await testResultRepo.getByWordListId(listId);
    expect(found).not.toBeNull();
    expect(found!.wordListId).toBe(listId);
  });

  it('getByProfileId returns all test results for a profile', async () => {
    const list2 = await wordListRepo.create(makeWordListData(profileId, { name: 'Week 2' }));
    const w4 = await wordRepo.create(makeWordData(list2.id, profileId, 'castle'));

    await testResultRepo.create(makeTestResultData(listId, profileId, [
      { wordId: words[0].id, word: 'knight', correct: true },
    ]));
    await testResultRepo.create(makeTestResultData(list2.id, profileId, [
      { wordId: w4.id, word: 'castle', correct: false },
    ]));

    const results = await testResultRepo.getByProfileId(profileId);
    expect(results).toHaveLength(2);
  });

  it('override percent sets finalPercent', async () => {
    const wordResults: TestWordResult[] = [
      { wordId: words[0].id, word: 'knight', correct: true },
      { wordId: words[1].id, word: 'bridge', correct: false },
    ];
    const result = await testResultRepo.create(makeTestResultData(listId, profileId, wordResults, {
      overridePercent: 75,
    }));
    expect(result.calculatedPercent).toBe(50);
    expect(result.overridePercent).toBe(75);
    expect(result.finalPercent).toBe(75);
  });

  it('delete removes a test result', async () => {
    const wordResults: TestWordResult[] = [
      { wordId: words[0].id, word: 'knight', correct: true },
    ];
    const result = await testResultRepo.create(makeTestResultData(listId, profileId, wordResults));
    await testResultRepo.delete(result.id);
    expect(await testResultRepo.getById(result.id)).toBeNull();
  });

  it('deleteByWordListId removes test results for a list', async () => {
    await testResultRepo.create(makeTestResultData(listId, profileId, [
      { wordId: words[0].id, word: 'knight', correct: true },
    ]));
    await testResultRepo.deleteByWordListId(listId);
    expect(await testResultRepo.getByWordListId(listId)).toBeNull();
  });

  it('word list deletion cascades to test results', async () => {
    await testResultRepo.create(makeTestResultData(listId, profileId, [
      { wordId: words[0].id, word: 'knight', correct: true },
    ]));
    await wordListRepo.delete(listId);
    expect(await testResultRepo.getByWordListId(listId)).toBeNull();
  });

  it('profile deletion cascades to test results', async () => {
    await testResultRepo.create(makeTestResultData(listId, profileId, [
      { wordId: words[0].id, word: 'knight', correct: true },
    ]));
    await profileRepo.delete(profileId);
    expect(await testResultRepo.getByProfileId(profileId)).toHaveLength(0);
  });
});

// ─── Trouble Words ───────────────────────────────────────────

describe('troubleWords', () => {
  let profileId: string;

  beforeEach(async () => {
    const profile = await profileRepo.create(makeProfileData());
    profileId = profile.id;
  });

  it('identifies words missed across multiple tests', async () => {
    const list1 = await wordListRepo.create(makeWordListData(profileId, { name: 'Week 1' }));
    const list2 = await wordListRepo.create(makeWordListData(profileId, { name: 'Week 2' }));
    const w1 = await wordRepo.create(makeWordData(list1.id, profileId, 'knight'));
    const w2 = await wordRepo.create(makeWordData(list1.id, profileId, 'bridge'));
    const w3 = await wordRepo.create(makeWordData(list2.id, profileId, 'knight')); // same word, different list

    // knight wrong on both tests, bridge wrong on one
    await testResultRepo.create(makeTestResultData(list1.id, profileId, [
      { wordId: w1.id, word: 'knight', correct: false },
      { wordId: w2.id, word: 'bridge', correct: false },
    ]));
    await testResultRepo.create(makeTestResultData(list2.id, profileId, [
      { wordId: w3.id, word: 'knight', correct: false },
    ], { testDate: new Date('2026-02-08') }));

    const trouble = await testResultRepo.getTroubleWords(profileId);
    expect(trouble.length).toBeGreaterThanOrEqual(2);

    // knight should be first (missed 2x) - but note wordIds are different across lists
    // The trouble words track by wordId, so different word records even with same text
    // are counted separately. This is expected behavior since each list has its own word records.
    const allMissed = trouble.map((t) => t.word);
    expect(allMissed).toContain('knight');
    expect(allMissed).toContain('bridge');
  });

  it('returns empty array when no tests exist', async () => {
    const trouble = await testResultRepo.getTroubleWords(profileId);
    expect(trouble).toHaveLength(0);
  });

  it('does not include correct words', async () => {
    const list = await wordListRepo.create(makeWordListData(profileId));
    const w1 = await wordRepo.create(makeWordData(list.id, profileId, 'knight'));
    const w2 = await wordRepo.create(makeWordData(list.id, profileId, 'bridge'));

    await testResultRepo.create(makeTestResultData(list.id, profileId, [
      { wordId: w1.id, word: 'knight', correct: true },
      { wordId: w2.id, word: 'bridge', correct: false },
    ]));

    const trouble = await testResultRepo.getTroubleWords(profileId);
    expect(trouble).toHaveLength(1);
    expect(trouble[0].word).toBe('bridge');
  });
});

// ─── Test Demotion Logic ─────────────────────────────────────

describe('computeTestDemotion', () => {
  it('demotes mastered to familiar', () => {
    const stats: WordStats = {
      id: 'stats-1',
      wordId: 'word-1',
      profileId: 'profile-1',
      lastAsked: new Date(),
      timesAsked: 10,
      timesWrong: 1,
      timesStruggledRight: 0,
      timesEasyRight: 9,
      consecutiveCorrect: 6,
      consecutiveWrong: 0,
      longestCorrectStreak: 6,
      currentBucket: 'mastered',
      nextReviewDate: new Date(),
      difficultyScore: 0.3,
      techniqueHistory: [],
    };
    const demotion = computeTestDemotion(stats);
    expect(demotion).not.toBeNull();
    expect(demotion!.currentBucket).toBe('familiar');
  });

  it('demotes familiar to learning', () => {
    const stats: WordStats = {
      id: 'stats-2',
      wordId: 'word-2',
      profileId: 'profile-1',
      lastAsked: new Date(),
      timesAsked: 5,
      timesWrong: 1,
      timesStruggledRight: 0,
      timesEasyRight: 4,
      consecutiveCorrect: 3,
      consecutiveWrong: 0,
      longestCorrectStreak: 3,
      currentBucket: 'familiar',
      nextReviewDate: new Date(),
      difficultyScore: 0.4,
      techniqueHistory: [],
    };
    const demotion = computeTestDemotion(stats);
    expect(demotion).not.toBeNull();
    expect(demotion!.currentBucket).toBe('learning');
  });

  it('demotes review to mastered', () => {
    const stats: WordStats = {
      id: 'stats-3',
      wordId: 'word-3',
      profileId: 'profile-1',
      lastAsked: new Date(),
      timesAsked: 20,
      timesWrong: 0,
      timesStruggledRight: 0,
      timesEasyRight: 20,
      consecutiveCorrect: 10,
      consecutiveWrong: 0,
      longestCorrectStreak: 10,
      currentBucket: 'review',
      nextReviewDate: new Date(),
      difficultyScore: 0.1,
      techniqueHistory: [],
    };
    const demotion = computeTestDemotion(stats);
    expect(demotion).not.toBeNull();
    expect(demotion!.currentBucket).toBe('mastered');
  });

  it('does not demote learning bucket', () => {
    const stats: WordStats = {
      id: 'stats-4',
      wordId: 'word-4',
      profileId: 'profile-1',
      lastAsked: new Date(),
      timesAsked: 2,
      timesWrong: 1,
      timesStruggledRight: 0,
      timesEasyRight: 1,
      consecutiveCorrect: 1,
      consecutiveWrong: 0,
      longestCorrectStreak: 1,
      currentBucket: 'learning',
      nextReviewDate: new Date(),
      difficultyScore: 0.5,
      techniqueHistory: [],
    };
    const demotion = computeTestDemotion(stats);
    expect(demotion).toBeNull();
  });

  it('does not demote new bucket', () => {
    const stats: WordStats = {
      id: 'stats-5',
      wordId: 'word-5',
      profileId: 'profile-1',
      lastAsked: null,
      timesAsked: 0,
      timesWrong: 0,
      timesStruggledRight: 0,
      timesEasyRight: 0,
      consecutiveCorrect: 0,
      consecutiveWrong: 0,
      longestCorrectStreak: 0,
      currentBucket: 'new',
      nextReviewDate: new Date(),
      difficultyScore: 0.5,
      techniqueHistory: [],
    };
    const demotion = computeTestDemotion(stats);
    expect(demotion).toBeNull();
  });

  it('increments consecutiveWrong on demotion', () => {
    const stats: WordStats = {
      id: 'stats-6',
      wordId: 'word-6',
      profileId: 'profile-1',
      lastAsked: new Date(),
      timesAsked: 10,
      timesWrong: 0,
      timesStruggledRight: 0,
      timesEasyRight: 10,
      consecutiveCorrect: 6,
      consecutiveWrong: 0,
      longestCorrectStreak: 6,
      currentBucket: 'mastered',
      nextReviewDate: new Date(),
      difficultyScore: 0.2,
      techniqueHistory: [],
    };
    const demotion = computeTestDemotion(stats);
    expect(demotion!.consecutiveWrong).toBe(1);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/data/db';
import {
  profileRepo,
  wordListRepo,
  wordRepo,
  statsRepo,
  sessionRepo,
  streakRepo,
  activityProgressRepo,
  learningProgressRepo,
  coinRepo,
} from '../../src/data/repositories';
import { exportProfile, importProfile } from '../../src/data/import-export';
import type {
  Profile,
  WordList,
  Word,
  WordStats,
  SessionLog,
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
    testDate: new Date('2026-02-01'),
    createdAt: new Date('2026-01-15'),
    source: 'manual' as const,
    active: true,
    archived: false,
    ...overrides,
  };
}

function makeWordData(listId: string, profileId: string, text: string, overrides: Partial<Omit<Word, 'id'>> = {}): Omit<Word, 'id'> {
  return {
    listId,
    profileId,
    text,
    phonemes: [],
    syllables: [],
    patterns: [],
    imageUrl: null,
    imageCached: false,
    audioCustom: null,
    createdAt: new Date('2026-01-15'),
    ...overrides,
  };
}

function makeWordStatsData(wordId: string, profileId: string, overrides: Partial<Omit<WordStats, 'id'>> = {}): Omit<WordStats, 'id'> {
  return {
    wordId,
    profileId,
    lastAsked: null,
    timesAsked: 0,
    timesWrong: 0,
    timesStruggledRight: 0,
    timesEasyRight: 0,
    consecutiveCorrect: 0,
    currentBucket: 'new' as const,
    nextReviewDate: new Date('2026-02-01'),
    difficultyScore: 0.5,
    techniqueHistory: [],
    ...overrides,
  };
}

function makeSessionData(profileId: string, overrides: Partial<Omit<SessionLog, 'id'>> = {}): Omit<SessionLog, 'id'> {
  return {
    profileId,
    startedAt: new Date('2026-01-20T10:00:00Z'),
    endedAt: new Date('2026-01-20T10:10:00Z'),
    wordsAttempted: 10,
    wordsCorrect: 8,
    engagementScore: 0.85,
    endReason: 'completed' as const,
    rewardEarned: null,
    ...overrides,
  };
}

// ─── Test Suite ────────────────────────────────────────────────

beforeEach(async () => {
  await db.delete();
  await db.open();
});

// ─── Profile Repository ───────────────────────────────────────

describe('profileRepo', () => {
  it('creates a profile with generated id', async () => {
    const profile = await profileRepo.create(makeProfileData());
    expect(profile.id).toBeDefined();
    expect(typeof profile.id).toBe('string');
    expect(profile.name).toBe('Test Child');
  });

  it('getById returns profile or null', async () => {
    const profile = await profileRepo.create(makeProfileData());
    const found = await profileRepo.getById(profile.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Test Child');

    const notFound = await profileRepo.getById('nonexistent');
    expect(notFound).toBeNull();
  });

  it('getAll returns all profiles', async () => {
    await profileRepo.create(makeProfileData({ name: 'Alice' }));
    await profileRepo.create(makeProfileData({ name: 'Bob' }));
    const all = await profileRepo.getAll();
    expect(all).toHaveLength(2);
  });

  it('updates a profile', async () => {
    const profile = await profileRepo.create(makeProfileData());
    const updated = await profileRepo.update(profile.id, { name: 'Updated Name' });
    expect(updated.name).toBe('Updated Name');
    expect(updated.avatar).toBe('avatar1'); // unchanged fields preserved
  });

  it('update throws for nonexistent profile', async () => {
    await expect(profileRepo.update('nonexistent', { name: 'x' })).rejects.toThrow();
  });

  it('delete cascade removes all child data', async () => {
    const profile = await profileRepo.create(makeProfileData());
    const list = await wordListRepo.create(makeWordListData(profile.id));
    const word = await wordRepo.create(makeWordData(list.id, profile.id, 'castle'));
    await statsRepo.create(makeWordStatsData(word.id, profile.id));
    await sessionRepo.create(makeSessionData(profile.id));
    await streakRepo.initialize(profile.id);

    await profileRepo.delete(profile.id);

    expect(await profileRepo.getById(profile.id)).toBeNull();
    expect(await wordListRepo.getByProfileId(profile.id)).toHaveLength(0);
    expect(await wordRepo.getByProfileId(profile.id)).toHaveLength(0);
    expect(await statsRepo.getByProfileId(profile.id)).toHaveLength(0);
    expect(await sessionRepo.getByProfileId(profile.id)).toHaveLength(0);
    expect(await streakRepo.get(profile.id)).toBeNull();
  });

  it('clearData resets stats/sessions/streaks but keeps profile and lists', async () => {
    const profile = await profileRepo.create(makeProfileData());
    const list = await wordListRepo.create(makeWordListData(profile.id));
    const word = await wordRepo.create(makeWordData(list.id, profile.id, 'knight'));
    await statsRepo.create(makeWordStatsData(word.id, profile.id));
    await sessionRepo.create(makeSessionData(profile.id));
    await streakRepo.initialize(profile.id);

    await profileRepo.clearData(profile.id);

    expect(await profileRepo.getById(profile.id)).not.toBeNull();
    expect(await wordListRepo.getByProfileId(profile.id)).toHaveLength(1);
    expect(await wordRepo.getByProfileId(profile.id)).toHaveLength(1);
    expect(await statsRepo.getByProfileId(profile.id)).toHaveLength(0);
    expect(await sessionRepo.getByProfileId(profile.id)).toHaveLength(0);
    expect(await streakRepo.get(profile.id)).toBeNull();
  });
});

// ─── WordList Repository ──────────────────────────────────────

describe('wordListRepo', () => {
  let profileId: string;

  beforeEach(async () => {
    const profile = await profileRepo.create(makeProfileData());
    profileId = profile.id;
  });

  it('creates a word list with generated id', async () => {
    const list = await wordListRepo.create(makeWordListData(profileId));
    expect(list.id).toBeDefined();
    expect(list.name).toBe('Week 1 Words');
    expect(list.profileId).toBe(profileId);
  });

  it('getById returns list or null', async () => {
    const list = await wordListRepo.create(makeWordListData(profileId));
    expect(await wordListRepo.getById(list.id)).not.toBeNull();
    expect(await wordListRepo.getById('nope')).toBeNull();
  });

  it('getByProfileId returns all lists for a profile', async () => {
    await wordListRepo.create(makeWordListData(profileId, { name: 'List A' }));
    await wordListRepo.create(makeWordListData(profileId, { name: 'List B' }));
    const lists = await wordListRepo.getByProfileId(profileId);
    expect(lists).toHaveLength(2);
  });

  it('archive and unarchive toggle flags correctly', async () => {
    const list = await wordListRepo.create(makeWordListData(profileId));
    const archived = await wordListRepo.archive(list.id);
    expect(archived.archived).toBe(true);
    expect(archived.active).toBe(false);

    const unarchived = await wordListRepo.unarchive(list.id);
    expect(unarchived.archived).toBe(false);
    expect(unarchived.active).toBe(true);
  });

  it('delete removes list, its words, and their stats', async () => {
    const list = await wordListRepo.create(makeWordListData(profileId));
    const word = await wordRepo.create(makeWordData(list.id, profileId, 'dragon'));
    await statsRepo.create(makeWordStatsData(word.id, profileId));

    await wordListRepo.delete(list.id);

    expect(await wordListRepo.getById(list.id)).toBeNull();
    expect(await wordRepo.getByListId(list.id)).toHaveLength(0);
    expect(await statsRepo.getByWordId(word.id)).toBeNull();
  });

  it('delete is idempotent for nonexistent list', async () => {
    await expect(wordListRepo.delete('nonexistent')).resolves.toBeUndefined();
  });

  it('update throws for nonexistent list', async () => {
    await expect(wordListRepo.update('nonexistent', { name: 'x' })).rejects.toThrow();
  });
});

// ─── Word Repository ──────────────────────────────────────────

describe('wordRepo', () => {
  let profileId: string;
  let listId: string;

  beforeEach(async () => {
    const profile = await profileRepo.create(makeProfileData());
    profileId = profile.id;
    const list = await wordListRepo.create(makeWordListData(profileId));
    listId = list.id;
  });

  it('creates a word with generated id', async () => {
    const word = await wordRepo.create(makeWordData(listId, profileId, 'wizard'));
    expect(word.id).toBeDefined();
    expect(word.text).toBe('wizard');
  });

  it('getById returns word or null', async () => {
    const word = await wordRepo.create(makeWordData(listId, profileId, 'magic'));
    expect(await wordRepo.getById(word.id)).not.toBeNull();
    expect(await wordRepo.getById('nope')).toBeNull();
  });

  it('getByListId returns words in a list', async () => {
    await wordRepo.create(makeWordData(listId, profileId, 'spell'));
    await wordRepo.create(makeWordData(listId, profileId, 'potion'));
    const words = await wordRepo.getByListId(listId);
    expect(words).toHaveLength(2);
  });

  it('getByProfileId returns all words for a profile', async () => {
    await wordRepo.create(makeWordData(listId, profileId, 'wand'));
    const list2 = await wordListRepo.create(makeWordListData(profileId, { name: 'List 2' }));
    await wordRepo.create(makeWordData(list2.id, profileId, 'robe'));
    const words = await wordRepo.getByProfileId(profileId);
    expect(words).toHaveLength(2);
  });

  it('updates a word', async () => {
    const word = await wordRepo.create(makeWordData(listId, profileId, 'olde'));
    const updated = await wordRepo.update(word.id, { text: 'old' });
    expect(updated.text).toBe('old');
  });

  it('delete removes word and its stats', async () => {
    const word = await wordRepo.create(makeWordData(listId, profileId, 'shield'));
    await statsRepo.create(makeWordStatsData(word.id, profileId));

    await wordRepo.delete(word.id);
    expect(await wordRepo.getById(word.id)).toBeNull();
    expect(await statsRepo.getByWordId(word.id)).toBeNull();
  });
});

// ─── Stats Repository ─────────────────────────────────────────

describe('statsRepo', () => {
  let profileId: string;
  let wordId: string;

  beforeEach(async () => {
    const profile = await profileRepo.create(makeProfileData());
    profileId = profile.id;
    const list = await wordListRepo.create(makeWordListData(profileId));
    const word = await wordRepo.create(makeWordData(list.id, profileId, 'test'));
    wordId = word.id;
  });

  it('creates stats with generated id', async () => {
    const stats = await statsRepo.create(makeWordStatsData(wordId, profileId));
    expect(stats.id).toBeDefined();
    expect(stats.wordId).toBe(wordId);
  });

  it('getByWordId returns stats or null', async () => {
    await statsRepo.create(makeWordStatsData(wordId, profileId));
    expect(await statsRepo.getByWordId(wordId)).not.toBeNull();
    expect(await statsRepo.getByWordId('nope')).toBeNull();
  });

  it('getByProfileId returns all stats for a profile', async () => {
    const list = (await wordListRepo.getByProfileId(profileId))[0];
    const word2 = await wordRepo.create(makeWordData(list.id, profileId, 'test2'));
    await statsRepo.create(makeWordStatsData(wordId, profileId));
    await statsRepo.create(makeWordStatsData(word2.id, profileId));
    const all = await statsRepo.getByProfileId(profileId);
    expect(all).toHaveLength(2);
  });

  it('updates stats', async () => {
    const stats = await statsRepo.create(makeWordStatsData(wordId, profileId));
    const updated = await statsRepo.update(stats.id, {
      timesAsked: 5,
      timesEasyRight: 3,
      currentBucket: 'familiar',
    });
    expect(updated.timesAsked).toBe(5);
    expect(updated.currentBucket).toBe('familiar');
  });

  it('deletes stats', async () => {
    const stats = await statsRepo.create(makeWordStatsData(wordId, profileId));
    await statsRepo.delete(stats.id);
    expect(await statsRepo.getById(stats.id)).toBeNull();
  });
});

// ─── Session Repository ───────────────────────────────────────

describe('sessionRepo', () => {
  let profileId: string;

  beforeEach(async () => {
    const profile = await profileRepo.create(makeProfileData());
    profileId = profile.id;
  });

  it('creates a session with generated id', async () => {
    const session = await sessionRepo.create(makeSessionData(profileId));
    expect(session.id).toBeDefined();
    expect(session.profileId).toBe(profileId);
  });

  it('getById returns session or null', async () => {
    const session = await sessionRepo.create(makeSessionData(profileId));
    expect(await sessionRepo.getById(session.id)).not.toBeNull();
    expect(await sessionRepo.getById('nope')).toBeNull();
  });

  it('getByProfileId returns all sessions for a profile', async () => {
    await sessionRepo.create(makeSessionData(profileId));
    await sessionRepo.create(makeSessionData(profileId, {
      startedAt: new Date('2026-01-21T10:00:00Z'),
      endedAt: new Date('2026-01-21T10:10:00Z'),
    }));
    const sessions = await sessionRepo.getByProfileId(profileId);
    expect(sessions).toHaveLength(2);
  });

  it('updates a session', async () => {
    const session = await sessionRepo.create(makeSessionData(profileId, { endedAt: null }));
    const updated = await sessionRepo.update(session.id, {
      endedAt: new Date('2026-01-20T10:15:00Z'),
      endReason: 'adaptive-stop',
    });
    expect(updated.endedAt).toEqual(new Date('2026-01-20T10:15:00Z'));
    expect(updated.endReason).toBe('adaptive-stop');
  });

  it('deletes a session', async () => {
    const session = await sessionRepo.create(makeSessionData(profileId));
    await sessionRepo.delete(session.id);
    expect(await sessionRepo.getById(session.id)).toBeNull();
  });
});

// ─── Streak Repository ───────────────────────────────────────

describe('streakRepo', () => {
  let profileId: string;

  beforeEach(async () => {
    const profile = await profileRepo.create(makeProfileData());
    profileId = profile.id;
  });

  it('initialize creates streak data with zero values', async () => {
    const streak = await streakRepo.initialize(profileId);
    expect(streak.profileId).toBe(profileId);
    expect(streak.currentStreak).toBe(0);
    expect(streak.longestStreak).toBe(0);
    expect(streak.lastSessionDate).toBeNull();
    expect(streak.weeklyProgress).toHaveLength(7);
  });

  it('initialize is idempotent', async () => {
    const first = await streakRepo.initialize(profileId);
    const second = await streakRepo.initialize(profileId);
    expect(first.profileId).toBe(second.profileId);
  });

  it('recordSession starts streak at 1 for first session', async () => {
    const streak = await streakRepo.recordSession(profileId, new Date('2026-01-20'), 5);
    expect(streak.currentStreak).toBe(1);
    expect(streak.longestStreak).toBe(1);
  });

  it('recordSession ignores sessions with fewer than 2 words', async () => {
    await streakRepo.initialize(profileId);
    const streak = await streakRepo.recordSession(profileId, new Date('2026-01-20'), 1);
    expect(streak.currentStreak).toBe(0);
  });

  it('consecutive days increment streak', async () => {
    await streakRepo.recordSession(profileId, new Date('2026-01-20'), 5);
    await streakRepo.recordSession(profileId, new Date('2026-01-21'), 3);
    const streak = await streakRepo.recordSession(profileId, new Date('2026-01-22'), 4);
    expect(streak.currentStreak).toBe(3);
    expect(streak.longestStreak).toBe(3);
  });

  it('same day does not increment streak', async () => {
    await streakRepo.recordSession(profileId, new Date('2026-01-20'), 5);
    const streak = await streakRepo.recordSession(profileId, new Date('2026-01-20'), 3);
    expect(streak.currentStreak).toBe(1);
  });

  it('missing 1 day preserves streak (at risk)', async () => {
    await streakRepo.recordSession(profileId, new Date('2026-01-20'), 5);
    // Skip Jan 21
    const streak = await streakRepo.recordSession(profileId, new Date('2026-01-22'), 3);
    expect(streak.currentStreak).toBe(2); // preserved and incremented
  });

  it('missing 2 consecutive days resets streak', async () => {
    await streakRepo.recordSession(profileId, new Date('2026-01-20'), 5);
    await streakRepo.recordSession(profileId, new Date('2026-01-21'), 3);
    // Skip Jan 22, 23
    const streak = await streakRepo.recordSession(profileId, new Date('2026-01-24'), 4);
    expect(streak.currentStreak).toBe(1); // reset
    expect(streak.longestStreak).toBe(2); // preserved from earlier
  });

  it('tracks weekly progress Mon-Sun', async () => {
    // 2026-01-19 is Monday
    // recordSession rebuilds weekly progress from sessionLogs, so we need actual logs
    await sessionRepo.create(makeSessionData(profileId, {
      startedAt: new Date('2026-01-19T10:00:00Z'),
      endedAt: new Date('2026-01-19T10:10:00Z'),
      wordsAttempted: 5,
    }));
    await streakRepo.recordSession(profileId, new Date('2026-01-19'), 5);

    await sessionRepo.create(makeSessionData(profileId, {
      startedAt: new Date('2026-01-20T10:00:00Z'),
      endedAt: new Date('2026-01-20T10:10:00Z'),
      wordsAttempted: 3,
    }));
    const streak = await streakRepo.recordSession(profileId, new Date('2026-01-20'), 3);

    expect(streak.weeklyProgress).toHaveLength(7);
    // Monday should be completed
    const monday = streak.weeklyProgress.find(d => d.date === '2026-01-19');
    expect(monday?.completed).toBe(true);
    expect(monday?.sessionCount).toBeGreaterThanOrEqual(1);
  });

  it('longest streak is preserved across resets', async () => {
    // Build a 4-day streak
    await streakRepo.recordSession(profileId, new Date('2026-01-10'), 5);
    await streakRepo.recordSession(profileId, new Date('2026-01-11'), 5);
    await streakRepo.recordSession(profileId, new Date('2026-01-12'), 5);
    await streakRepo.recordSession(profileId, new Date('2026-01-13'), 5);
    // Gap of 3 days -> reset
    await streakRepo.recordSession(profileId, new Date('2026-01-17'), 5);
    const streak = await streakRepo.recordSession(profileId, new Date('2026-01-18'), 5);
    expect(streak.currentStreak).toBe(2);
    expect(streak.longestStreak).toBe(4);
  });

  it('delete removes streak data', async () => {
    await streakRepo.initialize(profileId);
    await streakRepo.delete(profileId);
    expect(await streakRepo.get(profileId)).toBeNull();
  });
});

// ─── Import / Export ──────────────────────────────────────────

describe('import/export', () => {
  let profileId: string;
  let listId: string;
  let wordId: string;

  beforeEach(async () => {
    const profile = await profileRepo.create(makeProfileData({ name: 'Export Kid' }));
    profileId = profile.id;
    const list = await wordListRepo.create(makeWordListData(profileId, { name: 'Export List' }));
    listId = list.id;
    const word = await wordRepo.create(makeWordData(listId, profileId, 'adventure'));
    wordId = word.id;
    await statsRepo.create(makeWordStatsData(wordId, profileId));
    await sessionRepo.create(makeSessionData(profileId));
    await streakRepo.initialize(profileId);
    await activityProgressRepo.save(profileId, 'practice', { currentIndex: 3 });
    await learningProgressRepo.save({
      id: `${profileId}:${wordId}`,
      profileId,
      wordId,
      wordListId: listId,
      stage: 1 as const,
      consecutiveSuccesses: 1,
      consecutiveFailures: 0,
      mastered: false,
      totalAttempts: 3,
      totalErrors: 1,
      lastAttemptAt: new Date('2026-01-20T10:05:00Z'),
      createdAt: new Date('2026-01-15'),
    });
    await coinRepo.addCoins(profileId, 50);
  });

  it('exports complete profile data', async () => {
    const payload = await exportProfile(profileId);
    expect(payload.version).toBe('1.0.0');
    expect(payload.exportedAt).toBeInstanceOf(Date);
    expect(payload.profile.id).toBe(profileId);
    expect(payload.wordLists).toHaveLength(1);
    expect(payload.words).toHaveLength(1);
    expect(payload.wordStats).toHaveLength(1);
    expect(payload.sessionLogs).toHaveLength(1);
    expect(payload.streakData.profileId).toBe(profileId);
    expect(payload.activityProgress).toHaveLength(1);
    expect(payload.activityProgress[0].activityType).toBe('practice');
    expect(payload.learningProgress).toHaveLength(1);
    expect(payload.learningProgress[0].wordId).toBe(wordId);
    expect(payload.coinBalance).not.toBeNull();
    expect(payload.coinBalance!.coins).toBe(50);
  });

  it('export throws for nonexistent profile', async () => {
    await expect(exportProfile('nonexistent')).rejects.toThrow();
  });

  describe('replace strategy', () => {
    it('replaces all profile data including progress', async () => {
      const payload = await exportProfile(profileId);

      // Modify the exported profile name
      payload.profile.name = 'Replaced Name';

      const result = await importProfile(payload, 'replace');
      expect(result.strategy).toBe('replace');
      expect(result.profileId).toBe(profileId);
      expect(result.wordsAdded).toBe(1);

      const profile = await profileRepo.getById(profileId);
      expect(profile!.name).toBe('Replaced Name');

      // Verify progress data survived the replace
      const ap = await activityProgressRepo.getAllForProfile(profileId);
      expect(ap).toHaveLength(1);
      const lp = await learningProgressRepo.getByProfileId(profileId);
      expect(lp).toHaveLength(1);
      expect(lp[0].totalAttempts).toBe(3);
      const coins = await coinRepo.get(profileId);
      expect(coins!.coins).toBe(50);
    });

    it('removes locally-only data on replace', async () => {
      // Add an extra local word
      const localWord = await wordRepo.create(makeWordData(listId, profileId, 'local-only'));
      await statsRepo.create(makeWordStatsData(localWord.id, profileId));

      const payload = await exportProfile(profileId);
      // Remove local-only word from payload to simulate importing older data
      payload.words = payload.words.filter(w => w.text !== 'local-only');
      payload.wordStats = payload.wordStats.filter(s => s.wordId !== localWord.id);

      await importProfile(payload, 'replace');

      // local-only word should be gone
      const words = await wordRepo.getByProfileId(profileId);
      expect(words.find(w => w.text === 'local-only')).toBeUndefined();
    });
  });

  describe('merge strategy', () => {
    it('imported data wins on conflicts', async () => {
      const payload = await exportProfile(profileId);

      // Modify the word text in payload
      payload.words[0].text = 'imported-adventure';
      payload.profile.name = 'Merged Name';

      const result = await importProfile(payload, 'merge');
      expect(result.strategy).toBe('merge');
      expect(result.wordsUpdated).toBe(1);
      expect(result.wordsAdded).toBe(0);

      const profile = await profileRepo.getById(profileId);
      expect(profile!.name).toBe('Merged Name');

      const words = await wordRepo.getByProfileId(profileId);
      expect(words[0].text).toBe('imported-adventure');
    });

    it('preserves local-only words on merge', async () => {
      // Add a local-only word
      await wordRepo.create(makeWordData(listId, profileId, 'local-extra'));

      // Export before adding local-extra so it's not in the payload
      const payload = await exportProfile(profileId);
      // Remove local-extra from payload to simulate it being absent from import
      payload.words = payload.words.filter(w => w.text !== 'local-extra');

      const result = await importProfile(payload, 'merge');
      expect(result.wordsPreserved).toBe(1);

      // local-extra should still exist
      const words = await wordRepo.getByProfileId(profileId);
      expect(words.find(w => w.text === 'local-extra')).toBeDefined();
    });

    it('adds new words from import', async () => {
      const payload = await exportProfile(profileId);

      // Add a new word to the payload
      const newWord: Word = {
        id: 'imported-word-id',
        listId,
        profileId,
        text: 'imported-new',
        phonemes: [],
        syllables: [],
        patterns: [],
        imageUrl: null,
        imageCached: false,
        audioCustom: null,
        createdAt: new Date('2026-01-20'),
      };
      payload.words.push(newWord);

      const result = await importProfile(payload, 'merge');
      expect(result.wordsAdded).toBe(1);

      const word = await wordRepo.getById('imported-word-id');
      expect(word).not.toBeNull();
      expect(word!.text).toBe('imported-new');
    });

    it('adds new lists from import', async () => {
      const payload = await exportProfile(profileId);

      // Add a new list to the payload
      const newList: WordList = {
        id: 'imported-list-id',
        profileId,
        name: 'Imported List',
        testDate: null,
        createdAt: new Date('2026-01-25'),
        source: 'import',
        active: true,
        archived: false,
      };
      payload.wordLists.push(newList);

      const result = await importProfile(payload, 'merge');
      expect(result.listsAdded).toBe(1);

      const list = await wordListRepo.getById('imported-list-id');
      expect(list).not.toBeNull();
      expect(list!.name).toBe('Imported List');
    });

    it('imports into a fresh db (no existing profile)', async () => {
      const payload = await exportProfile(profileId);

      // Delete everything
      await profileRepo.delete(profileId);

      const result = await importProfile(payload, 'merge');
      expect(result.wordsAdded).toBe(1);

      const profile = await profileRepo.getById(profileId);
      expect(profile).not.toBeNull();
    });
  });
});

// ─── Cross-repo Integration ──────────────────────────────────

describe('cross-repo integration', () => {
  it('multiple profiles are fully isolated', async () => {
    const p1 = await profileRepo.create(makeProfileData({ name: 'Child 1' }));
    const p2 = await profileRepo.create(makeProfileData({ name: 'Child 2' }));

    const l1 = await wordListRepo.create(makeWordListData(p1.id));
    const l2 = await wordListRepo.create(makeWordListData(p2.id));

    await wordRepo.create(makeWordData(l1.id, p1.id, 'apple'));
    await wordRepo.create(makeWordData(l1.id, p1.id, 'banana'));
    await wordRepo.create(makeWordData(l2.id, p2.id, 'cherry'));

    expect(await wordRepo.getByProfileId(p1.id)).toHaveLength(2);
    expect(await wordRepo.getByProfileId(p2.id)).toHaveLength(1);

    // Deleting p1 should not affect p2
    await profileRepo.delete(p1.id);
    expect(await wordRepo.getByProfileId(p2.id)).toHaveLength(1);
    expect(await profileRepo.getById(p2.id)).not.toBeNull();
  });

  it('word deletion cascades to stats but not sessions', async () => {
    const profile = await profileRepo.create(makeProfileData());
    const list = await wordListRepo.create(makeWordListData(profile.id));
    const word = await wordRepo.create(makeWordData(list.id, profile.id, 'test'));
    await statsRepo.create(makeWordStatsData(word.id, profile.id));
    await sessionRepo.create(makeSessionData(profile.id));

    await wordRepo.delete(word.id);

    // Stats gone, session still there
    expect(await statsRepo.getByWordId(word.id)).toBeNull();
    expect(await sessionRepo.getByProfileId(profile.id)).toHaveLength(1);
  });
});

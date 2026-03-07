import Dexie, { type Table } from 'dexie';
import type {
  Profile,
  WordList,
  Word,
  WordStats,
  SessionLog,
  StreakData,
  SyncQueueItem,
  ActivityProgress,
  WordLearningProgress,
  CoinBalance,
} from '../contracts/types';

export class SpellForgeDB extends Dexie {
  profiles!: Table<Profile, string>;
  wordLists!: Table<WordList, string>;
  words!: Table<Word, string>;
  wordStats!: Table<WordStats, string>;
  sessionLogs!: Table<SessionLog, string>;
  streaks!: Table<StreakData, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  activityProgress!: Table<ActivityProgress, string>;
  learningProgress!: Table<WordLearningProgress, string>;
  coinBalances!: Table<CoinBalance, string>;

  constructor() {
    super('SpellForgeDB');

    this.version(1).stores({
      profiles: 'id, name',
      wordLists: 'id, profileId, [profileId+active], [profileId+archived]',
      words: 'id, listId, profileId, [profileId+listId], text',
      wordStats: 'id, wordId, profileId, [profileId+currentBucket], [profileId+nextReviewDate]',
      sessionLogs: 'id, profileId, startedAt',
      streaks: 'profileId',
      syncQueue: 'id, [type+synced], synced',
    });

    this.version(2).stores({
      profiles: 'id, name',
      wordLists: 'id, profileId, [profileId+active], [profileId+archived]',
      words: 'id, listId, profileId, [profileId+listId], text',
      wordStats: 'id, wordId, profileId, [profileId+currentBucket], [profileId+nextReviewDate]',
      sessionLogs: 'id, profileId, startedAt',
      streaks: 'profileId',
      syncQueue: 'id, [type+synced], synced',
      activityProgress: 'id, profileId, [profileId+activityType]',
    });

    this.version(3).stores({
      profiles: 'id, name',
      wordLists: 'id, profileId, [profileId+active], [profileId+archived]',
      words: 'id, listId, profileId, [profileId+listId], text',
      wordStats: 'id, wordId, profileId, [profileId+currentBucket], [profileId+nextReviewDate]',
      sessionLogs: 'id, profileId, startedAt',
      streaks: 'profileId',
      syncQueue: 'id, [type+synced], synced',
      activityProgress: 'id, profileId, [profileId+activityType]',
      learningProgress: 'id, profileId, wordId, wordListId, [profileId+wordListId], [profileId+mastered]',
    });

    this.version(4).stores({
      profiles: 'id, name',
      wordLists: 'id, profileId, [profileId+active], [profileId+archived]',
      words: 'id, listId, profileId, [profileId+listId], text',
      wordStats: 'id, wordId, profileId, [profileId+currentBucket], [profileId+nextReviewDate]',
      sessionLogs: 'id, profileId, startedAt',
      streaks: 'profileId',
      syncQueue: 'id, [type+synced], synced',
      activityProgress: 'id, profileId, [profileId+activityType]',
      learningProgress: 'id, profileId, wordId, wordListId, [profileId+wordListId], [profileId+mastered]',
      coinBalances: 'profileId',
    });
  }
}

export const db = new SpellForgeDB();

/**
 * Explicitly open the database with blocked-event handling.
 * Returns a promise that resolves when open, or rejects on error.
 * The `onBlocked` callback fires if another tab holds an older version open.
 */
export function openDatabase(onBlocked?: () => void): Promise<void> {
  db.on('blocked', () => {
    onBlocked?.();
  });

  return db.open().then(() => { /* opened successfully */ });
}

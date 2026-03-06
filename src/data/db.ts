import Dexie, { type Table } from 'dexie';
import type {
  Profile,
  WordList,
  Word,
  WordStats,
  SessionLog,
  StreakData,
  SyncQueueItem,
} from '../contracts/types';

export class SpellForgeDB extends Dexie {
  profiles!: Table<Profile, string>;
  wordLists!: Table<WordList, string>;
  words!: Table<Word, string>;
  wordStats!: Table<WordStats, string>;
  sessionLogs!: Table<SessionLog, string>;
  streaks!: Table<StreakData, string>;
  syncQueue!: Table<SyncQueueItem, string>;

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
  }
}

export const db = new SpellForgeDB();

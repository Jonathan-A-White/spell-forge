import { db } from './db';
import { profileRepo, wordListRepo, wordRepo, statsRepo, sessionRepo, streakRepo, activityProgressRepo, learningProgressRepo, coinRepo } from './repositories';
import type { ExportPayload, ImportStrategy, ImportResult } from '../contracts/types';

const EXPORT_VERSION = '1.0.0';

// ISO 8601 date pattern for JSON reviver
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?$/;

/**
 * JSON reviver that converts ISO-8601 date strings back to Date objects.
 * Without this, dates round-tripped through JSON become strings and
 * break any code that calls Date methods on them.
 */
function dateReviver(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && ISO_DATE_RE.test(value)) {
    return new Date(value);
  }
  return value;
}

/**
 * Parse a JSON export string, restoring Date objects that were
 * serialised as ISO strings by JSON.stringify.
 */
export function parseExportJson(text: string): ExportPayload {
  return JSON.parse(text, dateReviver) as ExportPayload;
}

export async function exportProfile(profileId: string): Promise<ExportPayload> {
  const profile = await profileRepo.getById(profileId);
  if (!profile) throw new Error(`Profile ${profileId} not found`);

  const wordLists = await wordListRepo.getByProfileId(profileId);
  const words = await wordRepo.getByProfileId(profileId);
  const wordStats = await statsRepo.getByProfileId(profileId);
  const sessionLogs = await sessionRepo.getByProfileId(profileId);
  const streakData = await streakRepo.get(profileId) ?? {
    profileId,
    currentStreak: 0,
    longestStreak: 0,
    lastSessionDate: null,
    weeklyProgress: [],
  };
  const activityProgress = await activityProgressRepo.getAllForProfile(profileId);
  const learningProgress = await learningProgressRepo.getByProfileId(profileId);
  const coinBalance = await coinRepo.get(profileId) ?? null;

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date(),
    profile,
    wordLists,
    words,
    wordStats,
    sessionLogs,
    streakData,
    activityProgress,
    learningProgress,
    coinBalance,
  };
}

export async function importProfile(
  payload: ExportPayload,
  strategy: ImportStrategy,
): Promise<ImportResult> {
  if (strategy === 'replace') {
    return importReplace(payload);
  }
  return importMerge(payload);
}

async function importReplace(payload: ExportPayload): Promise<ImportResult> {
  const profileId = payload.profile.id;

  await db.transaction('rw', [db.profiles, db.wordLists, db.words, db.wordStats, db.sessionLogs, db.streaks, db.activityProgress, db.learningProgress, db.coinBalances], async () => {
    // Clear all existing data for this profile
    await db.wordStats.where('profileId').equals(profileId).delete();
    await db.words.where('profileId').equals(profileId).delete();
    await db.wordLists.where('profileId').equals(profileId).delete();
    await db.sessionLogs.where('profileId').equals(profileId).delete();
    await db.streaks.where('profileId').equals(profileId).delete();
    await db.activityProgress.where('profileId').equals(profileId).delete();
    await db.learningProgress.where('profileId').equals(profileId).delete();
    await db.coinBalances.delete(profileId);
    await db.profiles.delete(profileId);

    // Insert all imported data
    await db.profiles.add(payload.profile);
    if (payload.wordLists.length) await db.wordLists.bulkAdd(payload.wordLists);
    if (payload.words.length) await db.words.bulkAdd(payload.words);
    if (payload.wordStats.length) await db.wordStats.bulkAdd(payload.wordStats);
    if (payload.sessionLogs.length) await db.sessionLogs.bulkAdd(payload.sessionLogs);
    await db.streaks.put(payload.streakData);
    if (payload.activityProgress.length) await db.activityProgress.bulkAdd(payload.activityProgress);
    if (payload.learningProgress.length) await db.learningProgress.bulkAdd(payload.learningProgress);
    if (payload.coinBalance) await db.coinBalances.put(payload.coinBalance);
  });

  return {
    profileId,
    wordsAdded: payload.words.length,
    wordsUpdated: 0,
    wordsPreserved: 0,
    listsAdded: payload.wordLists.length,
    strategy: 'replace',
  };
}

async function importMerge(payload: ExportPayload): Promise<ImportResult> {
  const profileId = payload.profile.id;
  let wordsAdded = 0;
  let wordsUpdated = 0;
  let wordsPreserved = 0;
  let listsAdded = 0;

  await db.transaction('rw', [db.profiles, db.wordLists, db.words, db.wordStats, db.sessionLogs, db.streaks, db.activityProgress, db.learningProgress, db.coinBalances], async () => {
    // Profile: import wins
    const existingProfile = await db.profiles.get(profileId);
    if (existingProfile) {
      await db.profiles.put(payload.profile);
    } else {
      await db.profiles.add(payload.profile);
    }

    // Word lists: import wins on conflict, add new
    const existingLists = await db.wordLists.where('profileId').equals(profileId).toArray();
    const existingListIds = new Set(existingLists.map(l => l.id));

    for (const list of payload.wordLists) {
      if (existingListIds.has(list.id)) {
        await db.wordLists.put(list);
      } else {
        await db.wordLists.add(list);
        listsAdded++;
      }
    }

    // Words: import wins on conflict, new words added, existing-only preserved
    const existingWords = await db.words.where('profileId').equals(profileId).toArray();
    const existingWordIds = new Set(existingWords.map(w => w.id));
    const importedWordIds = new Set(payload.words.map(w => w.id));

    for (const word of payload.words) {
      if (existingWordIds.has(word.id)) {
        await db.words.put(word);
        wordsUpdated++;
      } else {
        await db.words.add(word);
        wordsAdded++;
      }
    }

    // Count words that exist only locally
    for (const eid of existingWordIds) {
      if (!importedWordIds.has(eid)) {
        wordsPreserved++;
      }
    }

    // Stats: import wins on conflict
    for (const stat of payload.wordStats) {
      const existing = await db.wordStats.get(stat.id);
      if (existing) {
        await db.wordStats.put(stat);
      } else {
        await db.wordStats.add(stat);
      }
    }

    // Session logs: add any that don't exist
    for (const session of payload.sessionLogs) {
      const existing = await db.sessionLogs.get(session.id);
      if (!existing) {
        await db.sessionLogs.add(session);
      }
    }

    // Streak: import wins
    await db.streaks.put(payload.streakData);

    // Activity progress: import wins on conflict
    for (const ap of payload.activityProgress) {
      await db.activityProgress.put(ap);
    }

    // Learning progress: import wins on conflict
    for (const lp of payload.learningProgress) {
      await db.learningProgress.put(lp);
    }

    // Coin balance: import wins
    if (payload.coinBalance) {
      await db.coinBalances.put(payload.coinBalance);
    }
  });

  return {
    profileId,
    wordsAdded,
    wordsUpdated,
    wordsPreserved,
    listsAdded,
    strategy: 'merge',
  };
}

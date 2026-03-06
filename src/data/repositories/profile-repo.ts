import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import type { Profile } from '../../contracts/types';

export const profileRepo = {
  async create(data: Omit<Profile, 'id'>): Promise<Profile> {
    const profile: Profile = { ...data, id: uuidv4() };
    await db.profiles.add(profile);
    return profile;
  },

  async getById(id: string): Promise<Profile | null> {
    const profile = await db.profiles.get(id);
    return profile ?? null;
  },

  async getAll(): Promise<Profile[]> {
    return db.profiles.toArray();
  },

  async update(id: string, data: Partial<Profile>): Promise<Profile> {
    await db.profiles.update(id, data);
    const updated = await db.profiles.get(id);
    if (!updated) throw new Error(`Profile ${id} not found`);
    return updated;
  },

  async delete(id: string): Promise<void> {
    await db.transaction('rw', [db.profiles, db.wordLists, db.words, db.wordStats, db.sessionLogs, db.streaks], async () => {
      await db.wordStats.where('profileId').equals(id).delete();
      await db.words.where('profileId').equals(id).delete();
      await db.wordLists.where('profileId').equals(id).delete();
      await db.sessionLogs.where('profileId').equals(id).delete();
      await db.streaks.where('profileId').equals(id).delete();
      await db.profiles.delete(id);
    });
  },

  async clearData(id: string): Promise<void> {
    await db.transaction('rw', [db.wordStats, db.sessionLogs, db.streaks], async () => {
      await db.wordStats.where('profileId').equals(id).delete();
      await db.sessionLogs.where('profileId').equals(id).delete();
      await db.streaks.where('profileId').equals(id).delete();
    });
  },
};

import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import type { Profile, ProfileStatus } from '../../contracts/types';

export const profileRepo = {
  async create(data: Omit<Profile, 'id'>): Promise<Profile> {
    const profile: Profile = { ...data, id: uuidv4(), status: data.status ?? 'active' };
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

  /** Returns profiles that are active (or have no status for backward compat). */
  async getActive(): Promise<Profile[]> {
    const all = await db.profiles.toArray();
    return all.filter((p) => !p.status || p.status === 'active');
  },

  /** Returns profiles with 'archived' status. */
  async getArchived(): Promise<Profile[]> {
    const all = await db.profiles.toArray();
    return all.filter((p) => p.status === 'archived');
  },

  async update(id: string, data: Partial<Profile>): Promise<Profile> {
    await db.profiles.update(id, data);
    const updated = await db.profiles.get(id);
    if (!updated) throw new Error(`Profile ${id} not found`);
    return updated;
  },

  /** Soft-archive a profile (preserves all data). */
  async archive(id: string): Promise<Profile> {
    return profileRepo.update(id, { status: 'archived' as ProfileStatus });
  },

  /** Restore an archived or deleted profile back to active. */
  async restore(id: string): Promise<Profile> {
    return profileRepo.update(id, { status: 'active' as ProfileStatus });
  },

  /** Permanently delete a profile and all its data. */
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

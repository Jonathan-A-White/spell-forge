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
    if (!profile) return null;
    return { ...profile, gradeGoal: profile.gradeGoal ?? 100 };
  },

  async getAll(): Promise<Profile[]> {
    const profiles = await db.profiles.toArray();
    return profiles.map((p) => ({ ...p, gradeGoal: p.gradeGoal ?? 100 }));
  },

  /** Returns profiles that are active (or have no status for backward compat). */
  async getActive(): Promise<Profile[]> {
    const all = await db.profiles.toArray();
    return all.filter((p) => !p.status || p.status === 'active').map((p) => ({ gradeGoal: 100, ...p }));
  },

  /** Returns profiles with 'archived' status. */
  async getArchived(): Promise<Profile[]> {
    const all = await db.profiles.toArray();
    return all.filter((p) => p.status === 'archived').map((p) => ({ gradeGoal: 100, ...p }));
  },

  async update(id: string, data: Partial<Profile>): Promise<Profile> {
    await db.profiles.update(id, data);
    const updated = await db.profiles.get(id);
    if (!updated) throw new Error(`Profile ${id} not found`);
    return { gradeGoal: 100, ...updated };
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
    await db.transaction('rw', [db.profiles, db.wordLists, db.words, db.wordStats, db.sessionLogs, db.streaks, db.testResults], async () => {
      await db.wordStats.where('profileId').equals(id).delete();
      await db.words.where('profileId').equals(id).delete();
      await db.wordLists.where('profileId').equals(id).delete();
      await db.sessionLogs.where('profileId').equals(id).delete();
      await db.streaks.where('profileId').equals(id).delete();
      await db.testResults.where('profileId').equals(id).delete();
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

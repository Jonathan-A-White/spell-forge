import { db } from '../db';
import type { ThemeProgress, CompletedCreature } from '../../contracts/types';

function makeProgressId(profileId: string, themeId: string): string {
  return `${profileId}:${themeId}`;
}

export const themeProgressRepo = {
  async saveProgress(
    profileId: string,
    themeId: string,
    totalProgress: number,
  ): Promise<void> {
    const id = makeProgressId(profileId, themeId);
    const record: ThemeProgress = {
      id,
      profileId,
      themeId,
      totalProgress,
      updatedAt: new Date(),
    };
    await db.themeProgress.put(record);
  },

  async getProgress(
    profileId: string,
    themeId: string,
  ): Promise<number> {
    const id = makeProgressId(profileId, themeId);
    const record = await db.themeProgress.get(id);
    return record?.totalProgress ?? 0;
  },

  async getAllForProfile(profileId: string): Promise<ThemeProgress[]> {
    return db.themeProgress.where('profileId').equals(profileId).toArray();
  },

  async deleteForProfile(profileId: string): Promise<void> {
    await db.themeProgress.where('profileId').equals(profileId).delete();
  },

  async saveCreature(creature: CompletedCreature): Promise<void> {
    await db.completedCreatures.put(creature);
  },

  async getCreatures(profileId: string): Promise<CompletedCreature[]> {
    return db.completedCreatures.where('profileId').equals(profileId).toArray();
  },

  async deleteCreaturesForProfile(profileId: string): Promise<void> {
    await db.completedCreatures.where('profileId').equals(profileId).delete();
  },
};

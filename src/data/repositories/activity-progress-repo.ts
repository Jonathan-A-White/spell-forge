import { db } from '../db';
import type { ActivityProgress, ActivityType } from '../../contracts/types';

function makeId(profileId: string, activityType: ActivityType): string {
  return `${profileId}:${activityType}`;
}

export const activityProgressRepo = {
  async save(
    profileId: string,
    activityType: ActivityType,
    state: Record<string, unknown>,
  ): Promise<ActivityProgress> {
    const id = makeId(profileId, activityType);
    const record: ActivityProgress = {
      id,
      profileId,
      activityType,
      savedAt: new Date(),
      state,
    };
    await db.activityProgress.put(record);
    return record;
  },

  async get(
    profileId: string,
    activityType: ActivityType,
  ): Promise<ActivityProgress | null> {
    const id = makeId(profileId, activityType);
    const record = await db.activityProgress.get(id);
    return record ?? null;
  },

  async clear(
    profileId: string,
    activityType: ActivityType,
  ): Promise<void> {
    const id = makeId(profileId, activityType);
    await db.activityProgress.delete(id);
  },

  async clearAllForProfile(profileId: string): Promise<void> {
    await db.activityProgress.where('profileId').equals(profileId).delete();
  },
};

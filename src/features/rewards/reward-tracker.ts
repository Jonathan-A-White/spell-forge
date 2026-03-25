import type { AppEvent, RewardEvent } from '../../contracts/types.ts';
import { themeEngine } from '../../themes/engine.ts';
import { monsterCollection } from './monster-collection.ts';
import { themeProgressRepo } from '../../data/repositories/theme-progress-repo.ts';

interface ProfileProgress {
  themeId: string;
  totalProgress: number;
}

const progressStore: Map<string, ProfileProgress> = new Map();

function getProfileKey(profileId: string, themeId: string): string {
  return `${profileId}:${themeId}`;
}

function getProgress(profileId: string, themeId: string): number {
  const key = getProfileKey(profileId, themeId);
  return progressStore.get(key)?.totalProgress ?? 0;
}

function setProgress(profileId: string, themeId: string, progress: number): void {
  const key = getProfileKey(profileId, themeId);
  progressStore.set(key, { themeId, totalProgress: progress });
  // Persist to IndexedDB (fire-and-forget to avoid blocking the UI)
  themeProgressRepo.saveProgress(profileId, themeId, progress).catch(() => {
    // Silently ignore DB errors — in-memory state is still correct
  });
}

function processEvent(profileId: string, themeId: string, event: AppEvent): RewardEvent {
  const currentProgress = getProgress(profileId, themeId);
  const reward = themeEngine.calculateReward(event, themeId, currentProgress);
  setProgress(profileId, themeId, reward.totalProgress);

  // When a creature is completed, open a pack of 3 and reset progress
  if (reward.creatureCompleted) {
    const maxProgress = themeEngine.getMaxProgress(themeId);
    const pack = monsterCollection.openPack(profileId, themeId, maxProgress);
    setProgress(profileId, themeId, 0);
    reward.packEarned = pack;
  }

  return reward;
}

function getMilestoneStatus(profileId: string, themeId: string) {
  const progress = getProgress(profileId, themeId);
  return themeEngine.getMilestoneStatus(themeId, progress);
}

function resetProgress(profileId: string, themeId: string): void {
  const key = getProfileKey(profileId, themeId);
  progressStore.delete(key);
}

function resetAll(): void {
  progressStore.clear();
}

/**
 * Load persisted progress from IndexedDB into the in-memory store.
 * Call this when selecting / switching profiles.
 */
async function hydrateProfile(profileId: string): Promise<void> {
  const records = await themeProgressRepo.getAllForProfile(profileId);
  for (const rec of records) {
    const key = getProfileKey(rec.profileId, rec.themeId);
    progressStore.set(key, { themeId: rec.themeId, totalProgress: rec.totalProgress });
  }
}

export const rewardTracker = {
  getProgress,
  setProgress,
  processEvent,
  getMilestoneStatus,
  resetProgress,
  resetAll,
  hydrateProfile,
} as const;

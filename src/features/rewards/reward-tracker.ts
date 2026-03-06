import type { AppEvent, RewardEvent } from '../../contracts/types.ts';
import { themeEngine } from '../../themes/engine.ts';

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
}

function processEvent(profileId: string, themeId: string, event: AppEvent): RewardEvent {
  const currentProgress = getProgress(profileId, themeId);
  const reward = themeEngine.calculateReward(event, themeId, currentProgress);
  setProgress(profileId, themeId, reward.totalProgress);
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

export const rewardTracker = {
  getProgress,
  setProgress,
  processEvent,
  getMilestoneStatus,
  resetProgress,
  resetAll,
} as const;

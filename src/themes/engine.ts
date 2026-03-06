import type { Theme, AppEvent, RewardEvent } from '../contracts/types.ts';
import { dragonForgeTheme } from './dragon-forge/theme.ts';
import { monsterLabTheme } from './monster-lab/theme.ts';
import { starTrailTheme } from './star-trail/theme.ts';

export interface MilestoneStatus {
  current: string;
  next: string | null;
  progressToNext: number;
}

const UNITS_PER_MILESTONE = 10;

const themeRegistry: Map<string, Theme> = new Map([
  [dragonForgeTheme.id, dragonForgeTheme],
  [monsterLabTheme.id, monsterLabTheme],
  [starTrailTheme.id, starTrailTheme],
]);

function getTheme(id: string): Theme {
  const theme = themeRegistry.get(id);
  if (!theme) {
    throw new Error(`Theme not found: ${id}`);
  }
  return theme;
}

function getAllThemes(): Theme[] {
  return Array.from(themeRegistry.values());
}

function calculateReward(event: AppEvent, themeId: string, currentProgress: number): RewardEvent {
  const theme = getTheme(themeId);
  const mechanic = theme.rewardMechanic;

  let unitsEarned = 0;

  switch (event.type) {
    case 'word:attempted':
      if (event.payload.correct) {
        unitsEarned = mechanic.progressPerCorrect;
      }
      break;

    case 'session:ended':
      unitsEarned = mechanic.progressPerSession;
      break;

    case 'streak:updated':
      unitsEarned = event.payload.currentStreak;
      break;

    default:
      break;
  }

  const newProgress = currentProgress + unitsEarned;
  const previousMilestoneIndex = getMilestoneIndex(mechanic.milestoneNames, currentProgress);
  const newMilestoneIndex = getMilestoneIndex(mechanic.milestoneNames, newProgress);

  const milestoneReached =
    newMilestoneIndex > previousMilestoneIndex && newMilestoneIndex < mechanic.milestoneNames.length
      ? mechanic.milestoneNames[newMilestoneIndex]
      : null;

  return {
    themeId: theme.id,
    unitsEarned,
    milestoneReached,
    totalProgress: newProgress,
  };
}

function getMilestoneIndex(milestoneNames: string[], progress: number): number {
  const maxIndex = milestoneNames.length - 1;
  const index = Math.floor(progress / UNITS_PER_MILESTONE);
  return Math.min(index, maxIndex);
}

function getMilestoneStatus(themeId: string, totalProgress: number): MilestoneStatus {
  const theme = getTheme(themeId);
  const milestones = theme.rewardMechanic.milestoneNames;
  const currentIndex = getMilestoneIndex(milestones, totalProgress);
  const current = milestones[currentIndex] ?? milestones[0];
  const nextIndex = currentIndex + 1;
  const next = nextIndex < milestones.length ? milestones[nextIndex] : null;
  const progressIntoCurrentMilestone = totalProgress - currentIndex * UNITS_PER_MILESTONE;
  const progressToNext = next !== null ? UNITS_PER_MILESTONE - progressIntoCurrentMilestone : 0;

  return { current, next, progressToNext };
}

export const themeEngine = {
  getTheme,
  getAllThemes,
  calculateReward,
  getMilestoneStatus,
  UNITS_PER_MILESTONE,
} as const;

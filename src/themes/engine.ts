import type { Theme, AppEvent, RewardEvent } from '../contracts/types.ts';
import type { AgeStyle } from '../look/age-style.ts';
import { dragonForgeTheme } from './dragon-forge/theme.ts';
import { monsterLabTheme } from './monster-lab/theme.ts';
import { starTrailTheme } from './star-trail/theme.ts';

interface MilestoneStatus {
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
    // Fall back to dragon-forge so a corrupt/unknown themeId never
    // crashes the app (previously threw, causing a blank screen).
    return themeRegistry.get(dragonForgeTheme.id)!;
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

  const maxProgress = mechanic.milestoneNames.length * UNITS_PER_MILESTONE;
  const wasComplete = currentProgress >= maxProgress;
  const isNowComplete = newProgress >= maxProgress;
  const creatureCompleted = !wasComplete && isNowComplete;

  return {
    themeId: theme.id,
    unitsEarned,
    milestoneReached,
    totalProgress: newProgress,
    creatureCompleted,
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

/**
 * Applies the theme palette as CSS custom properties so the UI
 * visually reflects the selected theme.  Only overrides accent /
 * primary colours — contrast-mode rules still control text and
 * background for accessibility.
 */
function applyThemePalette(themeId: string): void {
  const theme = getTheme(themeId);
  const el = document.documentElement;
  const p = theme.palette;

  el.style.setProperty('--sf-color-primary', p.primary);
  el.style.setProperty('--sf-color-primary-hover', adjustBrightness(p.primary, -20));
  el.style.setProperty('--sf-color-primary-text', contrastText(p.primary));
  el.style.setProperty('--sf-color-track-fill', p.primary);
  el.style.setProperty('--sf-color-secondary', p.secondary);
  el.style.setProperty('--sf-color-secondary-hover', adjustBrightness(p.secondary, -20));
  el.style.setProperty('--sf-color-accent', p.accent);
  el.style.setProperty('--sf-color-accent-hover', adjustBrightness(p.accent, -20));

  // Visual effects
  const vfx = theme.visualEffects;
  el.style.setProperty('--sf-gradient', vfx.gradient);
  el.style.setProperty('--sf-glow-color', vfx.glowColor);
  el.style.setProperty('--sf-shadow-color', vfx.shadowColor);
  el.style.setProperty('--sf-progress-gradient', vfx.progressGradient);
  el.style.setProperty('--sf-particle-1', vfx.particleColors[0]);
  el.style.setProperty('--sf-particle-2', vfx.particleColors[1]);
  el.style.setProperty('--sf-particle-3', vfx.particleColors[2] ?? vfx.particleColors[1]);

  el.setAttribute('data-spell-theme', themeId);
}

/**
 * The tokens of each look (src/look/age-style.ts), as CSS custom properties: how round, how roomy and how heavy the screens are.
 * Young is rounder, roomier and bolder; teen is tighter and plainer; unknown sits between. They do not depend on the theme,
 * which owns colour; index.css reads them (--sf-radius-card and the rest) so a screen takes the look without knowing it.
 */
const AGE_TOKENS: Record<AgeStyle, Readonly<Record<string, string>>> = {
  young: { '--sf-radius-card': '1.5rem', '--sf-radius-control': '1rem', '--sf-space-section': '1.5rem', '--sf-heading-weight': '800' },
  teen: { '--sf-radius-card': '0.75rem', '--sf-radius-control': '0.5rem', '--sf-space-section': '1rem', '--sf-heading-weight': '600' },
  unknown: { '--sf-radius-card': '1rem', '--sf-radius-control': '0.75rem', '--sf-space-section': '1.25rem', '--sf-heading-weight': '700' },
};

function getAgeTokens(look: AgeStyle): Readonly<Record<string, string>> {
  return AGE_TOKENS[look];
}

/** Sets the look's tokens on the document, beside the theme's palette. */
function applyAgeTokens(look: AgeStyle): void {
  const el = document.documentElement;
  for (const [name, value] of Object.entries(getAgeTokens(look))) el.style.setProperty(name, value);
}

/** Darken / lighten a hex colour by `amount` (negative = darker). */
function adjustBrightness(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Return white or black depending on which contrasts better with `hex`. */
function contrastText(hex: string): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  // W3C relative luminance simplified
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

function getVisualEffects(themeId: string) {
  return getTheme(themeId).visualEffects;
}

function getMaxProgress(themeId: string): number {
  const theme = getTheme(themeId);
  return theme.rewardMechanic.milestoneNames.length * UNITS_PER_MILESTONE;
}

export const themeEngine = {
  getTheme,
  getAllThemes,
  calculateReward,
  getMilestoneStatus,
  getMaxProgress,
  getVisualEffects,
  applyThemePalette,
  getAgeTokens,
  applyAgeTokens,
  UNITS_PER_MILESTONE,
} as const;

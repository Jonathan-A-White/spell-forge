// src/features/practice/relay-race-logic.ts — Pure logic for Word Relay Race (testable, no React)

// ─── Difficulty ─────────────────────────────────────────────

export type RaceDifficulty = 'easy' | 'medium' | 'hard';

/** Bot speed config per difficulty (time per word in ms, with variance) */
interface BotSpeedConfig {
  baseTimeMs: number;
  varianceMs: number;
  /** Probability the bot "stumbles" on a word (0-1) */
  stumbleChance: number;
  stumblePenaltyMs: number;
}

const BOT_SPEED: Record<RaceDifficulty, BotSpeedConfig> = {
  easy: { baseTimeMs: 5000, varianceMs: 2000, stumbleChance: 0.3, stumblePenaltyMs: 3000 },
  medium: { baseTimeMs: 3500, varianceMs: 1500, stumbleChance: 0.15, stumblePenaltyMs: 2000 },
  hard: { baseTimeMs: 2000, varianceMs: 1000, stumbleChance: 0.05, stumblePenaltyMs: 1000 },
};

// ─── Bot Racer ──────────────────────────────────────────────

export interface BotRacer {
  name: string;
  avatar: string;
  /** Per-theme avatar overrides: { 'dragon-forge': '🐉', ... } */
  themeAvatars: Record<string, string>;
  /** Pre-computed schedule: cumulative ms when bot finishes each word */
  schedule: number[];
  /** Whether bot won */
  finished: boolean;
}

/** Bot name pools per theme */
const BOT_NAMES: Record<string, string[]> = {
  'dragon-forge': ['Ember', 'Blaze', 'Cinder', 'Scorch', 'Flare', 'Pyra'],
  'monster-lab': ['Sparky', 'Oozy', 'Glitch', 'Bloop', 'Zappy', 'Fizz'],
  'star-trail': ['Nova', 'Cosmo', 'Orbit', 'Stella', 'Astro', 'Nebula'],
};

const BOT_AVATARS: Record<string, string[]> = {
  'dragon-forge': ['🐉', '🔥', '🐲', '💥', '⚡', '🌋'],
  'monster-lab': ['👾', '🧪', '🦠', '🤖', '👽', '🧬'],
  'star-trail': ['🚀', '🌟', '☄️', '🛸', '🪐', '💫'],
};

const DEFAULT_NAMES = ['Speedy', 'Flash', 'Dash', 'Turbo', 'Bolt', 'Zoom'];
const DEFAULT_AVATARS = ['🏃', '⚡', '💨', '🎯', '🏅', '🌀'];

/** Create bot racers with pre-computed word completion schedules */
export function createBotRacers(
  totalWords: number,
  difficulty: RaceDifficulty,
  themeId: string,
  count: number = 1,
): BotRacer[] {
  const config = BOT_SPEED[difficulty];
  const names = BOT_NAMES[themeId] ?? DEFAULT_NAMES;
  const avatars = BOT_AVATARS[themeId] ?? DEFAULT_AVATARS;

  return Array.from({ length: count }, (_, i) => {
    // Build cumulative schedule
    const schedule: number[] = [];
    let cumulative = 0;
    for (let w = 0; w < totalWords; w++) {
      const base = config.baseTimeMs + (Math.random() - 0.5) * config.varianceMs;
      const stumble = Math.random() < config.stumbleChance ? config.stumblePenaltyMs : 0;
      // Scale slightly per word length variance
      const wordTime = Math.max(800, base + stumble);
      cumulative += wordTime;
      schedule.push(cumulative);
    }

    return {
      name: names[i % names.length],
      avatar: avatars[i % avatars.length],
      themeAvatars: {
        'dragon-forge': BOT_AVATARS['dragon-forge'][i % BOT_AVATARS['dragon-forge'].length],
        'monster-lab': BOT_AVATARS['monster-lab'][i % BOT_AVATARS['monster-lab'].length],
        'star-trail': BOT_AVATARS['star-trail'][i % BOT_AVATARS['star-trail'].length],
      },
      schedule,
      finished: false,
    };
  });
}

/** Get how many words a bot has completed at a given elapsed time */
export function getBotProgress(bot: BotRacer, elapsedMs: number): number {
  let completed = 0;
  for (const time of bot.schedule) {
    if (elapsedMs >= time) completed++;
    else break;
  }
  return completed;
}

/** Get bot runner position as percentage */
export function getBotPosition(bot: BotRacer, elapsedMs: number, totalWords: number): number {
  const completed = getBotProgress(bot, elapsedMs);
  return calcRunnerPosition(completed, totalWords);
}

// ─── Theme Track Styles ─────────────────────────────────────

export interface TrackThemeStyle {
  trackBg: string;
  trackBorder: string;
  laneDivider: string;
  progressFill: string;
  wallpaperGradient: string;
  headerGlow: string;
  accentColor: string;
}

export function getTrackThemeStyle(themeId: string): TrackThemeStyle {
  switch (themeId) {
    case 'dragon-forge':
      return {
        trackBg: 'bg-gradient-to-r from-orange-950/80 to-red-950/80',
        trackBorder: 'border-orange-600/60',
        laneDivider: 'border-orange-700/30',
        progressFill: 'bg-gradient-to-r from-red-600 via-orange-500 to-yellow-400',
        wallpaperGradient: 'bg-gradient-to-b from-red-950 via-orange-950 to-yellow-950',
        headerGlow: 'text-orange-400',
        accentColor: '#FA8C16',
      };
    case 'monster-lab':
      return {
        trackBg: 'bg-gradient-to-r from-purple-950/80 to-indigo-950/80',
        trackBorder: 'border-purple-500/60',
        laneDivider: 'border-purple-700/30',
        progressFill: 'bg-gradient-to-r from-purple-600 via-teal-500 to-green-400',
        wallpaperGradient: 'bg-gradient-to-b from-purple-950 via-indigo-950 to-teal-950',
        headerGlow: 'text-purple-400',
        accentColor: '#722ED1',
      };
    case 'star-trail':
      return {
        trackBg: 'bg-gradient-to-r from-blue-950/80 to-indigo-950/80',
        trackBorder: 'border-blue-400/60',
        laneDivider: 'border-blue-800/30',
        progressFill: 'bg-gradient-to-r from-blue-600 via-indigo-500 to-yellow-400',
        wallpaperGradient: 'bg-gradient-to-b from-slate-950 via-blue-950 to-indigo-950',
        headerGlow: 'text-blue-300',
        accentColor: '#FAAD14',
      };
    default:
      return {
        trackBg: 'bg-gradient-to-r from-gray-800/80 to-gray-900/80',
        trackBorder: 'border-gray-600/60',
        laneDivider: 'border-gray-700/30',
        progressFill: 'bg-gradient-to-r from-emerald-600 via-green-500 to-lime-400',
        wallpaperGradient: 'bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900',
        headerGlow: 'text-emerald-400',
        accentColor: '#52C41A',
      };
  }
}

// ─── Player avatar per theme ────────────────────────────────

export function getPlayerAvatar(themeId: string): string {
  switch (themeId) {
    case 'dragon-forge': return '🗡️';
    case 'monster-lab': return '🧑‍🔬';
    case 'star-trail': return '👨‍🚀';
    default: return '🏃';
  }
}

// ─── Original helpers ───────────────────────────────────────

/** Calculate runner position as percentage (0-100) along the track */
export function calcRunnerPosition(currentIndex: number, totalWords: number): number {
  if (totalWords <= 0) return 0;
  return Math.round((currentIndex / totalWords) * 100);
}

/** Format milliseconds into a display string like "1:23.4" */
export function formatTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
  }
  return `${seconds.toFixed(1)}s`;
}

/** Calculate stumble delay in ms based on word length */
export function calcStumbleDelay(wordLength: number): number {
  return Math.min(2000, 1000 + wordLength * 50);
}

/** Determine star rating based on accuracy and whether it's a personal best */
export function calcStarRating(
  wordsCorrect: number,
  totalWords: number,
  isNewBest: boolean,
): number {
  const accuracy = totalWords > 0 ? wordsCorrect / totalWords : 0;
  if (accuracy === 1 && isNewBest) return 3;
  if (accuracy >= 0.8) return 2;
  if (accuracy >= 0.5) return 1;
  return 0;
}

/** Determine race placement string */
export function getPlacementLabel(place: number): string {
  switch (place) {
    case 1: return '1st Place!';
    case 2: return '2nd Place';
    case 3: return '3rd Place';
    default: return `${place}th Place`;
  }
}

/** Get placement emoji */
export function getPlacementEmoji(place: number): string {
  switch (place) {
    case 1: return '🏆';
    case 2: return '🥈';
    case 3: return '🥉';
    default: return '🏅';
  }
}
